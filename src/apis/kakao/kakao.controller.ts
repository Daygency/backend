import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { KakaoPlaceItemDto } from './dto/kakao-place-item.dto';
import { KakaoService } from './kakao.service';

@ApiTags('kakao')
@Controller('kakao')
export class KakaoController {
  constructor(private readonly kakaoService: KakaoService) {}

  @Get('places/search')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '카카오 장소 키워드 검색',
    description:
      '모집공고·음악계소식 작성 시 장소 검색. `KAKAO_REST_API_KEY` 필요.',
  })
  @ApiQuery({ name: 'query', description: '검색어', required: true })
  @ApiOkResponse({ type: [KakaoPlaceItemDto] })
  searchPlaces(@Query('query') query: string): Promise<KakaoPlaceItemDto[]> {
    return this.kakaoService.searchPlaces(query);
  }
}
