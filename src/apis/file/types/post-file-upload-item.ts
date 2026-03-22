/** 게시글 저장 후 같은 글에 붙일 파일들 — `targetId`는 게시글 PK */
export interface PostFileUploadItem {
  buffer: Buffer;
  originalName: string;
  contentType?: string;
  /** 생략 시 배열 인덱스(0, 1, 2 …)를 `order`로 사용 */
  sortOrder?: number;
}
