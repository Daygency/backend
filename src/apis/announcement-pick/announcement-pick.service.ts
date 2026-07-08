import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Express } from 'express';
import { Repository } from 'typeorm';
import { FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { CreateAnnouncementPickDto } from './dto/create-announcement-pick.dto';
import { ListAnnouncementPickQueryDto } from './dto/list-announcement-pick-query.dto';
import { UpdateAnnouncementPickDto } from './dto/update-announcement-pick.dto';
import { AnnouncementPick } from './entities/announcement-pick.entity';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';

function decodePickCursor(cursor: string): { s: number; t: string; i: string } {
  try {
    const parsed = decodeCursor(cursor) as {
      s?: unknown;
      t?: unknown;
      i?: unknown;
    };
    if (
      typeof parsed.s !== 'number' ||
      typeof parsed.t !== 'string' ||
      typeof parsed.i !== 'string'
    ) {
      throw new Error('invalid cursor shape');
    }
    return { s: parsed.s, t: parsed.t, i: parsed.i };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

function encodePickCursor(sortOrder: number, createdAt: Date, pickId: string): string {
  return encodeCursor({ s: sortOrder, t: createdAt.toISOString(), i: pickId });
}

function parseRequiredDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('올바른 날짜를 입력해주세요.');
  }
  return date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isPickVisibleNow(pick: AnnouncementPick, today = startOfToday()): boolean {
  if (!pick.isActive) return false;
  return pick.deadlineAt >= today;
}

@Injectable()
export class AnnouncementPickService {
  constructor(
    @InjectRepository(AnnouncementPick)
    private readonly pickRepository: Repository<AnnouncementPick>,
    private readonly fileService: FileService,
  ) {}

  private sanitizeKeywords(keywords: string[]): string[] {
    const sanitized = keywords
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    if (sanitized.length === 0) {
      throw new BadRequestException('키워드를 1개 이상 입력해주세요.');
    }
    return sanitized;
  }

  private async uploadImage(
    file: Express.Multer.File,
    targetId: string,
  ): Promise<string> {
    const savedFile = await this.fileService.uploadAndSave({
      buffer: file.buffer,
      originalName: file.originalname,
      contentType: file.mimetype,
      targetType: FileTargetType.ANNOUNCEMENT_PICK,
      targetId,
      sortOrder: 0,
    });
    return savedFile.imgUrl;
  }

  async findActivePublic(query: ListAnnouncementPickQueryDto) {
    const limit = query.limit ?? 20;
    const qb = this.pickRepository
      .createQueryBuilder('pick')
      .orderBy('pick.sortOrder', 'DESC')
      .addOrderBy('pick.createdAt', 'DESC')
      .addOrderBy('pick.pickId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { s, t, i } = decodePickCursor(query.cursor);
      qb.andWhere(
        `(pick.sortOrder < :s)
         OR (pick.sortOrder = :s AND pick.createdAt < :t)
         OR (pick.sortOrder = :s AND pick.createdAt = :t AND pick.pickId < :i)`,
        { s, t: new Date(t), i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePickCursor(last.sortOrder, last.createdAt, last.pickId)
        : null;

    return {
      items: slice.filter((row) => isPickVisibleNow(row)).map((row) => ({
        pickId: row.pickId,
        organizerName: row.organizerName,
        title: row.title,
        keywords: row.keywords,
        deadlineAt: row.deadlineAt,
        imageUrl: row.imageUrl,
        linkUrl: row.linkUrl,
      })),
      nextCursor,
      hasMore,
    };
  }

  async findAllAdmin(query: ListAnnouncementPickQueryDto) {
    const limit = query.limit ?? 20;
    const qb = this.pickRepository
      .createQueryBuilder('pick')
      .orderBy('pick.sortOrder', 'DESC')
      .addOrderBy('pick.createdAt', 'DESC')
      .addOrderBy('pick.pickId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { s, t, i } = decodePickCursor(query.cursor);
      qb.andWhere(
        `(pick.sortOrder < :s)
         OR (pick.sortOrder = :s AND pick.createdAt < :t)
         OR (pick.sortOrder = :s AND pick.createdAt = :t AND pick.pickId < :i)`,
        { s, t: new Date(t), i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePickCursor(last.sortOrder, last.createdAt, last.pickId)
        : null;

    return { items: slice, nextCursor, hasMore };
  }

  async findOneAdmin(pickId: string) {
    const pick = await this.pickRepository.findOne({ where: { pickId } });
    if (!pick) {
      throw new NotFoundException('데이전시 Pick을 찾을 수 없습니다.');
    }
    return pick;
  }

  async create(dto: CreateAnnouncementPickDto, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('배경 이미지가 필요합니다.');
    }

    const pick = this.pickRepository.create({
      organizerName: dto.organizerName.trim(),
      title: dto.title.trim(),
      keywords: this.sanitizeKeywords(dto.keywords),
      deadlineAt: parseRequiredDate(dto.deadlineAt),
      imageUrl: '',
      linkUrl: dto.linkUrl.trim(),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.pickRepository.save(pick);
    saved.imageUrl = await this.uploadImage(file, saved.pickId);
    return this.pickRepository.save(saved);
  }

  async update(
    pickId: string,
    dto: UpdateAnnouncementPickDto,
    file?: Express.Multer.File,
  ) {
    const pick = await this.pickRepository.findOne({ where: { pickId } });
    if (!pick) {
      throw new NotFoundException('데이전시 Pick을 찾을 수 없습니다.');
    }

    if (dto.organizerName !== undefined) {
      pick.organizerName = dto.organizerName.trim();
    }
    if (dto.title !== undefined) {
      pick.title = dto.title.trim();
    }
    if (dto.keywords !== undefined) {
      pick.keywords = this.sanitizeKeywords(dto.keywords);
    }
    if (dto.deadlineAt !== undefined) {
      pick.deadlineAt = parseRequiredDate(dto.deadlineAt);
    }
    if (dto.linkUrl !== undefined) {
      pick.linkUrl = dto.linkUrl.trim();
    }
    if (dto.sortOrder !== undefined) {
      pick.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      pick.isActive = dto.isActive;
    }
    if (dto.keptImageUrl !== undefined && dto.keptImageUrl !== pick.imageUrl && !file) {
      throw new BadRequestException('유효한 이미지를 유지하거나 새 이미지를 업로드해주세요.');
    }
    if (file) {
      pick.imageUrl = await this.uploadImage(file, pick.pickId);
    }
    if (!pick.imageUrl) {
      throw new BadRequestException('배경 이미지가 필요합니다.');
    }

    return this.pickRepository.save(pick);
  }

  async remove(pickId: string) {
    const pick = await this.pickRepository.findOne({ where: { pickId } });
    if (!pick) {
      throw new NotFoundException('데이전시 Pick을 찾을 수 없습니다.');
    }
    await this.pickRepository.remove(pick);
    return { success: true };
  }
}
