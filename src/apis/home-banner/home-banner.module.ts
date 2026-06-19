import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileModule } from '../file/file.module';
import { User } from '../user/entities/user.entity';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { AdminHomeBannerController } from './admin-home-banner.controller';
import { HomeBannerController } from './home-banner.controller';
import { HomeBannerService } from './home-banner.service';
import { HomeBanner } from './entities/home-banner.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HomeBanner, User]), FileModule],
  controllers: [HomeBannerController, AdminHomeBannerController],
  providers: [HomeBannerService, AdminRoleGuard],
  exports: [HomeBannerService],
})
export class HomeBannerModule {}
