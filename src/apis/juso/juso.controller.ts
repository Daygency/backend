import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JusoAddressItemDto } from './dto/juso-address-item.dto';
import { JusoService } from './juso.service';

@ApiTags('juso')
@Controller('juso')
export class JusoController {
  constructor(private readonly jusoService: JusoService) {}

  @Get('search')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '도로명주소 검색 (juso.go.kr)',
    description:
      '모집공고·음악계소식 작성 시 주소 검색. `JUSO_CONFM_KEY` 필요.',
  })
  @ApiQuery({ name: 'keyword', description: '검색어', required: true })
  @ApiOkResponse({ type: [JusoAddressItemDto] })
  searchAddress(
    @Query('keyword') keyword: string,
  ): Promise<JusoAddressItemDto[]> {
    return this.jusoService.searchAddress(keyword);
  }
}
