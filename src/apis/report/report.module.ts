import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from '../announcement/entities/announcement.entity';
import { AuthModule } from '../auth/auth.module';
import { Block } from '../block/entities/block.entity';
import { ChatRoomMember } from '../chat/entities/chat-room-member.entity';
import { ChatRoom } from '../chat/entities/chat-room.entity';
import { Comment } from '../comment/entities/comment.entity';
import { Community } from '../community/entities/community.entity';
import { News } from '../news/entities/news.entity';
import { User } from '../user/entities/user.entity';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { Report } from './entities/report.entity';
import { AdminReportController } from './admin-report.controller';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      User,
      Block,
      Community,
      News,
      Comment,
      Announcement,
      ChatRoom,
      ChatRoomMember,
    ]),
    AuthModule,
  ],
  controllers: [ReportController, AdminReportController],
  providers: [ReportService, AdminRoleGuard],
  exports: [ReportService],
})
export class ReportModule {}
