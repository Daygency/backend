import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminWebLoginDto {
  @IsString()
  @MinLength(8)
  secret: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
