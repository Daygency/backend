import { BadRequestException, Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NaverMapService } from './naver-map.service';

@ApiTags('naver-map')
@Controller('naver-map')
export class NaverMapController {
  constructor(private readonly naverMapService: NaverMapService) {}

  @Get('static')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({
    summary: '단일 지점 정적 지도 이미지',
    description:
      '모집공고·음악계소식 상세페이지의 지도 미리보기. 인터랙티브 지도 대신 좌표 한 점을 마커로 찍은 정적 이미지를 반환해 비용을 최소화. `NAVER_MAP_CLIENT_ID`/`NAVER_MAP_CLIENT_SECRET` 필요.',
  })
  @ApiQuery({ name: 'latitude', required: true })
  @ApiQuery({ name: 'longitude', required: true })
  @ApiQuery({ name: 'width', required: false })
  @ApiQuery({ name: 'height', required: false })
  async getStaticMap(
    @Query('latitude') latitudeRaw: string,
    @Query('longitude') longitudeRaw: string,
    @Query('width') widthRaw: string | undefined,
    @Query('height') heightRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const latitude = Number(latitudeRaw);
    const longitude = Number(longitudeRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('latitude, longitude가 필요합니다.');
    }

    const { buffer, contentType } = await this.naverMapService.getStaticMap({
      latitude,
      longitude,
      width: widthRaw ? Number(widthRaw) : undefined,
      height: heightRaw ? Number(heightRaw) : undefined,
    });

    res.set({ 'Content-Type': contentType });
    return new StreamableFile(buffer);
  }
}
