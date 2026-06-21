import type { Express } from 'express';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { File, FileTargetType } from '../../file/entities/file.entity';
import { FileService } from '../../file/file.service';
import { Application } from '../../application/entities/application.entity';
import type { ApplicationFileSnapshotItem } from '../../application/types/application-snapshot.types';
import { Announcement } from '../../announcement/entities/announcement.entity';
import { News } from '../../news/entities/news.entity';
import { Community } from '../../community/entities/community.entity';
import {
  UserDocumentItemDto,
  UserDocumentSource,
} from '../dto/user-document-item.dto';

const SOURCE_LABEL: Record<UserDocumentSource, string> = {
  archive: '보관함',
  application: '지원서',
  announcement: '모집공고',
  news: '공연소식',
  community: '커뮤니티',
};

@Injectable()
export class UserDocumentService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    private readonly fileService: FileService,
  ) {}

  async listMyDocuments(userId: string): Promise<UserDocumentItemDto[]> {
    const [announcements, newsRows, communities, applications, archiveFiles] =
      await Promise.all([
        this.announcementRepository.find({
          where: { userId },
          select: ['postId'],
        }),
        this.newsRepository.find({
          where: { user: { userId } },
          select: ['newsId'],
        }),
        this.communityRepository.find({
          where: { user: { userId } },
          select: ['communityId'],
        }),
        this.applicationRepository.find({
          where: { userId },
          select: ['id', 'file', 'createdAt'],
          order: { createdAt: 'DESC' },
        }),
        this.fileRepository.find({
          where: {
            targetType: FileTargetType.USER_ARCHIVE,
            targetId: userId,
          },
          order: { createdAt: 'DESC' },
        }),
      ]);

    const announcementIds = announcements.map((row) => row.postId);
    const newsIds = newsRows.map((row) => row.newsId);
    const communityIds = communities.map((row) => row.communityId);

    const postFiles =
      announcementIds.length || newsIds.length || communityIds.length
        ? await this.fileRepository.find({
            where: [
              ...(announcementIds.length
                ? [
                    {
                      targetType: FileTargetType.ANNOUNCEMENT,
                      targetId: In(announcementIds),
                    },
                  ]
                : []),
              ...(newsIds.length
                ? [{ targetType: FileTargetType.NEWS, targetId: In(newsIds) }]
                : []),
              ...(communityIds.length
                ? [
                    {
                      targetType: FileTargetType.COMMUNITY,
                      targetId: In(communityIds),
                    },
                  ]
                : []),
            ],
            order: { createdAt: 'DESC' },
          })
        : [];

    const deduped = new Map<string, UserDocumentItemDto>();

    const put = (item: UserDocumentItemDto) => {
      const key = item.fileId ?? item.url;
      if (!key || deduped.has(key)) return;
      deduped.set(key, item);
    };

    for (const file of archiveFiles) {
      put(this.fromFileRow(file, 'archive'));
    }

    for (const file of postFiles) {
      const source = this.sourceFromTargetType(file.targetType);
      if (!source) continue;
      put(this.fromFileRow(file, source));
    }

    for (const app of applications) {
      const snapshot = app.file;
      if (!Array.isArray(snapshot)) continue;
      for (let i = 0; i < snapshot.length; i++) {
        const row = snapshot[i];
        if (!row?.url?.trim()) continue;
        put(
          this.fromApplicationSnapshot(
            row,
            app.createdAt,
            `${app.id}:${i}:${row.fileId ?? row.url}`,
          ),
        );
      }
    }

    return [...deduped.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async uploadMyDocument(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UserDocumentItemDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('업로드할 file 필드가 필요합니다.');
    }

    const existingCount = await this.fileRepository.count({
      where: {
        targetType: FileTargetType.USER_ARCHIVE,
        targetId: userId,
      },
    });

    const saved = await this.fileService.uploadAndSave({
      buffer: file.buffer,
      originalName: file.originalname || 'file',
      contentType: file.mimetype,
      targetType: FileTargetType.USER_ARCHIVE,
      targetId: userId,
      sortOrder: existingCount,
    });

    return this.fromFileRow(saved, 'archive');
  }

  async deleteMyDocument(userId: string, fileId: string): Promise<void> {
    const row = await this.fileRepository.findOne({ where: { fileId } });
    if (!row) {
      throw new NotFoundException('파일을 찾을 수 없습니다.');
    }
    if (
      row.targetType !== FileTargetType.USER_ARCHIVE ||
      row.targetId !== userId
    ) {
      throw new ForbiddenException('보관함에 직접 올린 파일만 삭제할 수 있습니다.');
    }
    await this.fileService.removeFile(fileId);
  }

  private fromFileRow(
    file: File,
    source: UserDocumentSource,
  ): UserDocumentItemDto {
    return {
      id: file.fileId,
      fileId: file.fileId,
      title: file.originalName?.trim() || '제목 없음',
      url: file.imgUrl,
      source,
      sourceLabel: SOURCE_LABEL[source],
      createdAt: file.createdAt.toISOString(),
      canDelete: source === 'archive',
    };
  }

  private fromApplicationSnapshot(
    row: ApplicationFileSnapshotItem,
    createdAt: Date,
    syntheticId: string,
  ): UserDocumentItemDto {
    return {
      id: syntheticId,
      fileId: row.fileId?.trim() || null,
      title: row.originalName?.trim() || '지원서 첨부',
      url: row.url!.trim(),
      source: 'application',
      sourceLabel: SOURCE_LABEL.application,
      createdAt: createdAt.toISOString(),
      canDelete: false,
    };
  }

  private sourceFromTargetType(
    targetType: FileTargetType | null,
  ): Exclude<UserDocumentSource, 'archive' | 'application'> | null {
    switch (targetType) {
      case FileTargetType.ANNOUNCEMENT:
        return 'announcement';
      case FileTargetType.NEWS:
        return 'news';
      case FileTargetType.COMMUNITY:
        return 'community';
      default:
        return null;
    }
  }
}
