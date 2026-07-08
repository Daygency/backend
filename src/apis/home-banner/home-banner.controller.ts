import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListHomeBannerQueryDto } from './dto/list-home-banner-query.dto';
import { ListHomeBannersQueryDto } from './dto/list-home-banners-query.dto';
import { HomeBannerService } from './home-banner.service';

@ApiTags('home-banners')
@Controller('home-banners')
export class HomeBannerController {
  constructor(private readonly homeBannerService: HomeBannerService) {}

  @Get()
  @ApiOperation({ summary: '홈 상단 배너 목록 (노출 중, 무한스크롤)' })
  findActive(@Query() query: ListHomeBannerQueryDto) {
    return this.homeBannerService.findActivePublic(query);
  }

  @Get('all')
  @ApiOperation({ summary: '홈 배너 전체 목록 (이전 배너 포함, 무한스크롤)' })
  findAll(@Query() query: ListHomeBannerQueryDto) {
    return this.homeBannerService.findAllPublic(query);
  }

  @Get('feed')
  @ApiOperation({ summary: '매거진 피드 (무한스크롤)' })
  findFeed(@Query() query: ListHomeBannersQueryDto) {
    return this.homeBannerService.findFeedPublic(query);
  }

  @Get(':bannerId')
  @ApiOperation({ summary: '홈 배너 상세' })
  findOne(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.findOnePublic(bannerId);
  }
}
