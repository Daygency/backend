import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { forwardRef, Inject, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService, MessagePayload } from './chat.service';
import { JoinRoomSocketDto } from './dto/join-room-socket.dto';
import { SendMessageSocketDto } from './dto/send-message-socket.dto';

interface ChatSocketData {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errors) =>
      new WsException(
        errors
          .map((e) => Object.values(e.constraints ?? {}).join(', '))
          .join('; '),
      ),
  }),
)
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** HTTP 등에서 저장한 메시지를 해당 방 구독자에게 브로드캐스트 */
  emitMessageToRoom(chatRoomId: string, payload: MessagePayload): void {
    this.server.to(chatRoomId).emit('message', payload);
  }

  /** 새 메시지로 안읽음 수가 바뀐 사용자들에게 (탭바 배지/목록 실시간 갱신용) 알림 */
  emitUnreadChanged(
    chatRoomId: string,
    memberUserIds: string[],
    message: MessagePayload,
  ): void {
    for (const userId of memberUserIds) {
      this.server.to(this.userRoom(userId)).emit('chatUnreadChanged', {
        chatRoomId,
        message,
      });
    }
  }

  /** 누군가 방을 읽음 처리했을 때, 같은 방 구독자들에게 알려 보낸 메시지의 읽음 표시를 실시간 갱신 */
  emitReadUpdated(chatRoomId: string, userId: string, lastReadAt: Date): void {
    this.server.to(chatRoomId).emit('readUpdated', {
      chatRoomId,
      userId,
      lastReadAt,
    });
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET') ?? '',
        },
      );
      this.getSocketData(client).userId = payload.sub;
      await client.join(this.userRoom(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinRoomSocketDto,
  ) {
    this.getAuthenticatedUserId(client);
    await this.chatService.findRoomForUserOrThrow(
      body.chatRoomId,
      this.getAuthenticatedUserId(client),
    );
    await client.join(body.chatRoomId);
    return { event: 'joined', data: { chatRoomId: body.chatRoomId } };
  }

  @SubscribeMessage('leaveRoom')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinRoomSocketDto,
  ) {
    await this.chatService.findRoomForUserOrThrow(
      body.chatRoomId,
      this.getAuthenticatedUserId(client),
    );
    await client.leave(body.chatRoomId);
    return { event: 'left', data: { chatRoomId: body.chatRoomId } };
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SendMessageSocketDto,
  ) {
    const userId = this.getAuthenticatedUserId(client);
    const payload = await this.chatService.createMessage(
      body.chatRoomId,
      userId,
      body.content,
    );
    return { ok: true, messageId: payload.id };
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) {
      return auth.token;
    }
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return undefined;
  }

  private getAuthenticatedUserId(client: Socket): string {
    const userId = this.getSocketData(client).userId;
    if (!userId) {
      throw new WsException('인증이 필요합니다.');
    }
    return userId;
  }

  private getSocketData(client: Socket): ChatSocketData {
    return client.data as ChatSocketData;
  }
}
