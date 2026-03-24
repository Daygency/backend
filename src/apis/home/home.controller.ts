import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HomeService } from './home.service';

@ApiTags('home')
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @ApiOperation({
    summary:
      '홈 화면 데이터 조회 (모집공고 3개 + 공연소식 5개 + 커뮤니티 카테고리별 최신 1개)',
  })
  getHome() {
    return this.homeService.getHome();
  }
}
