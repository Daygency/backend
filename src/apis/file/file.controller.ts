import type { Express } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { FileTargetType } from './entities/file.entity';
import { FileService } from './file.service';

@ApiTags('files')
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      '파일 1건 업로드 — FormData: file + optional targetType, targetId, sortOrder',
  })
  @ApiResponse({ status: 201, description: '업로드 성공 (ApiFile 형태)' })
  @ApiResponse({ status: 400, description: '파일 없음 또는 잘못된 targetType' })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('targetType') targetTypeRaw?: string,
    @Body('targetId') targetIdRaw?: string,
    @Body('sortOrder') sortOrderRaw?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('업로드할 file 필드가 필요합니다.');
    }

    let targetType: FileTargetType | null = null;
    if (targetTypeRaw?.trim()) {
      const normalized = targetTypeRaw.trim().toLowerCase();
      const allowed = Object.values(FileTargetType) as string[];
      if (!allowed.includes(normalized)) {
        throw new BadRequestException(
          `targetType은 ${allowed.join(', ')} 중 하나여야 합니다.`,
        );
      }
      targetType = normalized as FileTargetType;
    }

    const targetId = targetIdRaw?.trim() ? targetIdRaw.trim() : null;
    const sortOrder =
      sortOrderRaw != null && sortOrderRaw !== ''
        ? parseInt(String(sortOrderRaw), 10)
        : 0;

    if (Number.isNaN(sortOrder)) {
      throw new BadRequestException('sortOrder는 숫자여야 합니다.');
    }

    const saved = await this.fileService.uploadAndSave({
      buffer: file.buffer,
      originalName: file.originalname || 'file',
      contentType: file.mimetype,
      targetType,
      targetId,
      sortOrder,
    });

    return {
      fileId: saved.fileId,
      imgUrl: saved.imgUrl,
      originalName: saved.originalName,
      sortOrder: saved.sortOrder,
      storedName: saved.storedName,
      extention: saved.extention,
      targetType: saved.targetType,
      targetId: saved.targetId,
      createdAt: saved.createdAt,
    };
  }
}
