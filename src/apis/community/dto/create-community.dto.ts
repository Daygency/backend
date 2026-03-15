import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCommunityDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsString()
  fileId?: string;
}
