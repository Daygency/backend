import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateAnnouncementChatRoomDto {
  @ApiProperty({ description: '모집공고 post_id' })
  @IsUUID()
  postId: string;

  @ApiPropertyOptional({
    description:
      '멤버로 보강할 지원자 user_id(선택). 이 엔드포인트는 공고 작성자만 호출할 수 있음.',
  })
  @IsOptional()
  @IsUUID()
  applicantUserId?: string;
}
