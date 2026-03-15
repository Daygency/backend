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

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(Community)
    private readonly communityRepository: Repository<Community>,
    @InjectRepository(CommunityCategory)
    private readonly categoryRepository: Repository<CommunityCategory>,
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

  findAll() {
    return this.communityRepository.find({
      relations: ['category', 'user', 'file'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const community = await this.communityRepository.findOne({
      where: { communityId: id },
      relations: ['category', 'user', 'file'],
    });

    if (!community) {
      throw new NotFoundException('존재하지 않는 커뮤니티 게시글입니다.');
    }

    return community;
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
