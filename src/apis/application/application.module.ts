import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { Announcement } from '../announcement/entities/announcement.entity';
import { ApplicationConfig } from '../announcement/entities/application-config.entity';
import { NoticeModule } from '../notice/notice.module';
import { User } from '../user/entities/user.entity';
import { Application } from './entities/application.entity';
import { ApplicationService } from './application.service';
import { ApplicationController } from './application.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Application,
      Announcement,
      ApplicationConfig,
      User,
    ]),
    AuthModule,
    ChatModule,
    NoticeModule,
  ],
  controllers: [ApplicationController],
  providers: [ApplicationService],
})
export class ApplicationModule {}
