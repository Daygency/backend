import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as admin from 'firebase-admin';

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

  onModuleInit() {
    if (admin.apps.length > 0) {
      return;
    }
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
      const cred = parsed as admin.ServiceAccount;
      const projectId =
        typeof parsed.project_id === 'string'
          ? parsed.project_id
          : typeof parsed.projectId === 'string'
            ? parsed.projectId
            : undefined;
      admin.initializeApp({
        credential: admin.credential.cert(cred),
        ...(projectId ? { projectId } : {}),
      });
      this.logger.log(
        `Firebase Admin initialized for FCM${projectId ? ` (project: ${projectId})` : ''}.`,
      );
    } catch (e) {
      this.logger.error('Failed to parse Firebase service account JSON', e);
    }
  }

  isEnabled(): boolean {
    return admin.apps.length > 0;
  }

  /**
   * 멀티캐스트 전송. 실패한 토큰(unregistered 등)은 호출 측에서 정리할 수 있도록 반환.
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
    const chunkSize = 500;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const res = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
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
      res.responses.forEach((r, idx) => {
        if (r.success) {
          successCount += 1;
          return;
        }
        failureCount += 1;
        const code = r.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          failedTokens.push(chunk[idx]);
        } else {
          const msg = r.error?.message ?? '';
          this.logger.warn(
            `FCM send failed for token index ${idx}: ${msg}` +
              (msg.includes('authentication credential') || msg.includes('OAuth')
                ? ' — Google Cloud 콘솔에서 이 프로젝트에 "Firebase Cloud Messaging API" 사용 설정, 서비스 계정 JSON이 해당 프로젝트 키인지·private_key 줄바꿈(\\n)이 깨지지 않았는지 확인.'
                : ''),
          );
        }
      });
    }
    return { failedTokens, successCount, failureCount };
  }
}
