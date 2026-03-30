import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import admin from 'firebase-admin';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FCM_MULTICAST_MAX_TOKENS = 500;

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
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
    if (admin.apps.length > 0) {
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

      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(json) as Parameters<typeof admin.credential.cert>[0],
        ),
        projectId,
      });
      this.logger.log(`FCM Admin SDK initialized (project: ${projectId}).`);
    } catch (e) {
      this.logger.error(
        'Failed to parse or apply Firebase service account JSON',
        e,
      );
    }
  }

  isEnabled(): boolean {
    return admin.apps.length > 0;
  }

  /**
   * 멀티캐스트: Admin SDK `sendEachForMulticast` (토큰당 최대 500건씩 배치).
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

    const messaging = admin.messaging();

    try {
      for (let i = 0; i < unique.length; i += FCM_MULTICAST_MAX_TOKENS) {
        const batch = unique.slice(i, i + FCM_MULTICAST_MAX_TOKENS);
        const response = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: params.title, body: params.body },
          data: params.data,
          android: { priority: 'high' },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        });
        successCount += response.successCount;
        failureCount += response.failureCount;
        response.responses.forEach((resp, idx: number) => {
          if (resp.success) {
            return;
          }
          const token = batch[idx];
          if (token === undefined) {
            return;
          }
          const code = resp.error?.code;
          if (code && INVALID_TOKEN_CODES.has(code)) {
            failedTokens.push(token);
            return;
          }
          const msg = String(resp.error?.message ?? 'unknown');
          const authHint =
            msg.includes('authentication credential') || msg.includes('OAuth')
              ? ' — Cloud Console에서 "Firebase Cloud Messaging API" 사용, 서비스 계정·project_id 일치 확인.'
              : '';
          this.logger.warn(
            `FCM send failed for token index ${i + idx}: ${msg}${authHint}`,
          );
        });
      }
    } catch (e) {
      this.logger.error('FCM sendEachForMulticast failed', e);
      const processed = successCount + failureCount;
      return {
        failedTokens,
        successCount,
        failureCount: failureCount + (unique.length - processed),
      };
    }

    return { failedTokens, successCount, failureCount };
  }
}
