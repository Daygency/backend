import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { In, Repository } from 'typeorm';
import { File, FileTargetType } from './entities/file.entity';

/** 목록 썸네일용 — `order`(sortOrder) 최소 1건 */
export type ThumbnailPick = {
  fileId: string;
  imgUrl: string;
};

export interface UploadFileToS3Input {
  buffer: Buffer;
  originalName: string;
  contentType?: string;
  /** 첨부 대상 (nullable — 임시 업로드 등) */
  targetType: FileTargetType | null;
  targetId: string | null;
  /** 동일 target 내 순서 */
  sortOrder: number;
}

@Injectable()
export class FileService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
    private readonly config: ConfigService,
  ) {}

  private getS3Config(): {
    client: S3Client;
    bucket: string;
    region: string;
  } {
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.config.get<string>('AWS_REGION');
    const bucket = this.config.get<string>('AWS_S3_BUCKET');

    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      throw new InternalServerErrorException(
        'S3 환경변수(AWS_ACCESS_KEY, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET)를 설정하세요.',
      );
    }

    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    return { client, bucket, region };
  }

  /** 공개 객체 URL (버킷이 객체 읽기 허용일 때 브라우저에서 직접 접근) */
  buildPublicObjectUrl(bucket: string, region: string, key: string): string {
    const encodedKey = encodeURI(key).replace(/#/g, '%23');
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
  }

  private parseExtension(originalName: string): string {
    const raw = extname(originalName).replace(/^\./, '').toLowerCase();
    if (!raw) {
      throw new BadRequestException('파일 확장자를 알 수 없습니다.');
    }
    return raw.slice(0, 5);
  }

  /**
   * S3에 업로드 후 `file` 테이블에 메타데이터 저장
   */
  async uploadAndSave(input: UploadFileToS3Input): Promise<File> {
    const { client, bucket, region } = this.getS3Config();
    const ext = this.parseExtension(input.originalName);
    const storedName = `${randomUUID()}.${ext}`;
    const prefix =
      input.targetType && input.targetId
        ? `${input.targetType}/${input.targetId}`
        : 'misc';
    const key = `uploads/${prefix}/${storedName}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType ?? 'application/octet-stream',
      }),
    );

    const imgUrl = this.buildPublicObjectUrl(bucket, region, key);

    const row = this.fileRepository.create({
      imgUrl,
      originalName: input.originalName.slice(0, 100),
      sortOrder: input.sortOrder,
      storedName: storedName.slice(0, 100),
      extention: ext,
      targetType: input.targetType,
      targetId: input.targetId,
    });

    return this.fileRepository.save(row);
  }

  /**
   * 특정 포스트(또는 대상)에 연결된 파일 목록 — `order` 오름차순
   */
  async findByTarget(
    targetType: FileTargetType,
    targetId: string,
  ): Promise<File[]> {
    return this.fileRepository.find({
      where: { targetType, targetId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 목록용: 각 `target_id`마다 **`order`(sortOrder)가 가장 작은** 파일 한 건.
   * 동일 `order`면 `created_at`이 더 이른 것.
   */
  async getSmallestOrderThumbnailByTargetIds(
    targetType: FileTargetType,
    targetIds: string[],
  ): Promise<Map<string, ThumbnailPick>> {
    if (targetIds.length === 0) {
      return new Map();
    }
    const rows = await this.fileRepository.find({
      where: { targetType, targetId: In(targetIds) },
      select: [
        'fileId',
        'imgUrl',
        'targetId',
        'sortOrder',
        'createdAt',
      ],
    });
    const best = new Map<string, File>();
    for (const row of rows) {
      if (!row.targetId) {
        continue;
      }
      const prev = best.get(row.targetId);
      if (!prev) {
        best.set(row.targetId, row);
        continue;
      }
      if (row.sortOrder < prev.sortOrder) {
        best.set(row.targetId, row);
      } else if (row.sortOrder === prev.sortOrder) {
        if (row.createdAt < prev.createdAt) {
          best.set(row.targetId, row);
        }
      }
    }
    const out = new Map<string, ThumbnailPick>();
    for (const [tid, f] of best) {
      out.set(tid, { fileId: f.fileId, imgUrl: f.imgUrl });
    }
    return out;
  }

  /**
   * 목록용: 여러 `target_id`의 첨부 파일 전체(`order` 오름차순)를 `target_id`별로 그룹핑.
   * 목록 카드에서 대표 이미지 1장뿐 아니라 여러 장 첨부를 그리드로 보여줄 때 사용.
   */
  async getFilesGroupedByTargetIds(
    targetType: FileTargetType,
    targetIds: string[],
  ): Promise<Map<string, File[]>> {
    if (targetIds.length === 0) {
      return new Map();
    }
    const rows = await this.fileRepository.find({
      where: { targetType, targetId: In(targetIds) },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const out = new Map<string, File[]>();
    for (const row of rows) {
      if (!row.targetId) {
        continue;
      }
      const list = out.get(row.targetId) ?? [];
      list.push(row);
      out.set(row.targetId, list);
    }
    return out;
  }

  /** 모집공고 게시 시각 — 첨부 파일(`target_id`·`file_id`) 업로드 시각만 사용 */
  async getAnnouncementPostedAtMap(
    items: Array<{ postId: string; fileId?: string | null }>,
  ): Promise<Map<string, Date>> {
    if (items.length === 0) {
      return new Map();
    }
    const postIds = items.map((item) => item.postId);
    const byTarget = await this.getEarliestCreatedAtByTargetIds(
      FileTargetType.ANNOUNCEMENT,
      postIds,
    );

    const fileIds = [
      ...new Set(
        items
          .map((item) => item.fileId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const primaryFiles =
      fileIds.length > 0
        ? await this.fileRepository.find({
            where: { fileId: In(fileIds) },
            select: ['fileId', 'createdAt'],
          })
        : [];

    const primaryByFileId = new Map(
      primaryFiles.map((file) => [file.fileId, file.createdAt]),
    );

    const result = new Map<string, Date>();
    for (const item of items) {
      const candidates: Date[] = [];
      const targetDate = byTarget.get(item.postId);
      if (targetDate) candidates.push(targetDate);
      const primaryId = item.fileId?.trim();
      if (primaryId) {
        const primaryDate = primaryByFileId.get(primaryId);
        if (primaryDate) candidates.push(primaryDate);
      }
      if (candidates.length > 0) {
        result.set(
          item.postId,
          candidates.reduce((earliest, date) =>
            date.getTime() < earliest.getTime() ? date : earliest,
          ),
        );
      }
    }
    return result;
  }

  async getEarliestCreatedAtByTargetIds(
    targetType: FileTargetType,
    targetIds: string[],
  ): Promise<Map<string, Date>> {
    if (targetIds.length === 0) {
      return new Map();
    }
    const rows = await this.fileRepository.find({
      where: { targetType, targetId: In(targetIds) },
      select: ['targetId', 'createdAt'],
    });
    const map = new Map<string, Date>();
    for (const row of rows) {
      if (!row.targetId) {
        continue;
      }
      const prev = map.get(row.targetId);
      if (!prev || row.createdAt < prev) {
        map.set(row.targetId, row.createdAt);
      }
    }
    return map;
  }

  /**
   * DB 행 삭제 + S3 객체 삭제 (키는 `img_url`에서 추출)
   */
  async removeFile(fileId: string): Promise<void> {
    const { client, bucket, region } = this.getS3Config();
    const row = await this.fileRepository.findOne({ where: { fileId } });
    if (!row) {
      throw new BadRequestException('파일을 찾을 수 없습니다.');
    }

    const key = this.extractKeyFromPublicUrl(row.imgUrl, bucket, region);
    if (key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    }

    await this.fileRepository.delete({ fileId });
  }

  /** `https://bucket.s3.region.amazonaws.com/key` → key */
  private extractKeyFromPublicUrl(
    imgUrl: string,
    bucket: string,
    region: string,
  ): string | null {
    const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
    if (!imgUrl.startsWith(prefix)) {
      return null;
    }
    return decodeURIComponent(imgUrl.slice(prefix.length));
  }
}
