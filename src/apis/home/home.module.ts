import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { Announcement } from '../announcement/entities/announcement.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { CommunityCategory } from '../community/entities/community-category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Announcement,
      News,
      Community,
      CommunityCategory,
    ]),
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
