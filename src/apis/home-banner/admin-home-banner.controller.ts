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
import { CreateHomeBannerDto } from './dto/create-home-banner.dto';
import { UpdateHomeBannerDto } from './dto/update-home-banner.dto';
import { HomeBannerService } from './home-banner.service';

@ApiTags('admin-home-banners')
@Controller('admin/home-banners')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
export class AdminHomeBannerController {
  constructor(private readonly homeBannerService: HomeBannerService) {}

  @Get()
  @ApiOperation({ summary: '홈 배너 전체 목록 (관리자)' })
  findAll() {
    return this.homeBannerService.findAllAdmin();
  }

  @Get(':bannerId')
  @ApiOperation({ summary: '홈 배너 단건 (관리자)' })
  findOne(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.findOneAdmin(bannerId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '홈 배너 등록 — FormData: payload(JSON) + image(파일)',
  })
  async create(
    @Body('payload') payload: string,
    @UploadedFile() image: Express.Multer.File,
  ) {
    const dto = await parseAndValidateJsonPayload(CreateHomeBannerDto, payload);
    return this.homeBannerService.create(dto, image);
  }

  @Patch(':bannerId')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '홈 배너 수정' })
  async update(
    @Param('bannerId') bannerId: string,
    @Body('payload') payload: string,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const dto = await parseAndValidateJsonPayload(UpdateHomeBannerDto, payload);
    return this.homeBannerService.update(bannerId, dto, image);
  }

  @Delete(':bannerId')
  @ApiOperation({ summary: '홈 배너 삭제' })
  remove(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.remove(bannerId);
  }
}
