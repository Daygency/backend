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

function resolveImageUrls(banner: HomeBanner): string[] {
  if (Array.isArray(banner.imageUrls) && banner.imageUrls.length > 0) {
    return banner.imageUrls;
  }
  if (banner.imageUrl) return [banner.imageUrl];
  return [];
}

function applyImageUrls(banner: HomeBanner, urls: string[]) {
  banner.imageUrls = urls;
  banner.imageUrl = urls[0] ?? '';
}

@Injectable()
export class HomeBannerService {
  constructor(
    @InjectRepository(HomeBanner)
    private readonly bannerRepository: Repository<HomeBanner>,
    private readonly fileService: FileService,
  ) {}

  private async uploadImages(
    files: Express.Multer.File[],
    targetId: string | null,
  ): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const savedFile = await this.fileService.uploadAndSave({
        buffer: file.buffer,
        originalName: file.originalname,
        contentType: file.mimetype,
        targetType: FileTargetType.HOME_BANNER,
        targetId,
        sortOrder: i,
      });
      urls.push(savedFile.imgUrl);
    }
    return urls;
  }

  async findActivePublic() {
    const rows = await this.bannerRepository.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
    return rows
      .filter((row) => isBannerVisibleNow(row))
      .map((row) => {
        const imageUrls = resolveImageUrls(row);
        return {
          bannerId: row.bannerId,
          title: row.title,
          imageUrl: imageUrls[0] ?? row.imageUrl,
        };
      });
  }

  async findAllPublic() {
    const rows = await this.bannerRepository.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => {
      const imageUrls = resolveImageUrls(row);
      return {
        bannerId: row.bannerId,
        title: row.title,
        imageUrl: imageUrls[0] ?? row.imageUrl,
        isCurrent: isBannerVisibleNow(row),
        createdAt: row.createdAt,
      };
    });
  }

  async findOnePublic(bannerId: string) {
    const banner = await this.bannerRepository.findOne({ where: { bannerId } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }
    const imageUrls = resolveImageUrls(banner);
    return {
      bannerId: banner.bannerId,
      title: banner.title,
      imageUrls,
      createdAt: banner.createdAt,
    };
  }

  async findAllAdmin() {
    const rows = await this.bannerRepository.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      ...row,
      imageUrls: resolveImageUrls(row),
    }));
  }

  async findOneAdmin(bannerId: string) {
    const banner = await this.bannerRepository.findOne({ where: { bannerId } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }
    return {
      ...banner,
      imageUrls: resolveImageUrls(banner),
    };
  }

  async create(dto: CreateHomeBannerDto, files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('배너 이미지가 최소 1장 필요합니다.');
    }

    const banner = this.bannerRepository.create({
      title: dto.title,
      content: dto.content?.trim() ?? '',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      startsAt: parseOptionalDate(dto.startsAt),
      endsAt: parseOptionalDate(dto.endsAt),
      imageUrl: '',
      imageUrls: [],
    });
    const saved = await this.bannerRepository.save(banner);

    const uploadedUrls = await this.uploadImages(files, saved.bannerId);
    applyImageUrls(saved, uploadedUrls);
    const final = await this.bannerRepository.save(saved);

    return {
      ...final,
      imageUrls: resolveImageUrls(final),
    };
  }

  async update(
    bannerId: string,
    dto: UpdateHomeBannerDto,
    files?: Express.Multer.File[],
  ) {
    const banner = await this.bannerRepository.findOne({ where: { bannerId } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }

    if (dto.title !== undefined) banner.title = dto.title;
    if (dto.content !== undefined) banner.content = dto.content?.trim() ?? '';
    if (dto.sortOrder !== undefined) banner.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) banner.isActive = dto.isActive;
    if (dto.startsAt !== undefined) {
      banner.startsAt = parseOptionalDate(dto.startsAt);
    }
    if (dto.endsAt !== undefined) {
      banner.endsAt = parseOptionalDate(dto.endsAt);
    }

    const hasImageChange =
      dto.keptImageUrls !== undefined || (files && files.length > 0);

    if (hasImageChange) {
      const currentUrls = resolveImageUrls(banner);
      const kept =
        dto.keptImageUrls !== undefined ? dto.keptImageUrls : currentUrls;
      const validKept = kept.filter((url) => currentUrls.includes(url));
      const newUrls =
        files && files.length > 0
          ? await this.uploadImages(files, banner.bannerId)
          : [];
      const merged = [...validKept, ...newUrls];
      if (merged.length === 0) {
        throw new BadRequestException('배너 이미지가 최소 1장 필요합니다.');
      }
      applyImageUrls(banner, merged);
    }

    const saved = await this.bannerRepository.save(banner);
    return {
      ...saved,
      imageUrls: resolveImageUrls(saved),
    };
  }

  async remove(bannerId: string) {
    const banner = await this.bannerRepository.findOne({ where: { bannerId } });
    if (!banner) {
      throw new NotFoundException('배너를 찾을 수 없습니다.');
    }
    await this.bannerRepository.remove(banner);
    return { success: true };
  }
}
