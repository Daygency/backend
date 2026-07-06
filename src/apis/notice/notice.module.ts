import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { AdminNoticeController } from './admin-notice.controller';
import { Notice } from './entities/notice.entity';
import { NoticeRecipient } from './entities/notice-recipient.entity';
import { UserPushDevice } from './entities/user-push-device.entity';
import { FcmService } from './fcm.service';
import { NoticeController } from './notice.controller';
import { NoticeService } from './notice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notice, NoticeRecipient, UserPushDevice, User]),
    AuthModule,
  ],
  controllers: [NoticeController, AdminNoticeController],
  providers: [NoticeService, FcmService, AdminRoleGuard],
  exports: [NoticeService, FcmService],
})
export class NoticeModule {}
