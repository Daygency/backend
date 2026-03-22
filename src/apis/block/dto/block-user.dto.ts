import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class BlockUserDto {
  @ApiProperty({ description: '차단할 상대 user_id' })
  @IsUUID()
  blockedId: string;
}
