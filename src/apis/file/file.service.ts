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
import { Repository } from 'typeorm';
import { File, FileTargetType } from './entities/file.entity';

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
        ? `${input.targetType.toLowerCase()}/${input.targetId}`
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
