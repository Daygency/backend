import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateAnnouncementChatRoomDto } from './dto/create-announcement-chat-room.dto';
import { CreateCoffeeRoomDto } from './dto/create-coffee-room.dto';
import { ListChatRoomsQueryDto } from './dto/list-chat-rooms-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';

@ApiTags('chat')
@Controller('chat')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms/coffee')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '커피챗(일반 1:1) 채팅방 목록' })
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
}
