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
import { CreateHomeBannerDto } from './dto/create-home-banner.dto';
import { UpdateHomeBannerDto } from './dto/update-home-banner.dto';
import { HomeBanner } from './entities/home-banner.entity';

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBannerVisibleNow(banner: HomeBanner, now = new Date()): boolean {
  if (!banner.isActive) return false;
  if (banner.startsAt && banner.startsAt > now) return false;
  if (banner.endsAt && banner.endsAt < now) return false;
  return true;
}

@Injectable()
export class HomeBannerService {
  constructor(
    @InjectRepository(HomeBanner)
    private readonly bannerRepository: Repository<HomeBanner>,
    private readonly fileService: FileService,
  ) {}

  async findActivePublic() {
    const rows = await this.bannerRepository.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
    return rows
      .filter((row) => isBannerVisibleNow(row))
      .map((row) => ({
        bannerId: row.bannerId,
        title: row.title,
        imageUrl: row.imageUrl,
      }));
  }

  async findOnePublic(bannerId: string) {
    const banner = await this.bannerRepository.findOne({ where: { bannerId } });
    if (!banner || !isBannerVisibleNow(banner)) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }
    return {
      bannerId: banner.bannerId,
      title: banner.title,
      content: banner.content,
      imageUrl: banner.imageUrl,
    };
  }

  async findAllAdmin() {
    return this.bannerRepository.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOneAdmin(bannerId: string) {
    const banner = await this.bannerRepository.findOne({ where: { bannerId } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }
    return banner;
  }

  async create(dto: CreateHomeBannerDto, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('배너 이미지가 필요합니다.');
    }
    const savedFile = await this.fileService.uploadAndSave({
      buffer: file.buffer,
      originalName: file.originalname,
      contentType: file.mimetype,
      targetType: FileTargetType.HOME_BANNER,
      targetId: null,
      sortOrder: 0,
    });

    const banner = this.bannerRepository.create({
      title: dto.title,
      content: dto.content,
      imageUrl: savedFile.imgUrl,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      startsAt: parseOptionalDate(dto.startsAt),
      endsAt: parseOptionalDate(dto.endsAt),
    });

    const saved = await this.bannerRepository.save(banner);
    return saved;
  }

  async update(
    bannerId: string,
    dto: UpdateHomeBannerDto,
    file?: Express.Multer.File,
  ) {
    const banner = await this.findOneAdmin(bannerId);

    if (dto.title !== undefined) banner.title = dto.title;
    if (dto.content !== undefined) banner.content = dto.content;
    if (dto.sortOrder !== undefined) banner.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) banner.isActive = dto.isActive;
    if (dto.startsAt !== undefined) {
      banner.startsAt = parseOptionalDate(dto.startsAt);
    }
    if (dto.endsAt !== undefined) {
      banner.endsAt = parseOptionalDate(dto.endsAt);
    }

    if (file) {
      const savedFile = await this.fileService.uploadAndSave({
        buffer: file.buffer,
        originalName: file.originalname,
        contentType: file.mimetype,
        targetType: FileTargetType.HOME_BANNER,
        targetId: banner.bannerId,
        sortOrder: 0,
      });
      banner.imageUrl = savedFile.imgUrl;
    }

    return this.bannerRepository.save(banner);
  }

  async remove(bannerId: string) {
    const banner = await this.findOneAdmin(bannerId);
    await this.bannerRepository.remove(banner);
    return { success: true };
  }
}
