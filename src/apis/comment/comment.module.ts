import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NoticeModule } from '../notice/notice.module';
import { AuthModule } from '../auth/auth.module';
import { User } from '../user/entities/user.entity';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { Comment } from './entities/comment.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { Like } from '../like/entities/like.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, News, Community, User, Like]),
    NoticeModule,
    AuthModule,
  ],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
