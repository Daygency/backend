import { BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export async function parseAndValidateJsonPayload<T extends object>(
  cls: ClassConstructor<T>,
  json: string,
): Promise<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BadRequestException(
      'payload 필드가 올바른 JSON 문자열이 아닙니다.',
    );
  }
  const dto = plainToInstance(cls, raw);
  const errors = await validate(dto as object);
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .filter(Boolean);
    throw new BadRequestException(messages.join('; ') || '유효성 검사 실패');
  }
  return dto;
}
