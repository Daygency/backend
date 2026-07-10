import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { ChatGateway } from './chat.gateway';
import { Announcement } from '../announcement/entities/announcement.entity';
import { Application } from '../application/entities/application.entity';
import { NoticeService } from '../notice/notice.service';
import { User } from '../user/entities/user.entity';
import { CreateAnnouncementChatRoomDto } from './dto/create-announcement-chat-room.dto';
import { ListChatRoomsQueryDto } from './dto/list-chat-rooms-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { MarkChatRoomReadDto } from './dto/mark-chat-room-read.dto';
import { ChatRoomMember } from './entities/chat-room-member.entity';
import { ChatRoom, ChatRoomKind } from './entities/chat-room.entity';
import { FileService } from '../file/file.service';
import { Message, MessageFileItem } from './entities/message.entity';

export type MessagePayload = {
  id: string;
  chatRoomId: string;
  userId: string;
  content: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileItems?: MessageFileItem[] | null;
  createdAt: Date;
  /** 방의 다른 멤버(1:1 기준 상대방)가 이 메시지를 읽었는지 — 목록 조회 시에만 채워짐 */
  readByPeer?: boolean;
};

export type ChatRoomListItemDto = {
  id: string;
  kind: ChatRoomKind;
  post: { postId: string; title: string } | null;
  peer: {
    userId: string;
    name: string | null;
    activityName: string;
    profileImgUrl: string;
  };
  lastMessage: {
    content: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileMime?: string | null;
    fileItems?: MessageFileItem[] | null;
    createdAt: Date;
  } | null;
  /** 이 방에서 내가 아직 안 읽은 메시지 수 (그룹 확장 시에도 멤버별 커서 기반이라 동일하게 동작) */
  unreadCount: number;
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
    @InjectRepository(ChatRoomMember)
    private readonly chatRoomMemberRepo: Repository<ChatRoomMember>,
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
    private readonly fileService: FileService,
    private readonly noticeService: NoticeService,
  ) {}

  private decodeRepeatedly(value: string): string {
    let decoded = value;
    for (let i = 0; i < 5; i += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
    }
    return decoded;
  }

  private normalizeFileName(value: string): string {
    const decoded = this.decodeRepeatedly(value);
    const withoutQuery = decoded.split('?')[0]?.split('#')[0] ?? decoded;
    const baseName =
      withoutQuery.split(/[\\/]/).filter(Boolean).pop() ?? withoutQuery;
    return baseName.normalize('NFC').trim();
  }

  private recoverMulterOriginalName(value: string): string {
    const normalized = this.normalizeFileName(value);
    const looksMojibake = /[ÃÂâ€áÅìíë]/.test(normalized);
    if (!looksMojibake) return normalized;

    try {
      const recovered = Buffer.from(normalized, 'latin1')
        .toString('utf8')
        .normalize('NFC')
        .trim();
      if (recovered && !recovered.includes('�')) {
        return this.normalizeFileName(recovered);
      }
    } catch {
      // Keep the original normalized value if latin1 recovery is not applicable.
    }

    return normalized;
  }

  private pickDisplayFileName(input: {
    fileName?: string | null;
    content?: string | null;
  }): string | null {
    const raw =
      input.fileName ??
      (input.content?.startsWith('[파일]')
        ? input.content.replace(/^\[파일\]\s*/, '')
        : null);
    return raw ? this.recoverMulterOriginalName(raw) : null;
  }

  private parseMessageFileItems(
    value: MessageFileItem[] | string | null,
  ): MessageFileItem[] | null {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as MessageFileItem[]) : null;
    } catch {
      return null;
    }
  }

  /** COFFEE: 정확히 2명(삭제되지 않은 멤버)만 있는 방 중 두 사용자를 모두 포함하는 방 */
  private async findCoffeeRoomBetweenUsers(
    userIdA: string,
    userIdB: string,
    em?: EntityManager,
  ): Promise<ChatRoom | null> {
    const roomRepo = em ? em.getRepository(ChatRoom) : this.chatRoomRepo;
    return roomRepo
      .createQueryBuilder('room')
      .where('room.kind = :kind', { kind: ChatRoomKind.COFFEE })
      .andWhere('room.deletedAt IS NULL')
      .andWhere(
        '(SELECT COUNT(*) FROM chat_room_member rm WHERE rm.chat_room_id = room.id AND rm.deleted_at IS NULL) = 2',
      )
      .andWhere(
        'EXISTS (SELECT 1 FROM chat_room_member m1 WHERE m1.chat_room_id = room.id AND m1.user_id = :a AND m1.deleted_at IS NULL)',
        { a: userIdA },
      )
      .andWhere(
        'EXISTS (SELECT 1 FROM chat_room_member m2 WHERE m2.chat_room_id = room.id AND m2.user_id = :b AND m2.deleted_at IS NULL)',
        { b: userIdB },
      )
      .getOne();
  }

  private async recoverChatRoomAndMembers(roomId: string): Promise<void> {
    const room = await this.chatRoomRepo.findOne({
      where: { id: roomId },
      withDeleted: true,
    });
    if (room?.deletedAt) {
      await this.chatRoomRepo.recover(room);
    }
    const members = await this.chatRoomMemberRepo.find({
      where: { chatRoom: { id: roomId } },
      withDeleted: true,
    });
    for (const m of members) {
      if (m.deletedAt) {
        await this.chatRoomMemberRepo.recover(m);
      }
    }
  }

  private async addMembers(
    em: EntityManager | null,
    roomId: string,
    userIds: string[],
  ): Promise<void> {
    const repo = em
      ? em.getRepository(ChatRoomMember)
      : this.chatRoomMemberRepo;
    const rows = userIds.map((uid) =>
      repo.create({
        chatRoom: { id: roomId } as ChatRoom,
        user: { userId: uid } as User,
      }),
    );
    await repo.save(rows);
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

    const existing = await this.findCoffeeRoomBetweenUsers(userId, peerUserId);
    if (existing) {
      return existing;
    }

    return this.chatRoomRepo.manager.transaction(async (em) => {
      const found = await this.findCoffeeRoomBetweenUsers(
        userId,
        peerUserId,
        em,
      );
      if (found) {
        return found;
      }
      const roomRepo = em.getRepository(ChatRoom);
      const room = await roomRepo.save(
        roomRepo.create({
          kind: ChatRoomKind.COFFEE,
          announcement: null,
          application: null,
        }),
      );
      await this.addMembers(em, room.id, [userId, peerUserId]);
      return roomRepo.findOneOrFail({
        where: { id: room.id },
        relations: { members: { user: true } },
      });
    });
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
        application: { id: submitted.id },
      },
      withDeleted: true,
      relations: { members: true },
    });
    if (room) {
      if (room.deletedAt) {
        await this.recoverChatRoomAndMembers(room.id);
        room = await this.chatRoomRepo.findOneOrFail({
          where: { id: room.id },
          relations: { members: true },
        });
      }
      return room;
    }
    try {
      room = this.chatRoomRepo.create({
        kind: ChatRoomKind.ANNOUNCEMENT,
        announcement: { postId: dto.postId } as Announcement,
        application: { id: submitted.id } as Application,
      });
      room = await this.chatRoomRepo.save(room);
      await this.addMembers(null, room.id, [post.userId, applicantUserId]);
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
          application: { id: submitted.id },
        },
        withDeleted: true,
        relations: { members: true },
      });
      if (!room) {
        throw err;
      }
      if (room.deletedAt) {
        await this.recoverChatRoomAndMembers(room.id);
      }
    }
    return this.chatRoomRepo.findOneOrFail({
      where: { id: room.id },
      relations: { members: true },
    });
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
    const existing = await this.chatRoomRepo.findOne({
      where: {
        kind: ChatRoomKind.ANNOUNCEMENT,
        application: { id: applicationId },
      },
      withDeleted: true,
    });
    if (existing) {
      if (existing.deletedAt) {
        await this.recoverChatRoomAndMembers(existing.id);
      }
      return;
    }

    const post = await this.announcementRepo.findOne({ where: { postId } });
    if (!post) {
      return;
    }

    let room = this.chatRoomRepo.create({
      kind: ChatRoomKind.ANNOUNCEMENT,
      announcement: { postId } as Announcement,
      application: { id: applicationId } as Application,
    });
    let isNewRoom = false;
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
      room = (await this.chatRoomRepo.findOne({
        where: {
          kind: ChatRoomKind.ANNOUNCEMENT,
          application: { id: applicationId },
        },
        withDeleted: true,
      }))!;
      if (!room) {
        throw err;
      }
      if (room.deletedAt) {
        await this.recoverChatRoomAndMembers(room.id);
      }
      return;
    }

    if (isNewRoom) {
      await this.addMembers(null, room.id, [post.userId, applicantUserId]);
    } else {
      return;
    }

    const title = post.title?.trim() ? post.title.trim() : '공고';
    const msg = `[${title}] 공고에 신청하였습니다.`;
    await this.createMessage(room.id, applicantUserId, msg);
  }

  async findRoomForUserOrThrow(
    roomId: string,
    userId: string,
  ): Promise<ChatRoom> {
    const room = await this.chatRoomRepo.findOne({
      where: { id: roomId },
      relations: { announcement: true, application: true },
    });
    if (!room) {
      throw new NotFoundException('채팅방을 찾을 수 없습니다.');
    }
    const member = await this.chatRoomMemberRepo.findOne({
      where: {
        chatRoom: { id: roomId },
        user: { userId },
      },
    });
    if (!member) {
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
    void this.notifyUnreadChanged(chatRoomId, userId, payload);
    return payload;
  }

  async createFileMessage(
    chatRoomId: string,
    userId: string,
    file: { buffer: Buffer; originalName: string; contentType: string },
  ): Promise<MessagePayload> {
    await this.findRoomForUserOrThrow(chatRoomId, userId);
    if (!file.buffer?.length) {
      throw new BadRequestException('업로드할 파일이 필요합니다.');
    }
    const originalFileName = this.recoverMulterOriginalName(
      file.originalName || 'file',
    );

    const uploaded = await this.fileService.uploadAndSave({
      buffer: file.buffer,
      originalName: originalFileName || 'file',
      contentType: file.contentType || 'application/octet-stream',
      targetType: null,
      targetId: null,
      sortOrder: 0,
    });

    const fileName =
      originalFileName || uploaded.originalName || file.originalName || 'file';
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        content: `[파일] ${fileName}`,
        fileUrl: uploaded.imgUrl,
        fileName,
        fileMime: file.contentType || null,
        chatRoom: { id: chatRoomId },
        user: { userId } as User,
      }),
    );

    const payload: MessagePayload = {
      id: message.id,
      chatRoomId,
      userId,
      content: message.content,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileMime: message.fileMime,
      createdAt: message.createdAt,
    };
    this.chatGateway.emitMessageToRoom(chatRoomId, payload);
    void this.notifyUnreadChanged(chatRoomId, userId, payload);
    return payload;
  }

  async createFilesMessage(
    chatRoomId: string,
    userId: string,
    files: Array<{ buffer: Buffer; originalName: string; contentType: string }>,
  ): Promise<MessagePayload> {
    await this.findRoomForUserOrThrow(chatRoomId, userId);
    const validFiles = files.filter((file) => file.buffer?.length);
    if (validFiles.length === 0) {
      throw new BadRequestException('업로드할 파일이 필요합니다.');
    }

    const uploadedItems: MessageFileItem[] = [];
    for (const [index, file] of validFiles.entries()) {
      const originalFileName = this.recoverMulterOriginalName(
        file.originalName || `image_${index + 1}`,
      );
      const uploaded = await this.fileService.uploadAndSave({
        buffer: file.buffer,
        originalName: originalFileName || `image_${index + 1}`,
        contentType: file.contentType || 'application/octet-stream',
        targetType: null,
        targetId: null,
        sortOrder: index,
      });
      uploadedItems.push({
        fileUrl: uploaded.imgUrl,
        fileName:
          originalFileName || uploaded.originalName || `image_${index + 1}`,
        fileMime: file.contentType || null,
      });
    }

    const firstFile = uploadedItems[0];
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        content:
          uploadedItems.length === 1
            ? `[파일] ${firstFile.fileName}`
            : `[사진] ${uploadedItems.length}장`,
        fileUrl: firstFile.fileUrl,
        fileName: firstFile.fileName,
        fileMime: firstFile.fileMime,
        fileItems: uploadedItems,
        chatRoom: { id: chatRoomId },
        user: { userId } as User,
      }),
    );

    const payload: MessagePayload = {
      id: message.id,
      chatRoomId,
      userId,
      content: message.content,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileMime: message.fileMime,
      fileItems: message.fileItems,
      createdAt: message.createdAt,
    };
    this.chatGateway.emitMessageToRoom(chatRoomId, payload);
    void this.notifyUnreadChanged(chatRoomId, userId, payload);
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

    const peerLastReadAt = await this.getPeerLastReadAt(chatRoomId, userId);

    return {
      items: rows.map((m) => this.toMessagePayload(m, peerLastReadAt)),
      total,
      page,
      limit,
    };
  }

  /** 방의 다른 멤버들(1:1 기준 상대방)이 공통으로 읽은 지점 — 여러 명이면 가장 늦게 읽은 사람 기준 */
  private async getPeerLastReadAt(
    roomId: string,
    userId: string,
  ): Promise<Date | null> {
    const rows: Array<{ lastReadAt: Date | string | null }> =
      await this.chatRoomMemberRepo.manager.query(
        `SELECT MIN(last_read_at) AS lastReadAt
         FROM chat_room_member
         WHERE chat_room_id = ? AND user_id != ? AND deleted_at IS NULL`,
        [roomId, userId],
      );
    const value = rows[0]?.lastReadAt;
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
  }

  async getMemberSettings(
    roomId: string,
    userId: string,
  ): Promise<{ notificationsMuted: boolean }> {
    const member = await this.findActiveMemberOrThrow(roomId, userId);
    return { notificationsMuted: member.notificationsMuted };
  }

  async setNotificationsMuted(
    roomId: string,
    userId: string,
    muted: boolean,
  ): Promise<{ notificationsMuted: boolean }> {
    const member = await this.findActiveMemberOrThrow(roomId, userId);
    member.notificationsMuted = muted;
    await this.chatRoomMemberRepo.save(member);
    return { notificationsMuted: member.notificationsMuted };
  }

  async leaveRoom(roomId: string, userId: string): Promise<{ ok: true }> {
    const member = await this.findActiveMemberOrThrow(roomId, userId);
    await this.chatRoomMemberRepo.softRemove(member);
    return { ok: true };
  }

  /**
   * 방을 "여기까지 읽음" 처리. `lastMessageId` 미지정 시 방의 최신 메시지 기준.
   * 커서가 뒤로 가지 않도록 기존 값보다 최신일 때만 갱신.
   */
  async markRoomRead(
    roomId: string,
    userId: string,
    dto: MarkChatRoomReadDto,
  ): Promise<{ lastReadAt: Date | null }> {
    const member = await this.findActiveMemberOrThrow(roomId, userId);

    let messageId: string | null;
    if (dto.lastMessageId) {
      const message = await this.messageRepo.findOne({
        where: { id: dto.lastMessageId, chatRoom: { id: roomId } },
      });
      if (!message) {
        throw new NotFoundException('메시지를 찾을 수 없습니다.');
      }
      messageId = message.id;
    } else {
      const latest = await this.messageRepo.findOne({
        where: { chatRoom: { id: roomId } },
        order: { createdAt: 'DESC' },
      });
      messageId = latest?.id ?? null;
    }

    if (messageId) {
      /**
       * message.created_at은 DATETIME(6)이지만, TypeORM이 JS Date로 옮기면
       * 마이크로초 이하가 잘려나간다. 잘린 값을 다시 저장하면 방금 읽은 마지막
       * 메시지의 원본 created_at보다 last_read_at이 작게 남아 그 메시지 하나가
       * 계속 안읽음으로 카운트되므로, JS Date를 거치지 않고 SQL 안에서 그대로 복사한다.
       */
      await this.chatRoomMemberRepo.manager.query(
        `UPDATE chat_room_member
         SET last_read_at = (SELECT created_at FROM message WHERE id = ?)
         WHERE id = ?
           AND (last_read_at IS NULL OR (SELECT created_at FROM message WHERE id = ?) > last_read_at)`,
        [messageId, member.id, messageId],
      );
    }

    const updated = await this.chatRoomMemberRepo.findOne({
      where: { id: member.id },
    });
    const lastReadAt = updated?.lastReadAt ?? member.lastReadAt;
    if (lastReadAt) {
      /** 방의 다른 멤버(발신자)에게 실시간으로 알려, 보낸 메시지의 안읽음 숫자를 즉시 지워줌 */
      this.chatGateway.emitReadUpdated(roomId, userId, lastReadAt);
    }
    return { lastReadAt };
  }

  /** 하단 탭바 배지 등에 쓰는, 내가 속한 모든 방의 안 읽은 메시지 총합 */
  async getTotalUnreadCount(userId: string): Promise<number> {
    const rows: Array<{ cnt: number | string }> =
      await this.messageRepo.manager.query(
        `SELECT COUNT(*) AS cnt
         FROM message m
         INNER JOIN chat_room_member mb
           ON mb.chat_room_id = m.chat_room_id
           AND mb.user_id = ?
           AND mb.deleted_at IS NULL
         INNER JOIN chat_room r
           ON r.id = m.chat_room_id
           AND r.deleted_at IS NULL
         WHERE m.deleted_at IS NULL
           AND m.user_id != ?
           AND (mb.last_read_at IS NULL OR m.created_at > mb.last_read_at)`,
        [userId, userId],
      );
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 채팅 탭(DM/지원 공고/내 공고)별 안읽음 배지용 합산 */
  async getUnreadCountsByTab(userId: string): Promise<{
    dm: number;
    appliedAnnouncement: number;
    myAnnouncement: number;
  }> {
    const rows: Array<{
      kind: string;
      isApplicant: number | string;
      cnt: number | string;
    }> = await this.messageRepo.manager.query(
      `SELECT r.kind AS kind,
              CASE WHEN app.user_id = ? THEN 1 ELSE 0 END AS isApplicant,
              COUNT(*) AS cnt
       FROM message m
       INNER JOIN chat_room_member mb
         ON mb.chat_room_id = m.chat_room_id
         AND mb.user_id = ?
         AND mb.deleted_at IS NULL
       INNER JOIN chat_room r
         ON r.id = m.chat_room_id
         AND r.deleted_at IS NULL
       LEFT JOIN application app
         ON app.id = r.form_id
       WHERE m.deleted_at IS NULL
         AND m.user_id != ?
         AND (mb.last_read_at IS NULL OR m.created_at > mb.last_read_at)
       GROUP BY r.kind, isApplicant`,
      [userId, userId, userId],
    );

    let dm = 0;
    let appliedAnnouncement = 0;
    let myAnnouncement = 0;
    for (const row of rows) {
      const cnt = Number(row.cnt);
      if (row.kind === ChatRoomKind.COFFEE) {
        dm += cnt;
      } else if (Number(row.isApplicant) === 1) {
        appliedAnnouncement += cnt;
      } else {
        myAnnouncement += cnt;
      }
    }
    return { dm, appliedAnnouncement, myAnnouncement };
  }

  /** 새 메시지 저장 후 발신자를 제외한 방 멤버들에게 안읽음 변경 알림 전파 + FCM 푸시 */
  private async notifyUnreadChanged(
    chatRoomId: string,
    senderUserId: string,
    message: MessagePayload,
  ): Promise<void> {
    const members = await this.chatRoomMemberRepo.find({
      where: { chatRoom: { id: chatRoomId } },
      relations: { user: true },
    });
    const others = members.filter((m) => m.user.userId !== senderUserId);
    if (others.length === 0) return;

    const memberUserIds = others.map((m) => m.user.userId);
    this.chatGateway.emitUnreadChanged(chatRoomId, memberUserIds, message);

    const pushRecipientIds = others
      .filter((m) => !m.notificationsMuted)
      .map((m) => m.user.userId);
    if (pushRecipientIds.length > 0) {
      void this.sendChatPush(
        chatRoomId,
        senderUserId,
        pushRecipientIds,
        message,
      );
    }
  }

  private async sendChatPush(
    chatRoomId: string,
    senderUserId: string,
    recipientUserIds: string[],
    message: MessagePayload,
  ): Promise<void> {
    const sender = await this.userRepo.findOne({
      where: { userId: senderUserId },
      select: ['name', 'activityName'],
    });
    const title = sender?.activityName ?? sender?.name ?? '회원';
    const body = (message.content ?? '새 메시지가 도착했습니다.').slice(0, 500);
    await this.noticeService.sendChatPush({
      senderUserId,
      recipientUserIds,
      title,
      body,
      chatRoomId,
      messageId: message.id,
    });
  }

  private async findActiveMemberOrThrow(
    roomId: string,
    userId: string,
  ): Promise<ChatRoomMember> {
    await this.findRoomForUserOrThrow(roomId, userId);
    const member = await this.chatRoomMemberRepo.findOne({
      where: {
        chatRoom: { id: roomId },
        user: { userId },
      },
    });
    if (!member) {
      throw new ForbiddenException('이 채팅방에 참여할 수 없습니다.');
    }
    return member;
  }

  async listCoffeeRooms(
    userId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const limit = query.limit ?? 20;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .innerJoin('room.members', 'mb')
      .innerJoin('mb.user', 'u')
      .where('room.kind = :kind', { kind: ChatRoomKind.COFFEE })
      .andWhere('room.deletedAt IS NULL')
      .andWhere('mb.deletedAt IS NULL')
      .andWhere('u.userId = :uid', { uid: userId })
      .orderBy('room.id', 'DESC')
      .take(limit + 1);
    if (query.cursor) {
      qb.andWhere('room.id < :cursor', { cursor: query.cursor });
    }
    const rows = await qb.getMany();
    return this.toRoomListPage(rows, limit, userId);
  }

  /** 내가 속한 모든 채팅방 — 커피챗·공고(지원자/작성자) 구분 없이 한 목록으로 */
  async listAllRooms(
    userId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const limit = query.limit ?? 20;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.announcement', 'announcement')
      .innerJoin('room.members', 'mb')
      .where('room.deletedAt IS NULL')
      .andWhere('mb.deletedAt IS NULL')
      .andWhere('mb.user_id = :uid', { uid: userId })
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
      .innerJoin('room.members', 'mb')
      .innerJoin('room.application', 'app')
      .where('room.kind = :kind', { kind: ChatRoomKind.ANNOUNCEMENT })
      .andWhere('room.deletedAt IS NULL')
      .andWhere('mb.deletedAt IS NULL')
      .andWhere('mb.user_id = :uid', { uid: userId })
      .andWhere('app.userId = :uid', { uid: userId })
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
      .innerJoin('room.members', 'mb')
      .where('room.kind = :kind', { kind: ChatRoomKind.ANNOUNCEMENT })
      .andWhere('room.deletedAt IS NULL')
      .andWhere('mb.deletedAt IS NULL')
      .andWhere('mb.user_id = :uid', { uid: recruiterUserId })
      .andWhere('announcement.postId = :postId', { postId })
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

  private async loadMembersByRoomIds(
    roomIds: string[],
  ): Promise<Map<string, ChatRoomMember[]>> {
    if (roomIds.length === 0) {
      return new Map();
    }
    const rows = await this.chatRoomMemberRepo.find({
      where: { chatRoom: { id: In(roomIds) } },
      relations: { user: true, chatRoom: true },
    });
    const map = new Map<string, ChatRoomMember[]>();
    for (const m of rows) {
      const rid = m.chatRoom.id;
      const list = map.get(rid) ?? [];
      list.push(m);
      map.set(rid, list);
    }
    return map;
  }

  /** 방 목록에 표시할, 방별 안 읽은 메시지 수 (로그인 사용자 기준) */
  private async loadUnreadCountsByRoomIds(
    roomIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (roomIds.length === 0) return result;
    const placeholders = roomIds.map(() => '?').join(',');
    const rows: Array<{ roomId: string; cnt: number | string }> =
      await this.messageRepo.query(
        `SELECT m.chat_room_id AS roomId, COUNT(*) AS cnt
         FROM message m
         INNER JOIN chat_room_member mb
           ON mb.chat_room_id = m.chat_room_id
           AND mb.user_id = ?
           AND mb.deleted_at IS NULL
         WHERE m.chat_room_id IN (${placeholders})
           AND m.deleted_at IS NULL
           AND m.user_id != ?
           AND (mb.last_read_at IS NULL OR m.created_at > mb.last_read_at)
         GROUP BY m.chat_room_id`,
        [userId, ...roomIds, userId],
      );
    for (const row of rows) {
      result.set(row.roomId, Number(row.cnt));
    }
    return result;
  }

  private async mapRoomsToListItems(
    rooms: ChatRoom[],
    currentUserId: string,
  ): Promise<ChatRoomListItemDto[]> {
    if (rooms.length === 0) return [];
    const roomIds = rooms.map((r) => r.id);
    const lastByRoom = await this.loadLastMessageByRoomIds(roomIds);
    const membersByRoom = await this.loadMembersByRoomIds(roomIds);
    const unreadByRoom = await this.loadUnreadCountsByRoomIds(
      roomIds,
      currentUserId,
    );

    const peerIds = new Set<string>();
    for (const room of rooms) {
      const members = membersByRoom.get(room.id) ?? [];
      const pid = this.resolvePeerUserId(members, currentUserId);
      if (pid) peerIds.add(pid);
    }
    const peers = await this.userRepo.find({
      where: { userId: In([...peerIds]) },
    });
    const peerMap = new Map(peers.map((u) => [u.userId, u]));

    return rooms.map((room) => {
      const members = membersByRoom.get(room.id) ?? [];
      const peerId = this.resolvePeerUserId(members, currentUserId);
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
              name: peerUser.name,
              activityName: peerUser.activityName,
              profileImgUrl: peerUser.profileImgUrl,
            }
          : {
              userId: peerId ?? '',
              name: '알 수 없음',
              activityName: '',
              profileImgUrl: '',
            },
        lastMessage: lastByRoom.get(room.id) ?? null,
        unreadCount: unreadByRoom.get(room.id) ?? 0,
        createdAt: room.createdAt,
      };
    });
  }

  /** 1:1 UI: 나를 제외한 첫 멤버 (그룹 확장 시 목록/이름 정책 변경) */
  private resolvePeerUserId(
    members: ChatRoomMember[],
    currentUserId: string,
  ): string | null {
    const others = members.filter((m) => m.user.userId !== currentUserId);
    return others[0]?.user.userId ?? null;
  }

  private async loadLastMessageByRoomIds(roomIds: string[]): Promise<
    Map<
      string,
      {
        content: string | null;
        fileUrl: string | null;
        fileName: string | null;
        fileMime: string | null;
        fileItems: MessageFileItem[] | null;
        createdAt: Date;
      }
    >
  > {
    const result = new Map<
      string,
      {
        content: string | null;
        fileUrl: string | null;
        fileName: string | null;
        fileMime: string | null;
        fileItems: MessageFileItem[] | null;
        createdAt: Date;
      }
    >();
    if (roomIds.length === 0) return result;
    const placeholders = roomIds.map(() => '?').join(',');
    const rows: Array<{
      roomId: string;
      content: string | null;
      fileUrl: string | null;
      fileName: string | null;
      fileMime: string | null;
      fileItems: MessageFileItem[] | string | null;
      createdAt: Date | string;
    }> = await this.messageRepo.query(
      `SELECT
         m.chat_room_id AS roomId,
         m.content AS content,
         m.file_url AS fileUrl,
         m.file_name AS fileName,
         m.file_mime AS fileMime,
         m.file_items AS fileItems,
         m.created_at AS createdAt
       FROM message m
       INNER JOIN (
         SELECT chat_room_id, MAX(created_at) AS max_c
         FROM message
         WHERE chat_room_id IN (${placeholders})
           AND deleted_at IS NULL
         GROUP BY chat_room_id
       ) t ON m.chat_room_id = t.chat_room_id AND m.created_at = t.max_c
       WHERE m.deleted_at IS NULL`,
      roomIds,
    );
    for (const row of rows) {
      const fileName = this.pickDisplayFileName({
        fileName: row.fileName,
        content: row.content,
      });
      result.set(row.roomId, {
        content:
          row.content?.startsWith('[파일]') && fileName
            ? `[파일] ${fileName}`
            : row.content,
        fileUrl: row.fileUrl,
        fileName,
        fileMime: row.fileMime,
        fileItems: this.parseMessageFileItems(row.fileItems),
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
      });
    }
    return result;
  }

  private toMessagePayload(
    message: Message,
    peerLastReadAt?: Date | null,
  ): MessagePayload {
    const fileName = this.pickDisplayFileName({
      fileName: message.fileName,
      content: message.content,
    });
    return {
      id: message.id,
      chatRoomId: message.chatRoom.id,
      userId: message.user.userId,
      content:
        message.content?.startsWith('[파일]') && fileName
          ? `[파일] ${fileName}`
          : message.content,
      fileUrl: message.fileUrl,
      fileName,
      fileMime: message.fileMime,
      fileItems: message.fileItems,
      createdAt: message.createdAt,
      readByPeer: Boolean(
        peerLastReadAt && message.createdAt <= peerLastReadAt,
      ),
    };
  }
}
