import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementService } from './announcement.service';
import { AnnouncementController } from './announcement.controller';
import { Announcement } from './entities/announcement.entity';
import { AnnouncementCategory } from './entities/announcement-category.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { FileModule } from '../file/file.module';
import { AuthModule } from '../auth/auth.module';
import { MajorModule } from '../major/major.module';
import { AnnouncementFileService } from './announcement-file.service';
import { Application } from '../application/entities/application.entity';

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
  controllers: [AnnouncementController],
  providers: [AnnouncementService, AnnouncementFileService],
  exports: [AnnouncementFileService],
})
export class AnnouncementModule {}
