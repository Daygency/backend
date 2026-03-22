import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateCoffeeRoomDto {
  @ApiProperty({ description: '1:1 대화 상대 사용자 ID' })
  @IsUUID()
  peerUserId: string;
}
