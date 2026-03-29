import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FCM_MESSAGING_SCOPE =
  'https://www.googleapis.com/auth/firebase.messaging';

/** FCM HTTP v1: Bearer OAuth2 (Legacy `Authorization: key=...` 미사용) */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private googleAuth: GoogleAuth | null = null;
  private fcmProjectId: string | null = null;

  constructor(private readonly config: ConfigService) {}

  /** `{` 로 시작하면 JSON 문자열, 아니면 서비스 계정 파일 경로로 처리 */
  private resolveServiceAccountJsonString(): string | null {
    const raw =
      this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim() ||
      this.config.get<string>('fire_service_account_json')?.trim() ||
      this.config.get<string>('firebase_service_account_json')?.trim();
    if (!raw) {
      return null;
    }
    if (raw.startsWith('{')) {
      return raw;
    }
    const filePath = this.resolveCredentialPath(raw);
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      this.logger.error(
        `Could not read Firebase service account file: ${filePath}`,
        e,
      );
      return null;
    }
  }

  private resolveCredentialPath(p: string): string {
    const normalized = p.trim();
    if (normalized.startsWith('~/')) {
      return path.join(os.homedir(), normalized.slice(2));
    }
    if (normalized === '~') {
      return os.homedir();
    }
    if (path.isAbsolute(normalized)) {
      return normalized;
    }
    return path.resolve(process.cwd(), normalized);
  }

  onModuleInit(): void {
    const json = this.resolveServiceAccountJsonString();
    if (!json) {
      this.logger.warn(
        'Set FIREBASE_SERVICE_ACCOUNT_JSON (or fire_service_account_json): ' +
          'paste minified JSON, or a path to the *.json key file. FCM disabled.',
      );
      return;
    }
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const pkRaw =
        (typeof parsed.private_key === 'string' && parsed.private_key) ||
        (typeof parsed.privateKey === 'string' && parsed.privateKey) ||
        '';
      if (!pkRaw.includes('BEGIN PRIVATE KEY')) {
        this.logger.error(
          'Firebase service account JSON has no valid private_key. On the server, check the key file path (PM2 cwd), or env JSON escaping (\\n in private_key).',
        );
        return;
      }
      const clientEmail =
        (typeof parsed.client_email === 'string' && parsed.client_email) ||
        (typeof parsed.clientEmail === 'string' && parsed.clientEmail) ||
        '';
      if (!clientEmail) {
        this.logger.error('Service account JSON missing client_email.');
        return;
      }
      const projectId =
        typeof parsed.project_id === 'string'
          ? parsed.project_id
          : typeof parsed.projectId === 'string'
            ? parsed.projectId
            : '';
      if (!projectId) {
        this.logger.error('Service account JSON missing project_id.');
        return;
      }

      this.fcmProjectId = projectId;
      this.googleAuth = new GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: pkRaw,
        },
        projectId,
        scopes: [FCM_MESSAGING_SCOPE],
      });
      this.logger.log(
        `FCM HTTP v1 ready (OAuth Bearer, project: ${projectId}).`,
      );
    } catch (e) {
      this.logger.error('Failed to parse Firebase service account JSON', e);
    }
  }

  isEnabled(): boolean {
    return this.googleAuth != null && this.fcmProjectId != null;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.googleAuth) {
      throw new Error('FCM not configured');
    }
    const client = await this.googleAuth.getClient();
    const res = await client.getAccessToken();
    const token = res?.token;
    if (!token) {
      throw new Error('OAuth access token empty (check service account key)');
    }
    return token;
  }

  /**
   * POST `https://fcm.googleapis.com/v1/projects/{project}/messages:send`
   * Authorization: Bearer &lt;access_token&gt;
   */
  private async sendV1Single(params: {
    bearer: string;
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }): Promise<{ ok: true } | { ok: false; code?: string; message: string }> {
    const projectId = this.fcmProjectId!;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    const message: Record<string, unknown> = {
      token: params.token,
      notification: { title: params.title, body: params.body },
      data: params.data,
      android: { priority: 'HIGH' },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.bearer}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      return { ok: true };
    }
    let messageText = res.statusText;
    let statusField: string | undefined;
    try {
      const errBody = (await res.json()) as {
        error?: { message?: string; status?: string };
      };
      if (errBody?.error?.message) {
        messageText = errBody.error.message;
      }
      statusField =
        typeof errBody?.error?.status === 'string'
          ? errBody.error.status
          : undefined;
    } catch {
      try {
        messageText = await res.text();
      } catch {
        /* noop */
      }
    }
    const code =
      statusField === 'NOT_FOUND' || statusField === 'UNREGISTERED'
        ? 'messaging/registration-token-not-registered'
        : statusField === 'INVALID_ARGUMENT'
          ? 'messaging/invalid-registration-token'
          : undefined;
    return { ok: false, code, message: messageText };
  }

  /**
   * 멀티캐스트: HTTP v1은 토큰당 1회 `messages:send` (Bearer 동일, 병렬 요청).
   */
  async sendMulticast(params: {
    tokens: string[];
    title: string;
    body: string;
    data: Record<string, string>;
  }): Promise<{
    failedTokens: string[];
    successCount: number;
    failureCount: number;
  }> {
    if (!this.isEnabled() || params.tokens.length === 0) {
      return { failedTokens: [], successCount: 0, failureCount: 0 };
    }
    const unique = [...new Set(params.tokens)];
    const failedTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    let bearer: string;
    try {
      bearer = await this.getAccessToken();
    } catch (e) {
      this.logger.error('FCM OAuth token failed', e);
      return {
        failedTokens: [],
        successCount: 0,
        failureCount: unique.length,
      };
    }

    const results = await Promise.allSettled(
      unique.map((token) =>
        this.sendV1Single({
          bearer,
          token,
          title: params.title,
          body: params.body,
          data: params.data,
        }),
      ),
    );

    results.forEach((result, idx) => {
      const token = unique[idx];
      if (result.status === 'rejected') {
        failureCount += 1;
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        this.logger.warn(`FCM send failed for token index ${idx}: ${msg}`);
        return;
      }
      const r = result.value;
      if (r.ok) {
        successCount += 1;
        return;
      }
      failureCount += 1;
      const msg = r.message;
      if (
        r.code === 'messaging/invalid-registration-token' ||
        r.code === 'messaging/registration-token-not-registered'
      ) {
        failedTokens.push(token);
      } else {
        this.logger.warn(
          `FCM send failed for token index ${idx}: ${msg}` +
            (msg.includes('authentication credential') || msg.includes('OAuth')
              ? ' — Cloud Console에서 "Firebase Cloud Messaging API" 사용, 서비스 계정·project_id 일치 확인.'
              : ''),
        );
      }
    });

    return { failedTokens, successCount, failureCount };
  }
}
