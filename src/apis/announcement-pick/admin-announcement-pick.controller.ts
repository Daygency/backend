import type { Express } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseAndValidateJsonPayload } from '../../common/parse-json-payload.util';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { AnnouncementPickService } from './announcement-pick.service';
import { CreateAnnouncementPickDto } from './dto/create-announcement-pick.dto';
import { UpdateAnnouncementPickDto } from './dto/update-announcement-pick.dto';

@ApiTags('admin-announcement-picks')
@Controller('admin/announcement-picks')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
export class AdminAnnouncementPickController {
  constructor(
    private readonly announcementPickService: AnnouncementPickService,
  ) {}

  @Get()
  @ApiOperation({ summary: '데이전시 Pick 전체 목록 (관리자)' })
  findAll() {
    return this.announcementPickService.findAllAdmin();
  }

  @Get(':pickId')
  @ApiOperation({ summary: '데이전시 Pick 단건 (관리자)' })
  findOne(@Param('pickId') pickId: string) {
    return this.announcementPickService.findOneAdmin(pickId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '데이전시 Pick 등록 — FormData: payload(JSON) + image(파일)' })
  async create(
    @Body('payload') payload: string,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const dto = await parseAndValidateJsonPayload(
      CreateAnnouncementPickDto,
      payload,
    );
    return this.announcementPickService.create(dto, image);
  }

  @Patch(':pickId')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '데이전시 Pick 수정 — payload.keptImageUrl 로 기존 이미지 유지' })
  async update(
    @Param('pickId') pickId: string,
    @Body('payload') payload: string,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const dto = await parseAndValidateJsonPayload(
      UpdateAnnouncementPickDto,
      payload,
    );
    return this.announcementPickService.update(pickId, dto, image);
  }

  @Delete(':pickId')
  @ApiOperation({ summary: '데이전시 Pick 삭제' })
  remove(@Param('pickId') pickId: string) {
    return this.announcementPickService.remove(pickId);
  }
}
