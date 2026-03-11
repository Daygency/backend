export class CreateAwardDto {
  description: string;
  awardedAt: Date;
}

export class CreateCareerDto {
  description: string;
  startedAt: Date;
  endedAt: Date;
}

export class CreateEducationDto {
  description: string;
  startedAt: Date;
  endedAt: Date;
}

export class CreateCertificateDto {
  description: string;
  obtainedAt: Date;
}
