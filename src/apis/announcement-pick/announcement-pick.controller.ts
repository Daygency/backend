import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnnouncementPickService } from './announcement-pick.service';
import { ListAnnouncementPickQueryDto } from './dto/list-announcement-pick-query.dto';

@ApiTags('announcement-picks')
@Controller('announcement-picks')
export class AnnouncementPickController {
  constructor(
    private readonly announcementPickService: AnnouncementPickService,
  ) {}

  @Get()
  @ApiOperation({ summary: '모집공고 데이전시 Pick 목록 (노출 중, 무한스크롤)' })
  findActive(@Query() query: ListAnnouncementPickQueryDto) {
    return this.announcementPickService.findActivePublic(query);
  }
}
