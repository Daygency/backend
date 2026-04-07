export class CreateAwardDto {
  description: string;
  awardedAt: Date | null;
  organization?: string | null;
}

export class CreateCareerDto {
  description: string;
  startedAt: Date;
  endedAt: Date;
  organization?: string | null;
}

export class CreateEducationDto {
  description: string;
  startedAt: Date;
  endedAt: Date | null;
}

export class CreateCertificateDto {
  description: string;
  obtainedAt: Date | null;
  organization?: string | null;
}
