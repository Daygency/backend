import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
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
  controllers: [NoticeController],
  providers: [NoticeService, FcmService],
  exports: [NoticeService, FcmService],
})
export class NoticeModule {}
