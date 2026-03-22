/* eslint-disable @typescript-eslint/unbound-method -- Jest matchers */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- test mocks */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementService } from './announcement.service';
import { Announcement } from './entities/announcement.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { Major } from '../major/entities/major.entity';
import { AnnouncementStatus } from './entities/announcement.entity';
import { AnnouncementCategory } from './entities/announcement-category.entity';
import { AnnouncementFileService } from './announcement-file.service';

describe('AnnouncementService', () => {
  let service: AnnouncementService;
  let announcementRepository: jest.Mocked<Repository<Announcement>>;
  let applicationConfigRepository: jest.Mocked<Repository<ApplicationConfig>>;

  const mockUserId = 'user-uuid-1234';
  const mockFileId = 'file-uuid-5678';

  const mockMajorId = '550e8400-e29b-41d4-a716-446655440000';
  const mockCategoryId = '550e8400-e29b-41d4-a716-446655440002';
  const mockCategory = {
    categoryId: mockCategoryId,
    name: '행사',
    announcements: [],
  } as AnnouncementCategory;
  const validCreateDto = {
    title: '2025 봄 정기연주회',
    content: '모집 내용입니다.',
    deadlineAt: '2025-04-15T23:59:59.000Z',
    scheduledAt: '2025-04-20T14:00:00.000Z',
    address: '서울시 강남구',
    fileId: mockFileId,
    categoryId: mockCategoryId,
    majorIds: [mockMajorId],
    applicationConfig: {
      includeName: true,
      includeBirth: false,
      includeMajor: true,
    },
  };

  const mockSavedAnnouncement: Partial<Announcement> = {
    postId: 'post-uuid-9999',
    title: validCreateDto.title,
    content: validCreateDto.content,
    deadlineAt: new Date(validCreateDto.deadlineAt),
    scheduledAt: new Date(validCreateDto.scheduledAt),
    status: AnnouncementStatus.OPEN,
    address: validCreateDto.address,
    fileId: mockFileId,
    category: mockCategory,
    majors: [],
  };

  beforeEach(async () => {
    const mockMajorRepo = {
      find: jest.fn().mockResolvedValue([{ majorId: mockMajorId }]),
    };

    const mockCategoryRepo = {
      findOne: jest.fn().mockResolvedValue(mockCategory),
    };

    const mockAnnouncementRepo = {
      create: jest.fn().mockReturnValue({ ...mockSavedAnnouncement }),
      save: jest.fn().mockResolvedValue({ ...mockSavedAnnouncement }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue({
        ...mockSavedAnnouncement,
        category: mockCategory,
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const mockApplicationConfigRepo = {
      create: jest.fn().mockImplementation((obj: object) => obj),
      save: jest.fn().mockResolvedValue({
        postId: mockSavedAnnouncement.postId ?? 'post-uuid-9999',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementService,
        {
          provide: getRepositoryToken(Announcement),
          useValue: mockAnnouncementRepo,
        },
        {
          provide: getRepositoryToken(ApplicationConfig),
          useValue: mockApplicationConfigRepo,
        },
        {
          provide: getRepositoryToken(Major),
          useValue: mockMajorRepo,
        },
        {
          provide: getRepositoryToken(AnnouncementCategory),
          useValue: mockCategoryRepo,
        },
        {
          provide: AnnouncementFileService,
          useValue: {
            attachFilesToPost: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<AnnouncementService>(AnnouncementService);
    announcementRepository = module.get(getRepositoryToken(Announcement));
    applicationConfigRepository = module.get(
      getRepositoryToken(ApplicationConfig),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('announcement와 application_config가 함께 저장되어야 한다', async () => {
      await service.create(
        mockUserId,
        validCreateDto as Parameters<AnnouncementService['create']>[1],
      );

      expect(announcementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          title: validCreateDto.title,
          content: validCreateDto.content,
          address: validCreateDto.address,
          fileId: mockFileId,
          category: mockCategory,
          majors: expect.arrayContaining([
            expect.objectContaining({ majorId: mockMajorId } as object),
          ] as unknown[]),
        } as object),
      );
      expect(announcementRepository.save).toHaveBeenCalled();
      expect(applicationConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: mockSavedAnnouncement.postId,
          includeName: true,
          includeBirth: false,
          includeMajor: true,
        } as object),
      );
      expect(applicationConfigRepository.save).toHaveBeenCalled();
    });

    it('반환값이 목록 아이템 형태(postId, title, type, isRecruiting, dDay)여야 한다', async () => {
      const result = await service.create(
        mockUserId,
        validCreateDto as Parameters<AnnouncementService['create']>[1],
      );

      expect(result).toMatchObject({
        postId: mockSavedAnnouncement.postId,
        title: validCreateDto.title,
        type: '행사',
        isRecruiting: true,
        attachments: [],
      });
      expect(result).toHaveProperty('dDay');
      expect(typeof result.dDay).toBe('string');
      expect(
        ['D-', 'D-Day', '마감'].some(
          (x) => result.dDay.startsWith(x) || result.dDay === x,
        ),
      ).toBe(true);
    });

    it('status가 CLOSED면 isRecruiting이 false여야 한다', async () => {
      const closedAnnouncement = {
        ...mockSavedAnnouncement,
        category: mockCategory,
        status: AnnouncementStatus.CLOSED,
      };
      (announcementRepository.save as jest.Mock).mockResolvedValue(
        closedAnnouncement,
      );
      (announcementRepository.findOne as jest.Mock).mockResolvedValue(
        closedAnnouncement,
      );

      const result = await service.create(mockUserId, {
        ...validCreateDto,
        status: AnnouncementStatus.CLOSED,
      } as Parameters<AnnouncementService['create']>[1]);

      expect(result.isRecruiting).toBe(false);
    });
  });

  describe('findList', () => {
    it('items, nextCursor, hasMore를 반환해야 한다', async () => {
      const result = await service.findList({});

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.items)).toBe(true);
      expect(
        result.nextCursor === null || typeof result.nextCursor === 'string',
      ).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');
    });

    it('조회된 공고의 각 아이템이 목록 형태여야 한다', async () => {
      const mockAnnouncements = [
        {
          postId: 'post-1',
          title: '공고1',
          deadlineAt: new Date('2025-04-20'),
          scheduledAt: new Date('2025-04-25'),
          status: AnnouncementStatus.OPEN,
          category: { categoryId: 'cat-1', name: '마스터클래스' },
          address: 'addr1',
          content: 'c',
          userId: 'u',
          fileId: 'f',
          majors: [],
        },
      ] as unknown as Announcement[];

      const getManyMock = jest.fn().mockResolvedValue(mockAnnouncements);
      (announcementRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: getManyMock,
      });

      const result = await service.findList({ limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        postId: 'post-1',
        title: '공고1',
        type: '마스터클래스',
        isRecruiting: true,
      });
      expect(result.items[0]).toHaveProperty('dDay');
    });

    it('limit보다 많으면 hasMore가 true이고 nextCursor가 설정되어야 한다', async () => {
      const mockAnnouncements = Array(11)
        .fill(null)
        .map((_, i) => ({
          postId: `post-${i}`,
          title: `공고${i}`,
          deadlineAt: new Date('2025-04-20'),
          scheduledAt: new Date('2025-04-25'),
          status: AnnouncementStatus.OPEN,
          category: { categoryId: 'cat-1', name: '행사' },
          address: 'addr',
          content: 'c',
          userId: 'u',
          fileId: 'f',
          majors: [],
        })) as unknown as Announcement[];

      (announcementRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockAnnouncements),
      });

      const result = await service.findList({ limit: 10 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('post-9');
      expect(result.items).toHaveLength(10);
    });

    it('status 필터가 전달되면 andWhere가 호출되어야 한다', async () => {
      const andWhereMock = jest.fn().mockReturnThis();
      (announcementRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: andWhereMock,
        getMany: jest.fn().mockResolvedValue([]),
      });

      await service.findList({ status: AnnouncementStatus.OPEN });

      expect(andWhereMock).toHaveBeenCalledWith(
        'announcement.status = :status',
        {
          status: AnnouncementStatus.OPEN,
        },
      );
    });

    it('cursor가 전달되면 andWhere에 cursor 조건이 포함되어야 한다', async () => {
      const andWhereMock = jest.fn().mockReturnThis();
      (announcementRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: andWhereMock,
        getMany: jest.fn().mockResolvedValue([]),
      });

      await service.findList({ cursor: 'some-post-id' });

      expect(andWhereMock).toHaveBeenCalledWith(
        'announcement.postId < :cursor',
        {
          cursor: 'some-post-id',
        },
      );
    });
  });
});
