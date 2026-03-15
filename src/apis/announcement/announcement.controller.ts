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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ListAnnouncementQueryDto } from './dto/list-announcement-query.dto';

@ApiTags('announcements')
@Controller('announcement')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '모집공고 작성' })
  @ApiResponse({ status: 201, description: '공고 작성 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  create(
    @Body() createAnnouncementDto: CreateAnnouncementDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.announcementService.create(req.user.id, createAnnouncementDto);
  }

  @Get()
  @ApiOperation({ summary: '공고 목록 조회 (무한스크롤 + 필터)' })
  @ApiResponse({ status: 200, description: '공고 목록 반환' })
  findAll(@Query() query: ListAnnouncementQueryDto) {
    return this.announcementService.findList(query);
  }

  @Get('categories')
  @ApiOperation({ summary: '공고 유형(announcement_category) 목록 조회' })
  @ApiResponse({ status: 200, description: '공고 유형 목록 반환' })
  findCategories() {
    return this.announcementService.findAllCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.announcementService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAnnouncementDto: UpdateAnnouncementDto,
  ) {
    return this.announcementService.update(id, updateAnnouncementDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.announcementService.remove(id);
  }
}
