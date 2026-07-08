import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { Faq } from './entities/faq.entity';

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(Faq)
    private readonly faqRepository: Repository<Faq>,
  ) {}

  async findActivePublic() {
    const rows = await this.faqRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      faqId: row.faqId,
      question: row.question,
      answer: row.answer,
    }));
  }

  async findAllAdmin() {
    return this.faqRepository.find({
      order: { sortOrder: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOneAdmin(faqId: string) {
    const faq = await this.faqRepository.findOne({ where: { faqId } });
    if (!faq) {
      throw new NotFoundException('FAQ를 찾을 수 없습니다.');
    }
    return faq;
  }

  async create(dto: CreateFaqDto) {
    const faq = this.faqRepository.create({
      question: dto.question.trim(),
      answer: dto.answer.trim(),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.faqRepository.save(faq);
  }

  async update(faqId: string, dto: UpdateFaqDto) {
    const faq = await this.faqRepository.findOne({ where: { faqId } });
    if (!faq) {
      throw new NotFoundException('FAQ를 찾을 수 없습니다.');
    }

    if (dto.question !== undefined) {
      faq.question = dto.question.trim();
    }
    if (dto.answer !== undefined) {
      faq.answer = dto.answer.trim();
    }
    if (dto.sortOrder !== undefined) {
      faq.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      faq.isActive = dto.isActive;
    }

    return this.faqRepository.save(faq);
  }

  async remove(faqId: string) {
    const faq = await this.faqRepository.findOne({ where: { faqId } });
    if (!faq) {
      throw new NotFoundException('FAQ를 찾을 수 없습니다.');
    }
    await this.faqRepository.remove(faq);
    return { success: true };
  }
}
