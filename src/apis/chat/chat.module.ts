import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../file/file.module';
import { NoticeModule } from '../notice/notice.module';
import { Announcement } from '../announcement/entities/announcement.entity';
import { User } from '../user/entities/user.entity';
import { ChatRoomMember } from './entities/chat-room-member.entity';
import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatRoom,
      ChatRoomMember,
      Message,
      User,
      Announcement,
    ]),
    AuthModule,
    FileModule,
    NoticeModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
