import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListHomeBannersQueryDto } from './dto/list-home-banners-query.dto';
import { HomeBannerService } from './home-banner.service';

@ApiTags('home-banners')
@Controller('home-banners')
export class HomeBannerController {
  constructor(private readonly homeBannerService: HomeBannerService) {}

  @Get()
  @ApiOperation({ summary: '홈 상단 배너 목록 (노출 중)' })
  findActive() {
    return this.homeBannerService.findActivePublic();
  }

  @Get('all')
  @ApiOperation({ summary: '홈 배너 전체 목록 (이전 배너 포함)' })
  findAll() {
    return this.homeBannerService.findAllPublic();
  }

  @Get('feed')
  @ApiOperation({ summary: '큐레이션 피드 (무한스크롤)' })
  findFeed(@Query() query: ListHomeBannersQueryDto) {
    return this.homeBannerService.findFeedPublic(query);
  }

  @Get(':bannerId')
  @ApiOperation({ summary: '홈 배너 상세' })
  findOne(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.findOnePublic(bannerId);
  }
}
