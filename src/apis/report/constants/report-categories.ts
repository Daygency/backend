import { ReportCategory } from '../entities/report.entity';

/** UI 표시용 한글 (`ReportCategory` 값과 1:1) */
const REPORT_CATEGORY_LABEL_KO: Record<ReportCategory, string> = {
  [ReportCategory.HATE_OR_SLUR]: '혐오/욕설 표현',
  [ReportCategory.SPAM]: '스팸/도배',
  [ReportCategory.HARMFUL_TO_YOUTH]: '청소년 유해',
  [ReportCategory.ILLEGAL]: '불법정보 포함',
  [ReportCategory.OBSCENE]: '음란물',
  [ReportCategory.OFFENSIVE]: '불쾌한 표현',
};

/** 클라이언트 노출 순서 (README 표와 동일) */
const REPORT_CATEGORY_ORDER: readonly ReportCategory[] = [
  ReportCategory.HATE_OR_SLUR,
  ReportCategory.SPAM,
  ReportCategory.HARMFUL_TO_YOUTH,
  ReportCategory.ILLEGAL,
  ReportCategory.OBSCENE,
  ReportCategory.OFFENSIVE,
] as const;

export type ReportCategoryOption = {
  value: ReportCategory;
  labelKo: string;
};

export function getReportCategoryOptions(): ReportCategoryOption[] {
  return REPORT_CATEGORY_ORDER.map((value) => ({
    value,
    labelKo: REPORT_CATEGORY_LABEL_KO[value],
  }));
}

export function getReportCategoryLabelKo(category: ReportCategory): string {
  return REPORT_CATEGORY_LABEL_KO[category] ?? category;
}
