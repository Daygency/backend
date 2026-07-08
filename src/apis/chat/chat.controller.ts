import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Express } from 'express';
import { ChatService } from './chat.service';
import { CreateAnnouncementChatRoomDto } from './dto/create-announcement-chat-room.dto';
import { CreateCoffeeRoomDto } from './dto/create-coffee-room.dto';
import { ListChatRoomsQueryDto } from './dto/list-chat-rooms-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { MarkChatRoomReadDto } from './dto/mark-chat-room-read.dto';
import { SetChatNotificationsMutedDto } from './dto/set-chat-notifications-muted.dto';

@ApiTags('chat')
@Controller('chat')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('unread-count')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 속한 모든 채팅방의 안 읽은 메시지 총합 (탭바 배지용)' })
  async getUnreadCount(@Request() req: { user: { id: string } }) {
    const unreadCount = await this.chatService.getTotalUnreadCount(
      req.user.id,
    );
    return { unreadCount };
  }

  @Get('rooms/all')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 속한 모든 채팅방 목록 (전체 탭)' })
  listAllRooms(
    @Request() req: { user: { id: string } },
    @Query() query: ListChatRoomsQueryDto,
  ) {
    return this.chatService.listAllRooms(req.user.id, query);
  }

  @Get('rooms/coffee')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '커피챗(DM 1:1) 채팅방 목록' })
  listCoffeeRooms(
    @Request() req: { user: { id: string } },
    @Query() query: ListChatRoomsQueryDto,
  ) {
    return this.chatService.listCoffeeRooms(req.user.id, query);
  }

  @Get('rooms/applied')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 지원한 공고 기준 1:1 채팅방 목록' })
  listAppliedRooms(
    @Request() req: { user: { id: string } },
    @Query() query: ListChatRoomsQueryDto,
  ) {
    return this.chatService.listAppliedAnnouncementRooms(req.user.id, query);
  }

  @Get('rooms/by-post/:postId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '특정 공고(내가 작성한)에 대한 지원자별 1:1 채팅방 목록 — 공고 작성자만',
  })
  listRoomsByMyPost(
    @Request() req: { user: { id: string } },
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query() query: ListChatRoomsQueryDto,
  ) {
    return this.chatService.listRoomsForMyAnnouncement(
      postId,
      req.user.id,
      query,
    );
  }

  @Post('rooms/coffee')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '커피챗 1:1 방 생성 또는 기존 방 반환' })
  createCoffeeRoom(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateCoffeeRoomDto,
  ) {
    return this.chatService.getOrCreateCoffeeRoom(req.user.id, dto.peerUserId);
  }

  @Post('rooms/announcement')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '공고 1:1 방 생성/조회 — 지원자는 postId만, 작성자는 applicantUserId 지정 가능',
  })
  createAnnouncementRoom(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateAnnouncementChatRoomDto,
  ) {
    return this.chatService.createAnnouncementChatRoom(req.user.id, dto);
  }

  @Get('rooms/:roomId/messages')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 메시지 목록 (페이지네이션, 최신순)' })
  listMessages(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chatService.listMessages(roomId, req.user.id, query);
  }

  @Post('rooms/:roomId/messages/file')
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '채팅방 파일 메시지 전송' })
  sendFileMessage(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.chatService.createFileMessage(roomId, req.user.id, {
      buffer: file?.buffer ?? Buffer.alloc(0),
      originalName: file?.originalname ?? 'file',
      contentType: file?.mimetype ?? 'application/octet-stream',
    });
  }

  @Post('rooms/:roomId/messages/files')
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '채팅방 다중 파일 메시지 전송' })
  sendFilesMessage(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.chatService.createFilesMessage(
      roomId,
      req.user.id,
      (files ?? []).map((file) => ({
        buffer: file.buffer,
        originalName: file.originalname ?? 'file',
        contentType: file.mimetype ?? 'application/octet-stream',
      })),
    );
  }

  @Patch('rooms/:roomId/read')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 읽음 처리 (lastMessageId 생략 시 최신 메시지 기준)' })
  markRoomRead(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: MarkChatRoomReadDto,
  ) {
    return this.chatService.markRoomRead(roomId, req.user.id, dto);
  }

  @Get('rooms/:roomId/member-settings')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 멤버 설정 (알림 해제 여부)' })
  getMemberSettings(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.chatService.getMemberSettings(roomId, req.user.id);
  }

  @Patch('rooms/:roomId/notifications-muted')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 알림 해제/켜기' })
  setNotificationsMuted(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: SetChatNotificationsMutedDto,
  ) {
    return this.chatService.setNotificationsMuted(
      roomId,
      req.user.id,
      dto.muted,
    );
  }

  @Post('rooms/:roomId/leave')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '채팅방 나가기' })
  leaveRoom(
    @Request() req: { user: { id: string } },
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.chatService.leaveRoom(roomId, req.user.id);
  }
}
