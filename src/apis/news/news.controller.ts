import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '공연소식 작성' })
  @ApiResponse({ status: 201, description: '공연소식 작성 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  create(
    @Body() createNewsDto: CreateNewsDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.newsService.create(req.user.id, createNewsDto);
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
