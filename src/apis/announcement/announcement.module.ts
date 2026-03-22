import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementService } from './announcement.service';
import { AnnouncementController } from './announcement.controller';
import { Announcement } from './entities/announcement.entity';
import { AnnouncementCategory } from './entities/announcement-category.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { Application } from './entities/application.entity';
import { ApplicationSubmissionService } from './application.service';
import { ApplicationSubmissionController } from './application.controller';
import { FileModule } from '../file/file.module';
import { AuthModule } from '../auth/auth.module';
import { MajorModule } from '../major/major.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Announcement,
      AnnouncementCategory,
      ApplicationConfig,
      Application,
    ]),
    FileModule,
    AuthModule,
    MajorModule,
  ],
  controllers: [AnnouncementController, ApplicationSubmissionController],
  providers: [AnnouncementService, ApplicationSubmissionService],
})
export class AnnouncementModule {}
