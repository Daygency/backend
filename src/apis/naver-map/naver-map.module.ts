import { Module } from '@nestjs/common';
import { NaverMapController } from './naver-map.controller';
import { NaverMapService } from './naver-map.service';

@Module({
  controllers: [NaverMapController],
  providers: [NaverMapService],
})
export class NaverMapModule {}
