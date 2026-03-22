import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateApplicationDto } from './create-application.dto';

/** 지원서 수정 — postId 변경 없음, 보낸 필드만 갱신 */
export class UpdateApplicationDto extends PartialType(
  OmitType(CreateApplicationDto, ['postId'] as const),
) {}
