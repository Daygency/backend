/** LIKE 검색용 — `%`, `_` 와일드카드 이스케이프 */
export function escapeLikePattern(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, (m) => `\\${m}`);
}

export function toLikePattern(raw: string): string | null {
  const escaped = escapeLikePattern(raw);
  if (!escaped) return null;
  return `%${escaped}%`;
}
