/** 목록 조회 커서 페이지네이션 공용 인코딩/디코딩. base64url(JSON) 왕복만 담당하며, 형태 검증과 에러 메시지는 호출부 책임. */
export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
