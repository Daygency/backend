import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { Community } from './entities/community.entity';
import { CommunityCategory } from './entities/community-category.entity';
import { Like, LikeType } from '../like/entities/like.entity';
import { Comment, CommentTargetType } from '../comment/entities/comment.entity';

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(CommunityCategory)
    private readonly categoryRepository: Repository<CommunityCategory>,
    @InjectRepository(Like)
    private readonly likeRepository: Repository<Like>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
  ) {}

  async create(userId: string, createCommunityDto: CreateCommunityDto) {
    const { categoryId, ...rest } = createCommunityDto;

    const category = await this.categoryRepository.findOne({
      where: { categoryId },
    });
    if (!category) {
      throw new NotFoundException('존재하지 않는 커뮤니티 카테고리입니다.');
    }

    const community = this.communityRepository.create({
      ...rest,
      category,
      user: { userId },
    });

    return this.communityRepository.save(community);
  }

  async findAll(categoryId?: string) {
    const where = categoryId ? { category: { categoryId } } : {};

    const communities = await this.communityRepository.find({
      where,
      relations: ['category', 'user', 'file'],
      order: { createdAt: 'DESC' },
    });

    const communityIds = communities.map((community) => community.communityId);
    const [likeCounts, commentCounts] = await Promise.all([
      communityIds.length
        ? this.likeRepository
            .createQueryBuilder('l')
            .select('l.targetId', 'targetId')
            .addSelect('COUNT(*)', 'count')
            .where('l.likeType = :likeType', { likeType: LikeType.COMMUNITY })
            .andWhere('l.targetId IN (:...communityIds)', { communityIds })
            .groupBy('l.targetId')
            .getRawMany<{ targetId: string; count: string }>()
        : Promise.resolve([]),
      communityIds.length
        ? this.commentRepository
            .createQueryBuilder('c')
            .select('c.targetId', 'targetId')
            .addSelect('COUNT(*)', 'count')
            .where('c.targetType = :targetType', {
              targetType: CommentTargetType.COMMUNITY,
            })
            .andWhere('c.targetId IN (:...communityIds)', { communityIds })
            .groupBy('c.targetId')
            .getRawMany<{ targetId: string; count: string }>()
        : Promise.resolve([]),
    ]);

    const likeCountMap = new Map(
      likeCounts.map((row) => [row.targetId, Number(row.count)]),
    );
    const commentCountMap = new Map(
      commentCounts.map((row) => [row.targetId, Number(row.count)]),
    );

    return communities.map((community) => ({
      ...community,
      likeCount: likeCountMap.get(community.communityId) ?? 0,
      commentCount: commentCountMap.get(community.communityId) ?? 0,
    }));
  }

  async findOne(id: string) {
    const community = await this.communityRepository.findOne({
      where: { communityId: id },
      relations: ['category', 'user', 'file'],
    });

    if (!community) {
      throw new NotFoundException('존재하지 않는 커뮤니티 게시글입니다.');
    }

    await this.communityRepository.increment({ communityId: id }, 'viewCount', 1);
    community.viewCount += 1;

    const [likeCount, commentCount] = await Promise.all([
      this.likeRepository.count({
        where: {
          likeType: LikeType.COMMUNITY,
          targetId: id,
        },
      }),
      this.commentRepository.count({
        where: {
          targetType: CommentTargetType.COMMUNITY,
          targetId: id,
        },
      }),
    ]);

    return {
      ...community,
      likeCount,
      commentCount,
    };
  }

  async update(
    userId: string,
    id: string,
    updateCommunityDto: UpdateCommunityDto,
  ) {
    const community = await this.communityRepository.findOne({
      where: { communityId: id },
      relations: ['category', 'user', 'file'],
    });

    if (!community) {
      throw new NotFoundException('존재하지 않는 커뮤니티 게시글입니다.');
    }

    if (community.user?.userId !== userId) {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

    const { categoryId, ...rest } = updateCommunityDto;

    if (categoryId !== undefined) {
      const category = await this.categoryRepository.findOne({
        where: { categoryId },
      });
      if (!category) {
        throw new NotFoundException('존재하지 않는 커뮤니티 카테고리입니다.');
      }
      community.category = category;
    }

    Object.assign(community, rest);

    return this.communityRepository.save(community);
  }

  async remove(userId: string, id: string) {
    const community = await this.communityRepository.findOne({
      where: { communityId: id },
    });

    if (!community) {
      throw new NotFoundException('존재하지 않는 커뮤니티 게시글입니다.');
    }

    if (community.user?.userId !== userId) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    await this.communityRepository.remove(community);

    return { success: true };
  }

  findAllCategories() {
    return this.categoryRepository.find({
      order: { name: 'ASC' },
    });
  }
}
