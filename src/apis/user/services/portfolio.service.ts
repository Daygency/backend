import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Award } from '../entities/award.entity';
import { Career } from '../entities/career.entity';
import { Education } from '../entities/education.entity';
import { Certificate } from '../entities/certificate.entity';
import { CreateAwardDto } from '../dto/create-portfolio.dto';
import { CreateCareerDto } from '../dto/create-portfolio.dto';
import { CreateEducationDto } from '../dto/create-portfolio.dto';
import { CreateCertificateDto } from '../dto/create-portfolio.dto';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(Award)
    private readonly awardRepository: Repository<Award>,
    @InjectRepository(Career)
    private readonly careerRepository: Repository<Career>,
    @InjectRepository(Education)
    private readonly educationRepository: Repository<Education>,
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
  ) {}

  async createAward(createAwardDto: CreateAwardDto) {
    return this.awardRepository.save(createAwardDto);
  }

  async createCareer(createCareerDto: CreateCareerDto) {
    return this.careerRepository.save(createCareerDto);
  }

  async createEducation(createEducationDto: CreateEducationDto) {
    return this.educationRepository.save(createEducationDto);
  }

  async createCertificate(createCertificateDto: CreateCertificateDto) {
    return this.certificateRepository.save(createCertificateDto);
  }
}
