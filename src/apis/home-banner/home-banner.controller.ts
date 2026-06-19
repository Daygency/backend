import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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

  @Get(':bannerId')
  @ApiOperation({ summary: '홈 배너 상세' })
  findOne(@Param('bannerId') bannerId: string) {
    return this.homeBannerService.findOnePublic(bannerId);
  }
}
