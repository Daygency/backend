import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  Announcement,
  AnnouncementStatus,
} from './entities/announcement.entity';
import { Application } from './entities/application.entity';
import { ApplicationConfig } from './entities/application-config.entity';

@Injectable()
export class ApplicationSubmissionService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(ApplicationConfig)
    private readonly applicationConfigRepo: Repository<ApplicationConfig>,
  ) {}

  async submit(
    postId: string,
    applicantUserId: string,
    dto: CreateApplicationDto,
  ): Promise<Application> {
    const announcement = await this.announcementRepo.findOne({
      where: { postId },
      relations: { applicationConfig: true },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.userId === applicantUserId) {
      throw new BadRequestException('본인이 올린 공고에는 지원할 수 없습니다.');
    }
    if (announcement.status !== AnnouncementStatus.OPEN) {
      throw new BadRequestException('모집이 마감된 공고입니다.');
    }
    const deadline = new Date(announcement.deadlineAt);
    if (deadline.getTime() < Date.now()) {
      throw new BadRequestException('지원 마감일이 지났습니다.');
    }

    const config =
      announcement.applicationConfig ??
      (await this.applicationConfigRepo.findOne({
        where: { postId },
      }));
    if (!config) {
      throw new BadRequestException('지원서 양식이 설정되지 않은 공고입니다.');
    }

    const existing = await this.applicationRepo.findOne({
      where: { postId, userId: applicantUserId },
    });
    if (existing) {
      throw new ConflictException('이미 이 공고에 지원했습니다.');
    }

    this.validateAgainstConfig(config, dto);

    const entity = this.applicationRepo.create({
      postId,
      userId: applicantUserId,
      includeName: dto.includeName?.trim() ?? null,
      includeBirth: dto.includeBirth?.trim() ?? null,
      includeGender: dto.includeGender ?? null,
      includeMajor: dto.includeMajor?.trim() ?? null,
      includeMajorDetail: dto.includeMajorDetail?.trim() ?? null,
      includeEducation: dto.includeEducation?.trim() ?? null,
      includeCategory: dto.includeCategory?.trim() ?? null,
      includeMusic: dto.includeMusic?.trim() ?? null,
      includeAddress: dto.includeAddress?.trim() ?? null,
      includeFile:
        dto.includeFile === undefined ? null : dto.includeFile ? 1 : 0,
      includeLink: dto.includeLink?.trim() ?? null,
      includeDepartment: dto.includeDepartment?.trim() ?? null,
      includeCareer:
        dto.includeCareer === undefined ? null : dto.includeCareer ? 1 : 0,
      includeIntroduce: dto.includeIntroduce?.trim() ?? null,
    });

    return this.applicationRepo.save(entity);
  }

  async findMine(postId: string, userId: string): Promise<Application | null> {
    return this.applicationRepo.findOne({
      where: { postId, userId },
    });
  }

  async findAllForPost(
    postId: string,
    requestUserId: string,
  ): Promise<Application[]> {
    const announcement = await this.announcementRepo.findOne({
      where: { postId },
    });
    if (!announcement) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (announcement.userId !== requestUserId) {
      throw new ForbiddenException('공고 작성자만 지원 목록을 볼 수 있습니다.');
    }
    return this.applicationRepo.find({
      where: { postId },
      relations: { user: true },
      order: { id: 'DESC' },
    });
  }

  private validateAgainstConfig(
    config: ApplicationConfig,
    dto: CreateApplicationDto,
  ): void {
    const missing = (label: string, ok: boolean) => {
      if (!ok) {
        throw new BadRequestException(
          `지원서 양식에 포함된 항목입니다: ${label}을(를) 입력해 주세요.`,
        );
      }
    };

    if (config.includeName) {
      missing('이름', !!dto.includeName?.trim());
    }
    if (config.includeBirth) {
      missing('출생연도', !!dto.includeBirth?.trim());
    }
    if (config.includeGender) {
      missing(
        '성별',
        dto.includeGender !== undefined && dto.includeGender !== null,
      );
    }
    if (config.includeMajor) {
      missing('전공', !!dto.includeMajor?.trim());
    }
    if (config.includeMajorDetail) {
      missing('세부전공', !!dto.includeMajorDetail?.trim());
    }
    if (config.includeEducation) {
      missing('학력', !!dto.includeEducation?.trim());
    }
    if (config.includeCategory) {
      missing('참가부문', !!dto.includeCategory?.trim());
    }
    if (config.includeMusic) {
      missing('참가곡', !!dto.includeMusic?.trim());
    }
    if (config.includeAddress) {
      missing('주소', !!dto.includeAddress?.trim());
    }
    if (config.includeFile) {
      missing('파일 첨부 여부', dto.includeFile !== undefined);
    }
    if (config.includeLink) {
      missing('링크', !!dto.includeLink?.trim());
    }
    if (config.includeDepartment) {
      missing('소속학부', !!dto.includeDepartment?.trim());
    }
    if (config.includeCareer) {
      missing('경력', dto.includeCareer !== undefined);
    }
    if (config.includeIntroduce) {
      missing('자기소개/지원동기', !!dto.includeIntroduce?.trim());
    }
  }
}
