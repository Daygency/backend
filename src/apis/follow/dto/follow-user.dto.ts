import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class FollowUserDto {
  @ApiProperty({ description: '팔로우할 상대 user_id' })
  @IsUUID()
  receiverId: string;
}
