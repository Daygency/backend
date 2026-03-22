import { Injectable } from '@nestjs/common';
import { File, FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { PostFileUploadItem } from '../file/types/post-file-upload-item';

/**
 * 모집공고(announcement) 게시글에 연결되는 파일 업로드·조회.
 * 게시글 `post_id`가 생긴 뒤 `attachFilesToPost`로 첨부하면 `file.type` = announcement, `target_id` = post_id.
 */
@Injectable()
export class AnnouncementFileService {
  private readonly targetType = FileTargetType.ANNOUNCEMENT;

  constructor(private readonly fileService: FileService) {}

  /** 저장된 공고 `postId`에 파일들을 순서대로 붙임 (S3 + DB) */
  async attachFilesToPost(
    postId: string,
    items: PostFileUploadItem[],
  ): Promise<File[]> {
    if (items.length === 0) {
      return [];
    }
    const saved: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      saved.push(
        await this.fileService.uploadAndSave({
          buffer: it.buffer,
          originalName: it.originalName,
          contentType: it.contentType,
          targetType: this.targetType,
          targetId: postId,
          sortOrder: it.sortOrder ?? i,
        }),
      );
    }
    return saved;
  }

  /** 해당 공고에 붙은 파일 목록 (`order` 오름차순) */
  listFilesForPost(postId: string): Promise<File[]> {
    return this.fileService.findByTarget(this.targetType, postId);
  }
}
