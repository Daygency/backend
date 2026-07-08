import type { Express } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseAndValidateJsonPayload } from '../../common/parse-json-payload.util';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { CreateHomeBannerDto } from './dto/create-home-banner.dto';
import { ListHomeBannerQueryDto } from './dto/list-home-banner-query.dto';
import { UpdateHomeBannerDto } from './dto/update-home-banner.dto';
import { HomeBannerService } from './home-banner.service';

@ApiTags('admin-home-banners')
@Controller('admin/home-banners')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
export class AdminHomeBannerController {
  constructor(private readonly homeBannerService: HomeBannerService) {}

  @Get()
  @ApiOperation({ summary: '홈 배너 전체 목록 (관리자, 무한스크롤)' })
  findAll(@Query() query: ListHomeBannerQueryDto) {
    return this.homeBannerService.findAllAdmin(query);
  }

  @Get(':bannerId')
  @ApiOperation({ summary: '홈 배너 단건 (관리자)' })
  findOne(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.findOneAdmin(bannerId);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '홈 배너 등록 — FormData: payload(JSON) + images(파일, 복수)',
  })
  async create(
    @Body('payload') payload: string,
    @UploadedFiles() images: Express.Multer.File[],
  ) {
    const dto = await parseAndValidateJsonPayload(CreateHomeBannerDto, payload);
    return this.homeBannerService.create(dto, images ?? []);
  }

  @Patch(':bannerId')
  @UseInterceptors(
    FilesInterceptor('images', 20, {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '홈 배너 수정 — images 복수, payload.keptImageUrls 로 기존 이미지 유지' })
  async update(
    @Param('bannerId') bannerId: string,
    @Body('payload') payload: string,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    const dto = await parseAndValidateJsonPayload(UpdateHomeBannerDto, payload);
    return this.homeBannerService.update(bannerId, dto, images);
  }

  @Delete(':bannerId')
  @ApiOperation({ summary: '홈 배너 삭제' })
  remove(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.remove(bannerId);
  }
}
