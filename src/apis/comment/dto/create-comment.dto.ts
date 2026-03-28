import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CommentTargetType } from '../entities/comment.entity';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(CommentTargetType)
  targetType: CommentTargetType;

  @IsUUID()
  targetId: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
