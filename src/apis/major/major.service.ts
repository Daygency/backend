import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Major } from './entities/major.entity';

@Injectable()
export class MajorService {
  constructor(
    @InjectRepository(Major)
    private readonly majorRepository: Repository<Major>,
  ) {}

  /**
   * 전공 목록 (이름 오름차순). 모집공고 `majorIds` 등에 쓰는 ID 조회용.
   */
  async findAll(): Promise<Array<{ majorId: string; name: string }>> {
    const rows = await this.majorRepository.find({
      order: { name: 'ASC' },
    });
    return rows.map((m) => ({ majorId: m.majorId, name: m.name }));
  }
}
