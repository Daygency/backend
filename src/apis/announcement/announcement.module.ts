import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementService } from './announcement.service';
import { AnnouncementController } from './announcement.controller';
import { Announcement } from './entities/announcement.entity';
import { ApplicationConfig } from './entities/application-config.entity';
import { FileModule } from '../file/file.module';
import { AuthModule } from '../auth/auth.module';
import { MajorModule } from '../major/major.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Announcement, ApplicationConfig]),
    FileModule,
    AuthModule,
    MajorModule,
  ],
  controllers: [AnnouncementController],
  providers: [AnnouncementService],
})
export class AnnouncementModule {}
