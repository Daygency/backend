/** 신고 누적이 이 값을 초과하면 `User.activity` 가 `FLAGGED` 로 올라간다 (기본 5 → 6번째 신고부터). */
export const REPORT_LIMIT = (() => {
  const n = parseInt(process.env.REPORT_LIMIT ?? '5', 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
})();
