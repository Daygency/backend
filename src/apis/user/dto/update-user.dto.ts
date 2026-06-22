import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { SocialProvider, UserRole } from '../entities/user.entity';

export class UpdateEducationDto {
  @IsOptional()
  @IsUUID()
  educationId?: string;

  @IsString()
  @Length(1, 100)
  description: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string | null;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isOngoing?: boolean;
}

export class UpdateCareerDto {
  @IsOptional()
  @IsUUID()
  careerId?: string;

  @IsString()
  @Length(1, 100)
  description: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string | null;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isOngoing?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  organization?: string | null;
}

export class UpdateAwardDto {
  @IsOptional()
  @IsUUID()
  awardId?: string;

  @IsString()
  @Length(1, 100)
  description: string;

  @IsOptional()
  @IsDateString()
  awardedAt?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  organization?: string | null;
}

export class UpdateCertificateDto {
  @IsOptional()
  @IsUUID()
  certificateId?: string;

  @IsString()
  @Length(1, 100)
  description: string;

  @IsOptional()
  @IsDateString()
  obtainedAt?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 10)
  organization?: string | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  activityName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  aboutMe?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  selfIntroduction?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEmail()
  @Length(1, 320)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 13)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  profileImgUrl?: string;

  @IsOptional()
  @IsBoolean()
  isEmailSubscribed?: boolean;

  @IsOptional()
  @IsBoolean()
  isPushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPortfolioPrivate?: boolean;

  @IsOptional()
  @IsEnum(SocialProvider)
  socialProvider?: SocialProvider;

  @IsOptional()
  @IsString()
  socialId?: string;

  @IsOptional()
  @IsUUID()
  majorId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateEducationDto)
  educations?: UpdateEducationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCareerDto)
  careers?: UpdateCareerDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateAwardDto)
  awards?: UpdateAwardDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCertificateDto)
  certificates?: UpdateCertificateDto[];
}
