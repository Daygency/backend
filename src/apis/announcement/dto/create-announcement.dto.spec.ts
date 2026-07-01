import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAnnouncementDto } from './create-announcement.dto';
import {
  AnnouncementPriceType,
  AnnouncementStatus,
  ANNOUNCEMENT_PRICE_MAX,
} from '../entities/announcement.entity';

describe('CreateAnnouncementDto', () => {
  const validDto = {
    title: '2025 봄 정기연주회',
    content: '내용입니다',
    deadlineAt: '2025-04-01T23:59:59.000Z',
    scheduledAt: '2025-04-15T14:00:00.000Z',
    status: AnnouncementStatus.OPEN,
    address: '서울시 강남구',
    fileId: '550e8400-e29b-41d4-a716-446655440000',
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
    majorIds: ['550e8400-e29b-41d4-a716-446655440000'],
    applicationConfig: {
      includeName: true,
      includeBirth: false,
    },
  };

  it('유효한 DTO는 검증을 통과한다', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, validDto);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('title이 없으면 실패한다', async () => {
    const invalid = { ...validDto, title: undefined };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.find((e) => e.property === 'title')).toBeDefined();
  });

  it('content가 없으면 실패한다', async () => {
    const invalid = { ...validDto, content: undefined };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'content')).toBeDefined();
  });

  it('deadlineAt이 잘못된 형식이면 실패한다', async () => {
    const invalid = { ...validDto, deadlineAt: 'invalid-date' };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'deadlineAt')).toBeDefined();
  });

  it('deadlineAt을 생략하거나 null이면 상시 모집으로 통과한다', async () => {
    for (const deadlineAt of [undefined, null]) {
      const dto = plainToInstance(CreateAnnouncementDto, {
        ...validDto,
        deadlineAt,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('fileId가 UUID 형식이 아니면 실패한다', async () => {
    const invalid = { ...validDto, fileId: 'not-uuid' };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'fileId')).toBeDefined();
  });

  it('address가 없으면 실패한다', async () => {
    const invalid = { ...validDto, address: undefined };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'address')).toBeDefined();
  });

  it('applicationConfig가 없으면 실패한다', async () => {
    const invalid = { ...validDto, applicationConfig: undefined };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(
      errors.find((e) => e.property === 'applicationConfig'),
    ).toBeDefined();
  });

  it('categoryId가 UUID 형식이 아니면 실패한다', async () => {
    const invalid = { ...validDto, categoryId: 'not-uuid' };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'categoryId')).toBeDefined();
  });

  it('price가 0 미만이면 실패한다', async () => {
    const invalid = { ...validDto, price: -1 };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'price')).toBeDefined();
  });

  it('price가 상한을 초과하면 실패한다', async () => {
    const invalid = { ...validDto, price: ANNOUNCEMENT_PRICE_MAX + 1 };
    const dto = plainToInstance(CreateAnnouncementDto, invalid);
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'price')).toBeDefined();
  });

  it('price가 0 이상 정수면 통과한다', async () => {
    for (const price of [0, 100]) {
      const dto = plainToInstance(CreateAnnouncementDto, {
        ...validDto,
        price,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('priceType이 선택 가능한 값이면 통과한다', async () => {
    for (const priceType of [
      AnnouncementPriceType.PENDING,
      AnnouncementPriceType.FREE,
      AnnouncementPriceType.INCOME,
    ]) {
      const dto = plainToInstance(CreateAnnouncementDto, {
        ...validDto,
        priceType,
        price: 0,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('priceType이 EXPENSE(레거시)이면 실패한다', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      ...validDto,
      priceType: AnnouncementPriceType.EXPENSE,
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'priceType')).toBeDefined();
  });

  it('priceType이 잘못된 값이면 실패한다', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      ...validDto,
      priceType: 'INVALID',
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'priceType')).toBeDefined();
  });
});
