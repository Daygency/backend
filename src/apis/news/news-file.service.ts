import { Injectable } from '@nestjs/common';
import { File, FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { PostFileUploadItem } from '../file/types/post-file-upload-item';

/**
 * 공연소식(news) 게시글에 연결되는 파일 업로드·조회.
 * `news_id` 확정 후 `attachFilesToPost` → `file.type` = news, `target_id` = news_id.
 */
@Injectable()
export class NewsFileService {
  private readonly targetType = FileTargetType.NEWS;

  constructor(private readonly fileService: FileService) {}

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

  listFilesForPost(postId: string): Promise<File[]> {
    return this.fileService.findByTarget(this.targetType, postId);
  }
}
