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
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  /** 파일 없이 JSON만 보낼 때 (하위 호환) */
  @Post('json')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '공연소식 작성 (JSON Body만, 이미지 없음)' })
  @ApiResponse({ status: 201, description: '공연소식 작성 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  createJson(
    @Body() createNewsDto: CreateNewsDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.newsService.create(req.user.id, createNewsDto);
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
      '공연소식 작성 — FormData: payload(JSON 문자열) + files(이미지, 필드명 files 반복)',
  })
  @ApiResponse({ status: 201, description: '공연소식 작성 완료' })
  @ApiResponse({ status: 400, description: 'payload JSON/유효성 오류' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async create(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: { user: { id: string } },
  ) {
    const dto = await parseAndValidateJsonPayload(CreateNewsDto, payload);
    return this.newsService.create(req.user.id, dto, files ?? []);
  }

  @Get()
  @ApiOperation({ summary: '공연소식 목록 조회 (무한스크롤)' })
  @ApiResponse({ status: 200, description: '공연소식 목록 반환' })
  findAll(@Query() query: ListNewsQueryDto) {
    return this.newsService.findList(query);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '공연소식 상세 조회' })
  @ApiResponse({
    status: 200,
    description: '공연소식 상세 반환 (로그인 시 isMine 포함)',
  })
  findOne(@Param('id') id: string, @Request() req: { user?: { id: string } }) {
    return this.newsService.findOne(id, req.user?.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '공연소식 수정' })
  @ApiResponse({ status: 200, description: '공연소식 수정 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '수정 권한 없음' })
  @ApiResponse({ status: 404, description: '공연소식을 찾을 수 없음' })
  update(
    @Param('id') id: string,
    @Body() updateNewsDto: UpdateNewsDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.newsService.update(req.user.id, id, updateNewsDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '공연소식 삭제' })
  @ApiResponse({ status: 200, description: '공연소식 삭제 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '공연소식을 찾을 수 없음' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.newsService.remove(req.user.id, id);
  }
}
