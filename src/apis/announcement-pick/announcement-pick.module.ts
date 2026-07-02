import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { FileModule } from '../file/file.module';
import { User } from '../user/entities/user.entity';
import { AdminAnnouncementPickController } from './admin-announcement-pick.controller';
import { AnnouncementPickController } from './announcement-pick.controller';
import { AnnouncementPickService } from './announcement-pick.service';
import { AnnouncementPick } from './entities/announcement-pick.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AnnouncementPick, User]), FileModule],
  controllers: [AnnouncementPickController, AdminAnnouncementPickController],
  providers: [AnnouncementPickService, AdminRoleGuard],
  exports: [AnnouncementPickService],
})
export class AnnouncementPickModule {}
