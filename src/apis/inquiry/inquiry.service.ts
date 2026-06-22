import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Express } from 'express';
import { Repository } from 'typeorm';
import { FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { NoticeTargetType } from '../notice/entities/notice.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';
import { ListAdminInquiriesQueryDto } from './dto/list-admin-inquiries-query.dto';
import { Inquiry } from './entities/inquiry.entity';

const MAX_INQUIRY_IMAGES = 3;

export type InquiryDto = {
  id: string;
  content: string;
  imageUrls: string[];
  isAnswered: boolean;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
  userId?: string;
  userName?: string | null;
  userActivityName?: string;
};

@Injectable()
export class InquiryService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepository: Repository<Inquiry>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly fileService: FileService,
    private readonly noticeService: NoticeService,
  ) {}

  async create(
    userId: string,
    content: string,
    files: Express.Multer.File[],
  ): Promise<InquiryDto> {
    const trimmed = content?.trim();
    if (!trimmed) {
      throw new BadRequestException('문의 내용을 입력해 주세요.');
    }

    const inquiry = await this.inquiryRepository.save(
      this.inquiryRepository.create({
        content: trimmed,
        user: { userId } as User,
        imageUrls: null,
      }),
    );

    const slice = (files ?? []).filter((f) => f?.buffer?.length).slice(0, MAX_INQUIRY_IMAGES);
    const imageUrls: string[] = [];
    for (let i = 0; i < slice.length; i++) {
      const file = slice[i];
      const uploaded = await this.fileService.uploadAndSave({
        buffer: file.buffer,
        originalName: file.originalname || `inquiry_${i}.jpg`,
        contentType: file.mimetype || 'image/jpeg',
        targetType: FileTargetType.INQUIRY,
        targetId: inquiry.id,
        sortOrder: i,
      });
      imageUrls.push(uploaded.imgUrl);
    }

    if (imageUrls.length) {
      inquiry.imageUrls = imageUrls;
      await this.inquiryRepository.save(inquiry);
    }

    return this.toDto(inquiry, userId);
  }

  async listMine(userId: string): Promise<InquiryDto[]> {
    const rows = await this.inquiryRepository.find({
      where: { user: { userId } },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toDto(row, userId));
  }

  async findMine(userId: string, inquiryId: string): Promise<InquiryDto> {
    const row = await this.inquiryRepository.findOne({
      where: { id: inquiryId, user: { userId } },
      relations: { user: true },
    });
    if (!row) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    return this.toDto(row, userId);
  }

  async listForAdmin(query: ListAdminInquiriesQueryDto): Promise<InquiryDto[]> {
    const qb = this.inquiryRepository
      .createQueryBuilder('inquiry')
      .leftJoinAndSelect('inquiry.user', 'user')
      .orderBy('inquiry.createdAt', 'DESC');

    if (query.status === 'answered') {
      qb.andWhere('inquiry.answer IS NOT NULL');
    } else if (query.status === 'unanswered') {
      qb.andWhere('inquiry.answer IS NULL');
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.toDto(row));
  }

  async findForAdmin(inquiryId: string): Promise<InquiryDto> {
    const row = await this.inquiryRepository.findOne({
      where: { id: inquiryId },
      relations: { user: true },
    });
    if (!row) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    return this.toDto(row);
  }

  async reply(
    inquiryId: string,
    answer: string,
    actorUserId: string,
  ): Promise<InquiryDto> {
    const row = await this.inquiryRepository.findOne({
      where: { id: inquiryId },
      relations: { user: true },
    });
    if (!row) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    const trimmed = answer?.trim();
    if (!trimmed) {
      throw new BadRequestException('답변 내용을 입력해 주세요.');
    }

    row.answer = trimmed;
    row.answeredAt = new Date();
    await this.inquiryRepository.save(row);

    const recipientUserId = row.user?.userId;
    if (recipientUserId) {
      await this.noticeService.createAndDispatchPush({
        actorUserId,
        targetType: NoticeTargetType.INQUIRY,
        targetId: row.id,
        content: '고객센터 문의에 답변이 등록되었습니다.',
        recipientUserIds: [recipientUserId],
      });
    }

    return this.toDto(row);
  }

  private toDto(row: Inquiry, viewerUserId?: string): InquiryDto {
    return {
      id: row.id,
      content: row.content,
      imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
      isAnswered: Boolean(row.answer?.trim()),
      answer: row.answer,
      createdAt: row.createdAt.toISOString(),
      answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
      userId: row.user?.userId ?? viewerUserId,
      userName: row.user?.name,
      userActivityName: row.user?.activityName,
    };
  }
}
