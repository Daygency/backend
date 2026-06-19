export type UserDocumentSource =
  | 'archive'
  | 'application'
  | 'announcement'
  | 'news'
  | 'community';

export class UserDocumentItemDto {
  /** 목록 키 — fileId 또는 스냅샷 전용 synthetic id */
  id: string;
  fileId: string | null;
  title: string;
  url: string;
  source: UserDocumentSource;
  sourceLabel: string;
  createdAt: string;
  /** 보관함 직접 업로드만 삭제 가능 */
  canDelete: boolean;
}
