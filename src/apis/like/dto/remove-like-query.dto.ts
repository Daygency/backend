import { IsEnum, IsUUID } from 'class-validator';
import { LikeType } from '../entities/like.entity';

export class RemoveLikeQueryDto {
  @IsEnum(LikeType)
  likeType: LikeType;

  @IsUUID()
  targetId: string;
}
