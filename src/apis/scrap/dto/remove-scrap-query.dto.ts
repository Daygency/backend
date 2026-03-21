import { IsEnum, IsUUID } from 'class-validator';
import { ScrapTargetType } from '../entities/scrap.entity';

export class RemoveScrapQueryDto {
  @IsEnum(ScrapTargetType)
  targetType: ScrapTargetType;

  @IsUUID()
  targetId: string;
}
