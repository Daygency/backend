import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, News, Community])],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
