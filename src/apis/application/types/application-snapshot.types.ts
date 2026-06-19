/**
 * 지원서 JSON 스냅샷 — 제출 시점에 고정 (DB row id 없음, 내용만).
 * 프로필 테이블과 필드 대응, 날짜는 ISO 8601 문자열.
 */

/** 사진·영상·파일 첨부 (한 건) */
export interface ApplicationFileSnapshotItem {
  /** 서버 업로드 파일과 매핑할 때만 */
  fileId?: string;
  url?: string;
  originalName?: string;
}

/** 학력 */
export interface ApplicationEducationSnapshotItem {
  description: string;
  startedAt: string;
  endedAt: string | null;
}

/** 경력 */
export interface ApplicationCareerSnapshotItem {
  description: string;
  startedAt: string;
  endedAt: string;
  organization?: string | null;
}

/** 수상 */
export interface ApplicationAwardSnapshotItem {
  description: string;
  awardedAt: string | null;
  organization?: string | null;
}

/** 수료증·자격증 */
export interface ApplicationCertificateSnapshotItem {
  description: string;
  obtainedAt: string | null;
  organization?: string | null;
}

export type ApplicationFileSnapshot = ApplicationFileSnapshotItem[] | null;

export type ApplicationEducationSnapshot =
  | ApplicationEducationSnapshotItem[]
  | null;

export type ApplicationCareerSnapshot = ApplicationCareerSnapshotItem[] | null;

export type ApplicationAwardSnapshot = ApplicationAwardSnapshotItem[] | null;

export type ApplicationCertificateSnapshot =
  | ApplicationCertificateSnapshotItem[]
  | null;
