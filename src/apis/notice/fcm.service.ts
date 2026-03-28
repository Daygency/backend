import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length > 0) {
      return;
    }
    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!json?.trim()) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not set; FCM delivery is disabled.',
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
      this.logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', e);
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
