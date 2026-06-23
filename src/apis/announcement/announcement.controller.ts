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
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { parseAndValidateJsonPayload } from '../../common/parse-json-payload.util';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ListAnnouncementQueryDto } from './dto/list-announcement-query.dto';

@ApiTags('announcements')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@Controller('announcement')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Post('json')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '모집공고 작성 (JSON Body만, 이미지 없음)' })
  @ApiResponse({ status: 201, description: '공고 작성 완료' })
  @ApiResponse({
    status: 400,
    description: '유효성 오류 또는 존재하지 않는 전공 ID(majorIds)',
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  createJson(
    @Body() createAnnouncementDto: CreateAnnouncementDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.announcementService.create(req.user.id, createAnnouncementDto);
  }

  @Post()
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      '모집공고 작성 — FormData: payload(JSON 문자열, applicationConfig 포함) + files',
  })
  @ApiResponse({ status: 201, description: '공고 작성 완료' })
  @ApiResponse({
    status: 400,
    description:
      'payload JSON/유효성 오류, 또는 존재하지 않는 전공 ID(majorIds)',
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async create(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: { user: { id: string } },
  ) {
    const dto = await parseAndValidateJsonPayload(
      CreateAnnouncementDto,
      payload,
    );
    return this.announcementService.create(req.user.id, dto, files ?? []);
  }

  @Get()
  @ApiOperation({ summary: '공고 목록 조회 (무한스크롤 + 필터)' })
  @ApiResponse({ status: 200, description: '공고 목록 반환' })
  findAll(@Query() query: ListAnnouncementQueryDto) {
    return this.announcementService.findList(query);
  }

  @Get('my')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({
    summary: '내가 작성한 공고 목록 (무한스크롤 + 필터, 전체 목록과 동일 쿼리)',
  })
  @ApiResponse({ status: 200, description: '내 공고 목록 반환' })
  findMy(
    @Query() query: ListAnnouncementQueryDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.announcementService.findMyList(req.user.id, query);
  }

  @Get('categories')
  @ApiOperation({ summary: '공고 유형(announcement_category) 목록 조회' })
  @ApiResponse({ status: 200, description: '공고 유형 목록 반환' })
  findCategories() {
    return this.announcementService.findAllCategories();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: '공고 상세 조회',
    description:
      'category, majors, applicationConfig(지원서 양식) 포함. 로그인 시 isMine 포함.',
  })
  @ApiResponse({
    status: 200,
    description:
      '공고 상세 반환 — applicationConfig에 include* 불리언으로 지원 폼 항목 노출 여부',
  })
  findOne(@Param('id') id: string, @Request() req: { user?: { id: string } }) {
    return this.announcementService.findOne(id, req.user?.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({
    summary: '모집공고 수정',
    description:
      '조기마감(`status:CLOSED`만) 또는 `completed`만 보낸 경우 최소 필드만 반환. 그 외는 목록 아이템+majors.',
  })
  @ApiResponse({ status: 200, description: '공고 수정 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({
    status: 403,
    description:
      '수정 권한 없음, 또는 지원자가 있는데 조기마감(status=CLOSED만)·완료(completed만)이 아닌 수정',
  })
  @ApiResponse({ status: 404, description: '공고를 찾을 수 없음' })
  @ApiResponse({
    status: 400,
    description: '유효성 오류 또는 존재하지 않는 전공 ID(majorIds)',
  })
  update(
    @Param('id') id: string,
    @Body() updateAnnouncementDto: UpdateAnnouncementDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.announcementService.update(
      req.user.id,
      id,
      updateAnnouncementDto,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '모집공고 삭제' })
  @ApiResponse({ status: 200, description: '공고 삭제 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '공고를 찾을 수 없음' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.announcementService.remove(req.user.id, id);
  }
}
