import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FollowService } from '../follow/follow.service';
import { User } from '../user/entities/user.entity';
import { Block } from './entities/block.entity';

@Injectable()
export class BlockService {
  constructor(
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly followService: FollowService,
  ) {}

  /**
   * 차단 등록 시 양방향 팔로우(sender↔receiver) 모두 삭제 후 block 행 저장
   */
  async block(blockerId: string, blockedId: string): Promise<Block> {
    if (blockerId === blockedId) {
      throw new BadRequestException('자기 자신을 차단할 수 없습니다.');
    }
    const target = await this.userRepo.findOne({
      where: { userId: blockedId },
    });
    if (!target) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    const dup = await this.blockRepo.findOne({
      where: { blockerId, blockedId },
    });
    if (dup) {
      throw new ConflictException('이미 차단한 사용자입니다.');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.followService.removeFollowsBetween(
        manager,
        blockerId,
        blockedId,
      );
      const entity = manager.create(Block, {
        blockerId,
        blockedId,
        blockAt: new Date(),
      });
      return manager.save(entity);
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const result = await this.blockRepo.delete({ blockerId, blockedId });
    if (result.affected === 0) {
      throw new NotFoundException('차단 관계가 없습니다.');
    }
  }
}
