import { ApiProperty } from '@nestjs/swagger';

export class KakaoPlaceItemDto {
  @ApiProperty({ description: '카카오 장소 ID' })
  placeId: string;

  @ApiProperty({ description: '장소명' })
  placeName: string;

  @ApiProperty({ description: '표시용 주소 (도로명 우선)' })
  address: string;

  @ApiProperty({ description: '위도' })
  latitude: number;

  @ApiProperty({ description: '경도' })
  longitude: number;
}
