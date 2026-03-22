import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateAnnouncementChatRoomDto {
  @ApiProperty({ description: '모집공고 post_id' })
  @IsUUID()
  postId: string;

  @ApiPropertyOptional({
    description:
      '지원자 user_id. 생략 시 본인이 지원자로 간주. 공고 작성자만 특정 지원자를 지정할 수 있음.',
  })
  @IsOptional()
  @IsUUID()
  applicantUserId?: string;
}
