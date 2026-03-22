import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';
import { News } from './entities/news.entity';
import { AuthModule } from '../auth/auth.module';
import { Like } from '../like/entities/like.entity';
import { Comment } from '../comment/entities/comment.entity';
import { FileModule } from '../file/file.module';
import { NewsFileService } from './news-file.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([News, Like, Comment]),
    AuthModule,
    FileModule,
  ],
  controllers: [NewsController],
  providers: [NewsService, NewsFileService],
  exports: [NewsFileService],
})
export class NewsModule {}
