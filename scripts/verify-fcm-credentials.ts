/**
 * FCM / OAuth 진단 (백엔드 루트에서 실행)
 *
 *   cd backend && npm run verify:fcm
 *
 * - OAuth 토큰 발급이 되는지
 * - FCM send 시 "authentication credential" 오류가 나는지(= Cloud에서 FCM API 미사용 등)
 */
import { config as loadEnv } from 'dotenv';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

loadEnv({ path: path.join(__dirname, '..', '.env') });

function resolveCredentialPath(p: string): string {
  const normalized = p.trim();
  if (normalized.startsWith('~/')) {
    return path.join(os.homedir(), normalized.slice(2));
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.resolve(process.cwd(), normalized);
}

function loadServiceAccountJson(): string | null {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.fire_service_account_json?.trim() ||
    process.env.firebase_service_account_json?.trim();
  if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON 이 비어 있습니다 (.env 확인).');
    return null;
  }
  if (raw.startsWith('{')) {
    return raw;
  }
  const fp = resolveCredentialPath(raw);
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch (e) {
    console.error('서비스 계정 파일을 읽을 수 없습니다:', fp);
    console.error(e);
    return null;
  }
}

async function main(): Promise<void> {
  const json = loadServiceAccountJson();
  if (!json) {
    process.exit(1);
  }

  const parsed = JSON.parse(json) as Record<string, unknown>;
  const pkRaw =
    (typeof parsed.private_key === 'string' && parsed.private_key) ||
    (typeof parsed.privateKey === 'string' && parsed.privateKey) ||
    '';
  if (!pkRaw.includes('BEGIN PRIVATE KEY')) {
    console.error('private_key 가 유효하지 않습니다 (줄바꿈 \\n 깨짐 여부 확인).');
    process.exit(1);
  }

  const credObj = parsed as admin.ServiceAccount;
  const projectId =
    typeof parsed.project_id === 'string'
      ? parsed.project_id
      : typeof parsed.projectId === 'string'
        ? parsed.projectId
        : undefined;

  for (const app of [...admin.apps]) {
    if (app) await app.delete();
  }

  admin.initializeApp({
    credential: admin.credential.cert(credObj),
    ...(projectId ? { projectId } : {}),
  });

  const credential = admin.app().options.credential;
  if (!credential) {
    console.error('Firebase 앱에 credential 이 없습니다.');
    process.exit(1);
  }

  console.log(
    'project_id:',
    projectId ?? '(JSON에 없음 — initializeApp 옵션 확인)',
  );
  console.log('---');
  console.log('1) OAuth 액세스 토큰 발급...');

  let accessToken: string | undefined;
  try {
    const tok = await credential.getAccessToken();
    accessToken =
      typeof tok === 'object' && tok && 'access_token' in tok
        ? (tok as { access_token?: string }).access_token
        : undefined;
  } catch (e) {
    console.error('   실패 (서비스 계정 JSON/키 문제 가능):', e);
    process.exit(1);
  }

  if (!accessToken) {
    console.error('   access_token 이 비어 있습니다.');
    process.exit(1);
  }
  console.log('   OK (앞 20자:', accessToken.slice(0, 20) + '...)');
  console.log('---');
  console.log('2) FCM send (고정 더미 토큰 → 정상 시 invalid token, OAuth 문제 시 credential 오류)');

  try {
    await admin.messaging().send({
      token: '0'.repeat(140),
      notification: { title: 'verify', body: 'verify' },
    });
    console.log('   (비정상) 더미 토큰으로 성공함');
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    const msg = err.message ?? String(e);
    if (
      msg.includes('authentication credential') ||
      msg.includes('OAuth') ||
      msg.includes('invalid authentication')
    ) {
      console.error('   실패:', msg);
      console.error('');
      console.error(
        '→ 앱에서 보는 것과 같은 오류입니다. Google Cloud Console에서',
      );
      console.error(
        '   프로젝트 "' + (projectId ?? '?') + '" 에 대해',
      );
      console.error(
        '   "Firebase Cloud Messaging API" (fcm.googleapis.com) 사용 설정 후 몇 분 뒤 재시도하세요.',
      );
      process.exit(1);
    }
    if (
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/invalid-argument' ||
      /registration|Invalid.*token/i.test(msg)
    ) {
      console.log('   OK — 더미 토큰이 거절됨 (FCM 인증·API 통과).');
      return;
    }
    console.error('   code:', err.code, 'message:', msg);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
