import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScrapController } from './scrap.controller';
import { ScrapService } from './scrap.service';
import { Scrap } from './entities/scrap.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { Announcement } from '../announcement/entities/announcement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Scrap, News, Community, Announcement])],
  controllers: [ScrapController],
  providers: [ScrapService],
})
export class ScrapModule {}
