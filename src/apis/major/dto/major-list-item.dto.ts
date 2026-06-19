import { ApiProperty } from '@nestjs/swagger';

export class MajorListItemDto {
  @ApiProperty({ description: '전공 ID (UUID)', format: 'uuid' })
  majorId: string;

  @ApiProperty({ description: '전공명' })
  name: string;
}
