/** 신고 누적 이 횟수 이상이면 자동 1주 정지 (기본 5) */
export const REPORT_AUTO_BAN_THRESHOLD = (() => {
  const n = parseInt(process.env.REPORT_AUTO_BAN_THRESHOLD ?? '5', 10);
  return Number.isFinite(n) && n >= 1 ? n : 5;
})();

/** 자동 정지 기간(일) — 기본 7일 */
export const REPORT_BAN_DAYS = (() => {
  const n = parseInt(process.env.REPORT_BAN_DAYS ?? '7', 10);
  return Number.isFinite(n) && n >= 1 ? n : 7;
})();

/** @deprecated REPORT_AUTO_BAN_THRESHOLD 사용 */
export const REPORT_LIMIT = REPORT_AUTO_BAN_THRESHOLD;
