import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ChatGateway } from './chat.gateway';
import { Announcement } from '../announcement/entities/announcement.entity';
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
  /** GROUP 방에서만 채워짐 — 이 메시지를 아직 안 읽은 멤버(발신자 제외) userId 목록 */
  unreadMemberIds?: string[];
};

export type ChatRoomMemberSummary = {
  userId: string;
  name: string | null;
  activityName: string;
  profileImgUrl: string;
};

export type ChatRoomListItemDto = {
  id: string;
  kind: ChatRoomKind;
  post: { postId: string; title: string } | null;
  /** COFFEE(1:1)에서만 채워짐 */
  peer: ChatRoomMemberSummary | null;
  /** GROUP(다대다)에서만 채워짐 — 나를 제외한 멤버 전원 */
  members: ChatRoomMemberSummary[] | null;
  lastMessage: {
    content: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileMime?: string | null;
    fileItems?: MessageFileItem[] | null;
    createdAt: Date;
  } | null;
  /** 이 방에서 내가 아직 안 읽은 메시지 수 (멤버별 읽음 커서 기반 — 그룹도 동일하게 동작) */
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
        }),
      );
      await this.addMembers(em, room.id, [userId, peerUserId]);
      return roomRepo.findOneOrFail({
        where: { id: room.id },
        relations: { members: { user: true } },
      });
    });
  }

  /** 방 멤버가 아니면 추가, soft-delete된 멤버면 복구 */
  private async ensureActiveMember(
    roomId: string,
    userId: string,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em
      ? em.getRepository(ChatRoomMember)
      : this.chatRoomMemberRepo;
    const existing = await repo.findOne({
      where: { chatRoom: { id: roomId }, user: { userId } },
      withDeleted: true,
    });
    if (!existing) {
      await this.addMembers(em ?? null, roomId, [userId]);
      return;
    }
    if (existing.deletedAt) {
      await repo.recover(existing);
    }
  }

  /**
   * 공고의 그룹채팅방(작성자 + 수락된 지원자 전원)을 가져오거나, 없으면 만듭니다.
   * 공고당 방은 최대 1개 — DB 유니크 제약 대신 트랜잭션 내 재조회로 동시 생성을 막습니다.
   */
  async getOrCreateGroupRoomForAnnouncement(postId: string): Promise<ChatRoom> {
    const post = await this.announcementRepo.findOne({ where: { postId } });
    if (!post) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }

    const existing = await this.chatRoomRepo.findOne({
      where: { kind: ChatRoomKind.GROUP, announcement: { postId } },
      withDeleted: true,
    });
    if (existing) {
      if (existing.deletedAt) {
        await this.recoverChatRoomAndMembers(existing.id);
      }
      await this.ensureActiveMember(existing.id, post.userId);
      return this.chatRoomRepo.findOneOrFail({
        where: { id: existing.id },
        relations: { members: { user: true } },
      });
    }

    return this.chatRoomRepo.manager.transaction(async (em) => {
      const roomRepo = em.getRepository(ChatRoom);
      const found = await roomRepo.findOne({
        where: { kind: ChatRoomKind.GROUP, announcement: { postId } },
        withDeleted: true,
      });
      if (found) {
        if (found.deletedAt) {
          await this.recoverChatRoomAndMembers(found.id);
        }
        await this.ensureActiveMember(found.id, post.userId, em);
        return roomRepo.findOneOrFail({
          where: { id: found.id },
          relations: { members: { user: true } },
        });
      }
      const created = await roomRepo.save(
        roomRepo.create({
          kind: ChatRoomKind.GROUP,
          announcement: { postId } as Announcement,
        }),
      );
      await this.addMembers(em, created.id, [post.userId]);
      return roomRepo.findOneOrFail({
        where: { id: created.id },
        relations: { members: { user: true } },
      });
    });
  }

  /** 공고 작성자가 특정 그룹채팅방을 열거나(없으면 생성), 특정 지원자를 멤버로 보강할 때 */
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
    if (post.userId !== currentUserId) {
      throw new ForbiddenException('공고 작성자만 그룹채팅방을 열 수 있습니다.');
    }

    const room = await this.getOrCreateGroupRoomForAnnouncement(dto.postId);

    if (dto.applicantUserId !== undefined && dto.applicantUserId !== post.userId) {
      const applicant = await this.userRepo.findOne({
        where: { userId: dto.applicantUserId },
      });
      if (!applicant) {
        throw new NotFoundException('지원자 사용자를 찾을 수 없습니다.');
      }
      await this.ensureActiveMember(room.id, dto.applicantUserId);
    }

    return this.chatRoomRepo.findOneOrFail({
      where: { id: room.id },
      relations: { members: true },
    });
  }

  /** 지원 수락 시: 공고 그룹채팅방을 만들고(없으면) 수락된 지원자를 멤버로 추가합니다. */
  async addAcceptedApplicantToGroupRoom(
    postId: string,
    applicantUserId: string,
  ): Promise<void> {
    const room = await this.getOrCreateGroupRoomForAnnouncement(postId);
    await this.ensureActiveMember(room.id, applicantUserId);
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
    const room = await this.findRoomForUserOrThrow(chatRoomId, userId);
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
      ...(await this.buildUnreadMemberIdsForNewMessage(
        room,
        chatRoomId,
        userId,
        message.createdAt,
      )),
    };
    this.chatGateway.emitMessageToRoom(chatRoomId, payload);
    void this.notifyUnreadChanged(chatRoomId, userId, payload);
    return payload;
  }

  /** GROUP 방에 새 메시지를 만들 때, 발신자를 제외한 전 멤버를 안읽음으로 초기화 */
  private async buildUnreadMemberIdsForNewMessage(
    room: ChatRoom,
    roomId: string,
    senderUserId: string,
    createdAt: Date,
  ): Promise<{ unreadMemberIds?: string[] }> {
    if (room.kind !== ChatRoomKind.GROUP) return {};
    const cursors = await this.getRoomMemberReadCursors(roomId);
    return {
      unreadMemberIds: this.computeUnreadMemberIds(
        cursors,
        senderUserId,
        createdAt,
      ),
    };
  }

  async createFileMessage(
    chatRoomId: string,
    userId: string,
    file: { buffer: Buffer; originalName: string; contentType: string },
  ): Promise<MessagePayload> {
    const room = await this.findRoomForUserOrThrow(chatRoomId, userId);
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
      ...(await this.buildUnreadMemberIdsForNewMessage(
        room,
        chatRoomId,
        userId,
        message.createdAt,
      )),
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
    const room = await this.findRoomForUserOrThrow(chatRoomId, userId);
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
      ...(await this.buildUnreadMemberIdsForNewMessage(
        room,
        chatRoomId,
        userId,
        message.createdAt,
      )),
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
    peerUserId: string | null;
    /** GROUP 방에서만 채워짐 — 발신자 이름/아바타 표시용 (나 제외) */
    members: ChatRoomMemberSummary[] | null;
  }> {
    const room = await this.findRoomForUserOrThrow(chatRoomId, userId);
    const isGroup = room.kind === ChatRoomKind.GROUP;
    const page = query.page ?? 1;
    const limit = query.limit ?? 8;
    const skip = (page - 1) * limit;

    const [rows, total] = await this.messageRepo.findAndCount({
      where: { chatRoom: { id: chatRoomId } },
      relations: { user: true, chatRoom: true },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    const peerLastReadAt = isGroup
      ? null
      : await this.getPeerLastReadAt(chatRoomId, userId);
    const peerUserId = isGroup
      ? null
      : await this.getPeerUserId(chatRoomId, userId);
    const members = isGroup
      ? await this.loadOtherMemberSummaries(chatRoomId, userId)
      : null;
    const groupMemberCursors = isGroup
      ? await this.getRoomMemberReadCursors(chatRoomId)
      : null;

    return {
      items: rows.map((m) =>
        this.toMessagePayload(
          m,
          peerLastReadAt,
          !isGroup,
          groupMemberCursors
            ? this.computeUnreadMemberIds(
                groupMemberCursors,
                m.user.userId,
                m.createdAt,
              )
            : undefined,
        ),
      ),
      total,
      page,
      limit,
      peerUserId,
      members,
    };
  }

  /** 방의 멤버 중 나를 제외한 전원의 프로필 요약 (그룹채팅 발신자 표시용) */
  private async loadOtherMemberSummaries(
    roomId: string,
    currentUserId: string,
  ): Promise<ChatRoomMemberSummary[]> {
    const members = await this.chatRoomMemberRepo.find({
      where: { chatRoom: { id: roomId } },
      relations: { user: true },
    });
    return members
      .filter((m) => m.user.userId !== currentUserId)
      .map((m) => ({
        userId: m.user.userId,
        name: m.user.name,
        activityName: m.user.activityName,
        profileImgUrl: m.user.profileImgUrl,
      }));
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

  /**
   * 1:1 UI: 메시지 유무와 무관하게 방 멤버십으로 상대를 확정한다.
   * (프론트에서 메시지 발신자로 상대를 추측하면, 상대가 아직 한 번도
   * 답장하지 않은 방에서 내가 나로 잘못 추론되는 문제가 있었다.)
   */
  private async getPeerUserId(
    roomId: string,
    userId: string,
  ): Promise<string | null> {
    const rows: Array<{ userId: string }> =
      await this.chatRoomMemberRepo.manager.query(
        `SELECT user_id AS userId
         FROM chat_room_member
         WHERE chat_room_id = ? AND user_id != ? AND deleted_at IS NULL
         LIMIT 1`,
        [roomId, userId],
      );
    return rows[0]?.userId ?? null;
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
      isOwner: number | string;
      cnt: number | string;
    }> = await this.messageRepo.manager.query(
      `SELECT r.kind AS kind,
              CASE WHEN ann.user_id = ? THEN 1 ELSE 0 END AS isOwner,
              COUNT(*) AS cnt
       FROM message m
       INNER JOIN chat_room_member mb
         ON mb.chat_room_id = m.chat_room_id
         AND mb.user_id = ?
         AND mb.deleted_at IS NULL
       INNER JOIN chat_room r
         ON r.id = m.chat_room_id
         AND r.deleted_at IS NULL
       LEFT JOIN announcement ann
         ON ann.post_id = r.post_id
       WHERE m.deleted_at IS NULL
         AND m.user_id != ?
         AND (mb.last_read_at IS NULL OR m.created_at > mb.last_read_at)
       GROUP BY r.kind, isOwner`,
      [userId, userId, userId],
    );

    let dm = 0;
    let appliedAnnouncement = 0;
    let myAnnouncement = 0;
    for (const row of rows) {
      const cnt = Number(row.cnt);
      if (row.kind === ChatRoomKind.COFFEE) {
        dm += cnt;
      } else if (Number(row.isOwner) === 1) {
        myAnnouncement += cnt;
      } else {
        appliedAnnouncement += cnt;
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
    const limit = query.limit ?? 8;
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
    const limit = query.limit ?? 8;
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

  /** 내가 지원자(작성자 아님)로 속한 공고 그룹채팅방 — "지원 공고" 탭 */
  async listAppliedAnnouncementRooms(
    userId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const limit = query.limit ?? 8;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.announcement', 'announcement')
      .innerJoin('room.members', 'mb')
      .where('room.kind = :kind', { kind: ChatRoomKind.GROUP })
      .andWhere('room.deletedAt IS NULL')
      .andWhere('mb.deletedAt IS NULL')
      .andWhere('mb.user_id = :uid', { uid: userId })
      .andWhere('announcement.userId != :uid', { uid: userId })
      .orderBy('room.id', 'DESC')
      .take(limit + 1);
    if (query.cursor) {
      qb.andWhere('room.id < :cursor', { cursor: query.cursor });
    }
    const rows = await qb.getMany();
    return this.toRoomListPage(rows, limit, userId);
  }

  /** 내가 작성한 공고들의 그룹채팅방 목록 — "내 공고" 탭 */
  async listMyAnnouncementGroupRooms(
    userId: string,
    query: ListChatRoomsQueryDto,
  ): Promise<ChatRoomListResponse> {
    const limit = query.limit ?? 8;
    const qb = this.chatRoomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.announcement', 'announcement')
      .innerJoin('room.members', 'mb')
      .where('room.kind = :kind', { kind: ChatRoomKind.GROUP })
      .andWhere('room.deletedAt IS NULL')
      .andWhere('mb.deletedAt IS NULL')
      .andWhere('mb.user_id = :uid', { uid: userId })
      .andWhere('announcement.userId = :uid', { uid: userId })
      .orderBy('room.id', 'DESC')
      .take(limit + 1);
    if (query.cursor) {
      qb.andWhere('room.id < :cursor', { cursor: query.cursor });
    }
    const rows = await qb.getMany();
    return this.toRoomListPage(rows, limit, userId);
  }

  /** 내가 작성한 공고 하나의 그룹채팅방(0 또는 1건) — 지원자 관리 화면 전용 */
  async listRoomsForMyAnnouncement(
    postId: string,
    recruiterUserId: string,
  ): Promise<ChatRoomListResponse> {
    const post = await this.announcementRepo.findOne({ where: { postId } });
    if (!post) {
      throw new NotFoundException('공고를 찾을 수 없습니다.');
    }
    if (post.userId !== recruiterUserId) {
      throw new ForbiddenException('본인이 작성한 공고만 조회할 수 있습니다.');
    }
    const room = await this.chatRoomRepo.findOne({
      where: { kind: ChatRoomKind.GROUP, announcement: { postId } },
      relations: { announcement: true },
    });
    if (!room) {
      return { items: [], nextCursor: null, hasMore: false };
    }
    const items = await this.mapRoomsToListItems([room], recruiterUserId);
    return { items, nextCursor: null, hasMore: false };
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

    const otherUserIds = new Set<string>();
    for (const room of rooms) {
      const members = membersByRoom.get(room.id) ?? [];
      for (const uid of this.resolveOtherMemberIds(members, currentUserId)) {
        otherUserIds.add(uid);
      }
    }
    const otherUsers = await this.userRepo.find({
      where: { userId: In([...otherUserIds]) },
    });
    const userMap = new Map(otherUsers.map((u) => [u.userId, u]));
    const toSummary = (userId: string): ChatRoomMemberSummary => {
      const u = userMap.get(userId);
      return u
        ? {
            userId: u.userId,
            name: u.name,
            activityName: u.activityName,
            profileImgUrl: u.profileImgUrl,
          }
        : { userId, name: '알 수 없음', activityName: '', profileImgUrl: '' };
    };

    return rooms.map((room) => {
      const members = membersByRoom.get(room.id) ?? [];
      const otherIds = this.resolveOtherMemberIds(members, currentUserId);
      const isGroup = room.kind === ChatRoomKind.GROUP;
      const post =
        isGroup && room.announcement
          ? {
              postId: room.announcement.postId,
              title: room.announcement.title,
            }
          : null;

      return {
        id: room.id,
        kind: room.kind,
        post,
        peer: isGroup ? null : otherIds[0] ? toSummary(otherIds[0]) : null,
        members: isGroup ? otherIds.map(toSummary) : null,
        lastMessage: lastByRoom.get(room.id) ?? null,
        unreadCount: unreadByRoom.get(room.id) ?? 0,
        createdAt: room.createdAt,
      };
    });
  }

  /** 나를 제외한 방 멤버 전원의 userId (1:1이면 최대 1개, GROUP이면 여러 개) */
  private resolveOtherMemberIds(
    members: ChatRoomMember[],
    currentUserId: string,
  ): string[] {
    return members
      .filter((m) => m.user.userId !== currentUserId)
      .map((m) => m.user.userId);
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
    includeReadByPeer = true,
    unreadMemberIds?: string[],
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
      readByPeer: includeReadByPeer
        ? Boolean(peerLastReadAt && message.createdAt <= peerLastReadAt)
        : undefined,
      ...(unreadMemberIds ? { unreadMemberIds } : {}),
    };
  }

  /** 방 멤버 전원(나 포함)의 읽음 커서 — GROUP 메시지별 안읽음 인원 계산용 */
  private async getRoomMemberReadCursors(
    roomId: string,
  ): Promise<Array<{ userId: string; lastReadAt: Date | null }>> {
    const rows: Array<{ userId: string; lastReadAt: Date | string | null }> =
      await this.chatRoomMemberRepo.manager.query(
        `SELECT user_id AS userId, last_read_at AS lastReadAt
         FROM chat_room_member
         WHERE chat_room_id = ? AND deleted_at IS NULL`,
        [roomId],
      );
    return rows.map((r) => ({
      userId: r.userId,
      lastReadAt: r.lastReadAt
        ? r.lastReadAt instanceof Date
          ? r.lastReadAt
          : new Date(r.lastReadAt)
        : null,
    }));
  }

  /** 발신자를 제외한 멤버 중, 메시지 시각 이후로 아직 읽지 않은 멤버의 userId */
  private computeUnreadMemberIds(
    memberCursors: Array<{ userId: string; lastReadAt: Date | null }>,
    senderUserId: string,
    messageCreatedAt: Date,
  ): string[] {
    return memberCursors
      .filter(
        (m) =>
          m.userId !== senderUserId &&
          (!m.lastReadAt || m.lastReadAt < messageCreatedAt),
      )
      .map((m) => m.userId);
  }
}
