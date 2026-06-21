/** N 배지용 — 첨부 파일 업로드 시각만 신뢰 (DB `created_at` 백필 오판 방지) */
export function resolveAnnouncementPostedAt(
  fileBasedCreatedAt?: Date,
): Date | undefined {
  return fileBasedCreatedAt;
}
