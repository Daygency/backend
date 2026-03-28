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
      const cred = JSON.parse(json) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(cred),
      });
      this.logger.log('Firebase Admin initialized for FCM.');
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
  }): Promise<{ failedTokens: string[] }> {
    if (!this.isEnabled() || params.tokens.length === 0) {
      return { failedTokens: [] };
    }
    const unique = [...new Set(params.tokens)];
    const failedTokens: string[] = [];
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
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(chunk[idx]);
          } else {
            this.logger.warn(
              `FCM send failed for token index ${idx}: ${r.error?.message}`,
            );
          }
        }
      });
    }
    return { failedTokens };
  }
}
