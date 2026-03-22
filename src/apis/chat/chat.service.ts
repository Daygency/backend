import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { ChatGateway } from './chat.gateway';
import { Announcement } from '../announcement/entities/announcement.entity';
import { Application } from '../application/entities/application.entity';
import { User } from '../user/entities/user.entity';
import { CreateAnnouncementChatRoomDto } from './dto/create-announcement-chat-room.dto';
import { ListChatRoomsQueryDto } from './dto/list-chat-rooms-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ChatRoom, ChatRoomKind } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';

export type MessagePayload = {
  id: string;
  chatRoomId: string;
  userId: string;
  content: string | null;
  createdAt: Date;
};

export type ChatRoomListItemDto = {
  id: string;
  kind: ChatRoomKind;
  post: { postId: string; title: string } | null;
  peer: {
    userId: string;
    nickname: string;
    activityName: string;
    profileImgUrl: string;
  };
  lastMessage: { content: string | null; createdAt: Date } | null;
  createdAt: Date;
};

export type ChatRoomListResponse = {
  items: ChatRoomListItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
};

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly chatRoomRepo: Repository<ChatRoom>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Announcement)
    private readonly announcementRepo: Repository<Announcement>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  private static orderParticipantPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  async getOrCreateCoffeeRoom(
    userId: string,
    peerUserId: string,
  ): Promise<ChatRoom> {
    if (userId === peerUserId) {
      throw new BadRequestException('자기 자신과의 채팅방은 만들 수 없습니다.');
    }
    const peer = await this.userRepo.findOne({ where: { userId: peerUserId } });
    if (!peer) {
      throw new NotFoundException('대화 상대 사용자를 찾을 수 없습니다.');
    }
    const [low, high] = ChatService.orderParticipantPair(userId, peerUserId);
    let room = await this.chatRoomRepo.findOne({
      where: {
        kind: ChatRoomKind.COFFEE,
        participantLowId: low,
        participantHighId: high,
      },
    });
    if (!room) {
      room = this.chatRoomRepo.create({
        kind: ChatRoomKind.COFFEE,
        participantLowId: low,
        participantHighId: high,
        postId: null,
        applicantUserId: null,
        formId: null,
      });
      room = await this.chatRoomRepo.save(room);
    }
    return room;
  }

  async createAnnouncementChatRoom(
    currentUserId: string,
    dto: CreateAnnouncementChatRoomDto,
  ): Promise<ChatRoom> {
    const post = await this.announcementRepo.findOne({
      where: { postId: dto.postId },
    });
    if (!post) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }

    let applicantUserId: string;
    if (dto.applicantUserId === undefined) {
      applicantUserId = currentUserId;
    } else {
      if (post.userId !== currentUserId) {
        throw new ForbiddenException(
          '공고 작성자만 지원자를 지정할 수 있습니다.',
        );
      }
      applicantUserId = dto.applicantUserId;
    }

    if (post.userId === applicantUserId) {
      throw new BadRequestException(
        '공고 작성자 본인은 지원자 채팅방 대상이 될 수 없습니다.',
      );
    }

    const applicant = await this.userRepo.findOne({
      where: { userId: applicantUserId },
    });
    if (!applicant) {
      throw new NotFoundException('지원자 사용자를 찾을 수 없습니다.');
    }

    const submitted = await this.applicationRepo.findOne({
      where: { postId: dto.postId, userId: applicantUserId },
    });
    if (!submitted) {
      throw new BadRequestException(
        '해당 공고에 지원을 완료한 뒤에만 채팅방을 열 수 있습니다.',
      );
    }

    let room = await this.chatRoomRepo.findOne({
      where: {
        kind: ChatRoomKind.ANNOUNCEMENT,
        postId: dto.postId,
        applicantUserId,
      },
    });
    if (!room) {
      room = this.chatRoomRepo.create({
        kind: ChatRoomKind.ANNOUNCEMENT,
        postId: dto.postId,
        applicantUserId,
        participantLowId: null,
        participantHighId: null,
        formId: submitted.id,
      });
      room = await this.chatRoomRepo.save(room);
    }
    return room;
  }

  /**
   * 지원서 제출 직후: 공고–지원자 1:1 채팅방을 만들고 첫 메시지를 남깁니다.
   * 방이 이미 있으면(동시 요청 등) 메시지는 보내지 않습니다.
   */
  async ensureAnnouncementRoomAfterApply(
    applicantUserId: string,
    postId: string,
    applicationId: string,
  ): Promise<void> {
    let room = await this.chatRoomRepo.findOne({
      where: {
        kind: ChatRoomKind.ANNOUNCEMENT,
        postId,
        applicantUserId,
      },
    });
    let isNewRoom = false;
    if (!room) {
      room = this.chatRoomRepo.create({
        kind: ChatRoomKind.ANNOUNCEMENT,
        postId,
        applicantUserId,
        participantLowId: null,
        participantHighId: null,
        formId: applicationId,
      });
      try {
        room = await this.chatRoomRepo.save(room);
        isNewRoom = true;
      } catch (err) {
        const dup =
          err instanceof QueryFailedError &&
          (err as QueryFailedError).driverError &&
          (err as QueryFailedError).driverError['errno'] === 1062;
        if (!dup) {
          throw err;
        }
        room = await this.chatRoomRepo.findOne({
          where: {
            kind: ChatRoomKind.ANNOUNCEMENT,
            postId,
            applicantUserId,
          },
        });
        if (!room) {
          throw err;
        }
      }
    }
    if (!room) {
      return;
    }

    if (!isNewRoom) {
      return;
    }

    const post = await this.announcementRepo.findOne({ where: { postId } });
    const title = post?.title?.trim() ? post.title.trim() : '공고';
    const msg = `[${title}] 공고에 신청하였습니다.`;
    await this.createMessage(room.id, applicantUserId, msg);
  }

  async findRoomForUserOrThrow(
    roomId: string,
    userId: string,
  ): Promise<ChatRoom> {
    const room = await this.chatRoomRepo.findOne({
      where: { id: roomId },
      relations: { announcement: true },
    });
    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }
    if (room.kind === ChatRoomKind.COFFEE) {
      if (
        room.participantLowId !== userId &&
        room.participantHighId !== userId
      ) {
        throw new ForbiddenException('이 채팅방에 참여할 수 없습니다.');
      }
      return room;
    }
    const post = room.announcement
      ? room.announcement
      : await this.announcementRepo.findOne({
          where: { postId: room.postId! },
        });
    if (!post) {
      throw new NotFoundException('연결된 공고를 찾을 수 없습니다.');
    }
    const isRecruiter = post.userId === userId;
    const isApplicant = room.applicantUserId === userId;
    if (!isRecruiter && !isApplicant) {
      throw new ForbiddenException('이 채팅방에 참여할 수 없습니다.');
    }
    return room;
  }

  async findRoomByIdOrThrow(id: string): Promise<ChatRoom> {
    const room = await this.chatRoomRepo.findOne({ where: { id } });
    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }
    return room;
  }

  async createMessage(
    chatRoomId: string,
    userId: string,
    content: string | undefined,
  ): Promise<MessagePayload> {
    await this.findRoomForUserOrThrow(chatRoomId, userId);
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        content: content?.trim() ? content.trim() : null,
        chatRoom: { id: chatRoomId },
        user: { userId } as User,
      }),
    );
    const payload: MessagePayload = {
      id: message.id,
      chatRoomId,
      userId,
      content: message.content,
      createdAt: message.createdAt,
    };
    this.chatGateway.emitMessageToRoom(chatRoomId, payload);
    return payload;
  }

  async listMessages(
    chatRoomId: string,
    userId: string,
    query: ListMessagesQueryDto,
  ): Promise<{
    items: MessagePayload[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.findRoomForUserOrThrow(chatRoomId, userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [rows, total] = await this.messageRepo.findAndCount({
      where: { chatRoom: { id: chatRoomId } },
      relations: { user: true, chatRoom: true },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      items: rows.map((m) => this.toMessagePayload(m)),
      total,
      page,
      limit,
    };
  }

  async listCoffeeRooms(
    userId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const limit = query.limit ?? 20;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .where('room.kind = :kind', { kind: ChatRoomKind.COFFEE })
      .andWhere(
        '(room.participantLowId = :uid OR room.participantHighId = :uid)',
        { uid: userId },
      )
      .orderBy('room.id', 'DESC')
      .take(limit + 1);
    if (query.cursor) {
      qb.andWhere('room.id < :cursor', { cursor: query.cursor });
    }
    const rows = await qb.getMany();
    return this.toRoomListPage(rows, limit, userId);
  }

  /** 내가 지원자인 공고 1:1 채팅방 (공고당·지원자당 1방) */
  async listAppliedAnnouncementRooms(
    userId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const limit = query.limit ?? 20;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.announcement', 'announcement')
      .where('room.kind = :kind', { kind: ChatRoomKind.ANNOUNCEMENT })
      .andWhere('room.applicantUserId = :uid', { uid: userId })
      .orderBy('room.id', 'DESC')
      .take(limit + 1);
    if (query.cursor) {
      qb.andWhere('room.id < :cursor', { cursor: query.cursor });
    }
    const rows = await qb.getMany();
    return this.toRoomListPage(rows, limit, userId);
  }

  /** 내가 작성한 공고 하나에 대해, 지원자별 1:1 채팅방 목록 (작성자 전용) */
  async listRoomsForMyAnnouncement(
    postId: string,
    recruiterUserId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const post = await this.announcementRepo.findOne({ where: { postId } });
    if (!post) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (post.userId !== recruiterUserId) {
      throw new ForbiddenException('본인이 작성한 공고만 조회할 수 있습니다.');
    }
    const limit = query.limit ?? 20;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.announcement', 'announcement')
      .where('room.kind = :kind', { kind: ChatRoomKind.ANNOUNCEMENT })
      .andWhere('room.postId = :postId', { postId })
      .orderBy('room.id', 'DESC')
      .take(limit + 1);
    if (query.cursor) {
      qb.andWhere('room.id < :cursor', { cursor: query.cursor });
    }
    const rows = await qb.getMany();
    return this.toRoomListPage(rows, limit, recruiterUserId);
  }

  private async toRoomListPage(
    rows: ChatRoom[],
    limit: number,
    currentUserId: string,
  ): Promise<ChatRoomListResponse> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;
    const mapped = await this.mapRoomsToListItems(items, currentUserId);
    return { items: mapped, nextCursor, hasMore };
  }

  private async mapRoomsToListItems(
    rooms: ChatRoom[],
    currentUserId: string,
  ): Promise<ChatRoomListItemDto[]> {
    if (rooms.length === 0) return [];
    const roomIds = rooms.map((r) => r.id);
    const lastByRoom = await this.loadLastMessageByRoomIds(roomIds);

    const peerIds = new Set<string>();
    for (const room of rooms) {
      const pid = this.resolvePeerUserId(room, currentUserId);
      if (pid) peerIds.add(pid);
    }
    const peers = await this.userRepo.find({
      where: { userId: In([...peerIds]) },
    });
    const peerMap = new Map(peers.map((u) => [u.userId, u]));

    return rooms.map((room) => {
      const peerId = this.resolvePeerUserId(room, currentUserId);
      const peerUser = peerId ? peerMap.get(peerId) : undefined;
      const post =
        room.kind === ChatRoomKind.ANNOUNCEMENT && room.announcement
          ? {
              postId: room.announcement.postId,
              title: room.announcement.title,
            }
          : null;

      return {
        id: room.id,
        kind: room.kind,
        post,
        peer: peerUser
          ? {
              userId: peerUser.userId,
              nickname: peerUser.nickname,
              activityName: peerUser.activityName,
              profileImgUrl: peerUser.profileImgUrl,
            }
          : {
              userId: peerId ?? '',
              nickname: '알 수 없음',
              activityName: '',
              profileImgUrl: '',
            },
        lastMessage: lastByRoom.get(room.id) ?? null,
        createdAt: room.createdAt,
      };
    });
  }

  private resolvePeerUserId(
    room: ChatRoom,
    currentUserId: string,
  ): string | null {
    if (room.kind === ChatRoomKind.COFFEE) {
      if (room.participantLowId === currentUserId) {
        return room.participantHighId;
      }
      if (room.participantHighId === currentUserId) {
        return room.participantLowId;
      }
      return null;
    }
    if (room.applicantUserId === currentUserId) {
      return room.announcement?.userId ?? null;
    }
    return room.applicantUserId;
  }

  private async loadLastMessageByRoomIds(
    roomIds: string[],
  ): Promise<Map<string, { content: string | null; createdAt: Date }>> {
    const result = new Map<
      string,
      { content: string | null; createdAt: Date }
    >();
    if (roomIds.length === 0) return result;
    const placeholders = roomIds.map(() => '?').join(',');
    const rows: Array<{
      roomId: string;
      content: string | null;
      createdAt: Date | string;
    }> = await this.messageRepo.query(
      `SELECT m.chat_room_id AS roomId, m.content AS content, m.created_at AS createdAt
       FROM message m
       INNER JOIN (
         SELECT chat_room_id, MAX(created_at) AS max_c
         FROM message
         WHERE chat_room_id IN (${placeholders})
         GROUP BY chat_room_id
       ) t ON m.chat_room_id = t.chat_room_id AND m.created_at = t.max_c`,
      roomIds,
    );
    for (const row of rows) {
      result.set(row.roomId, {
        content: row.content,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
      });
    }
    return result;
  }

  private toMessagePayload(message: Message): MessagePayload {
    return {
      id: message.id,
      chatRoomId: message.chatRoom.id,
      userId: message.user.userId,
      content: message.content,
      createdAt: message.createdAt,
    };
  }
}
