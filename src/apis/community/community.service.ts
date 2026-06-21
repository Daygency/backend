import type { Express } from 'express';
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
import { File, FileTargetType } from '../file/entities/file.entity';
import { FileService } from '../file/file.service';
import { CommunityFileService } from './community-file.service';
import { toLikePattern } from '../../common/escape-like-pattern.util';

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
    private readonly fileService: FileService,
    private readonly communityFileService: CommunityFileService,
  ) {}

  async create(
    userId: string,
    createCommunityDto: CreateCommunityDto,
    files?: Express.Multer.File[],
  ) {
    const { categoryId, fileId: dtoFileId, ...rest } = createCommunityDto;

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
      file: dtoFileId ? { fileId: dtoFileId } : null,
    });

    const saved = await this.communityRepository.save(community);

    let uploaded: File[] = [];
    if (files?.length) {
      uploaded = await this.communityFileService.attachFilesToPost(
        saved.communityId,
        files.map((f, i) => ({
          buffer: f.buffer,
          originalName: f.originalname,
          contentType: f.mimetype,
          sortOrder: i,
        })),
      );
      const primaryFileId = dtoFileId ?? uploaded[0]?.fileId ?? null;
      if (primaryFileId) {
        await this.communityRepository.save({
          ...saved,
          file: { fileId: primaryFileId } as File,
        });
      }
    }

    const attachments = uploaded.map((f) => ({
      fileId: f.fileId,
      imgUrl: f.imgUrl,
      sortOrder: f.sortOrder,
    }));

    return {
      ...saved,
      attachments,
    };
  }

  async findAll(categoryId?: string, q?: string) {
    const likeQ = q ? toLikePattern(q) : null;
    const qb = this.communityRepository
      .createQueryBuilder('community')
      .leftJoinAndSelect('community.category', 'category')
      .leftJoinAndSelect('community.user', 'user')
      .leftJoinAndSelect('community.file', 'file')
      .orderBy('community.createdAt', 'DESC');

    if (categoryId) {
      qb.andWhere('category.categoryId = :categoryId', { categoryId });
    }
    if (likeQ) {
      qb.andWhere(
        '(community.title LIKE :likeQ ESCAPE \'\\\\\' OR community.content LIKE :likeQ ESCAPE \'\\\\\')',
        { likeQ },
      );
    }

    const communities = await qb.getMany();

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

    const thumbMap =
      await this.fileService.getSmallestOrderThumbnailByTargetIds(
        FileTargetType.COMMUNITY,
        communityIds,
      );

    return communities.map((community) => ({
      ...community,
      likeCount: likeCountMap.get(community.communityId) ?? 0,
      commentCount: commentCountMap.get(community.communityId) ?? 0,
      /** `file.type`+`target_id` 첨부 중 `order` 최소 1장, 없으면 기존 `file_id` 대표 이미지 */
      thumbnailUrl:
        thumbMap.get(community.communityId)?.imgUrl ??
        community.file?.imgUrl ??
        null,
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
