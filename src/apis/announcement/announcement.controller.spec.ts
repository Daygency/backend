import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';

describe('AnnouncementController', () => {
  let controller: AnnouncementController;
  let service: AnnouncementService;

  const mockAnnouncementService = {
    create: jest.fn(),
    findList: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementController],
      providers: [
        {
          provide: AnnouncementService,
          useValue: mockAnnouncementService,
        },
      ],
    }).compile();

    controller = module.get<AnnouncementController>(AnnouncementController);
    service = module.get<AnnouncementService>(AnnouncementService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create (모집공고 작성)', () => {
    it('create를 호출하고 목록 아이템 형태를 반환한다', async () => {
      const dto = {
        title: '공고 제목',
        content: '내용',
        deadlineAt: '2025-04-01T23:59:59.000Z',
        scheduledAt: '2025-04-15T14:00:00.000Z',
        address: '서울',
        fileId: '550e8400-e29b-41d4-a716-446655440000',
        applicationConfig: { includeName: true },
      };
      const mockResult = {
        postId: 'new-post-id',
        title: dto.title,
        type: '행사',
        isRecruiting: true,
        dDay: 'D-7',
      };
      mockAnnouncementService.create.mockResolvedValue(mockResult);

      const result = await controller.create(dto as any, {
        user: { id: 'user-123' },
      } as any);

      expect(mockAnnouncementService.create).toHaveBeenCalledWith('user-123', dto);
      expect(result).toEqual(mockResult);
    });
  });

  describe('findAll (목록 조회)', () => {
    it('findList를 호출하고 결과를 반환한다', async () => {
      const mockResult = {
        items: [{ postId: 'p1', title: '공고1', type: '행사', isRecruiting: true, dDay: 'D-7' }],
        nextCursor: null,
        hasMore: false,
      };
      mockAnnouncementService.findList.mockResolvedValue(mockResult);

      const result = await controller.findAll({ limit: 20 } as any);

      expect(mockAnnouncementService.findList).toHaveBeenCalledWith({ limit: 20 });
      expect(result).toEqual(mockResult);
    });
  });
});
