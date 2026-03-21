import { IsEnum, IsUUID } from 'class-validator';
import { CommentTargetType } from '../entities/comment.entity';

export class ListCommentQueryDto {
  @IsEnum(CommentTargetType)
  targetType: CommentTargetType;

  @IsUUID()
  targetId: string;
}
