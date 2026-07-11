import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFaqDto } from './dto/create-faq.dto';
import { ListFaqQueryDto } from './dto/list-faq-query.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { Faq } from './entities/faq.entity';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';

function decodeFaqCursor(cursor: string): { s: number; t: string; i: string } {
  try {
    const parsed = decodeCursor(cursor) as {
      s?: unknown;
      t?: unknown;
      i?: unknown;
    };
    if (
      typeof parsed.s !== 'number' ||
      typeof parsed.t !== 'string' ||
      typeof parsed.i !== 'string'
    ) {
      throw new Error('invalid cursor shape');
    }
    return { s: parsed.s, t: parsed.t, i: parsed.i };
  } catch {
    throw new BadRequestException('유효하지 않은 cursor 입니다.');
  }
}

function encodeFaqCursor(sortOrder: number, createdAt: Date, faqId: string): string {
  return encodeCursor({ s: sortOrder, t: createdAt.toISOString(), i: faqId });
}

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(Faq)
    private readonly faqRepository: Repository<Faq>,
  ) {}

  async findActivePublic(query: ListFaqQueryDto) {
    const limit = query.limit ?? 8;
    const qb = this.faqRepository
      .createQueryBuilder('faq')
      .where('faq.isActive = :isActive', { isActive: true })
      .orderBy('faq.sortOrder', 'DESC')
      .addOrderBy('faq.createdAt', 'DESC')
      .addOrderBy('faq.faqId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { s, t, i } = decodeFaqCursor(query.cursor);
      qb.andWhere(
        `(faq.sortOrder < :s)
         OR (faq.sortOrder = :s AND faq.createdAt < :t)
         OR (faq.sortOrder = :s AND faq.createdAt = :t AND faq.faqId < :i)`,
        { s, t: new Date(t), i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeFaqCursor(last.sortOrder, last.createdAt, last.faqId)
        : null;

    return {
      items: slice.map((row) => ({
        faqId: row.faqId,
        question: row.question,
        answer: row.answer,
      })),
      nextCursor,
      hasMore,
    };
  }

  async findAllAdmin(query: ListFaqQueryDto) {
    const limit = query.limit ?? 8;
    const qb = this.faqRepository
      .createQueryBuilder('faq')
      .orderBy('faq.sortOrder', 'DESC')
      .addOrderBy('faq.createdAt', 'DESC')
      .addOrderBy('faq.faqId', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const { s, t, i } = decodeFaqCursor(query.cursor);
      qb.andWhere(
        `(faq.sortOrder < :s)
         OR (faq.sortOrder = :s AND faq.createdAt < :t)
         OR (faq.sortOrder = :s AND faq.createdAt = :t AND faq.faqId < :i)`,
        { s, t: new Date(t), i },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeFaqCursor(last.sortOrder, last.createdAt, last.faqId)
        : null;

    return { items: slice, nextCursor, hasMore };
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
