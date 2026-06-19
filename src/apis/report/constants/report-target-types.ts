import { ReportTargetType } from '../entities/report.entity';

const REPORT_TARGET_TYPE_LABEL_KO: Record<ReportTargetType, string> = {
  [ReportTargetType.COMMUNITY]: '커뮤니티',
  [ReportTargetType.NEWS]: '공연소식',
  [ReportTargetType.COMMENT]: '댓글',
  [ReportTargetType.ANNOUNCEMENT]: '모집공고',
  [ReportTargetType.CHAT]: '채팅',
};

export function getReportTargetTypeLabelKo(
  targetType: ReportTargetType,
): string {
  return REPORT_TARGET_TYPE_LABEL_KO[targetType] ?? targetType;
}
