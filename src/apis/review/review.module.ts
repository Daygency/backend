import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Application } from '../application/entities/application.entity';
import { Announcement } from '../announcement/entities/announcement.entity';
import { AuthModule } from '../auth/auth.module';
import { NoticeModule } from '../notice/notice.module';
import { User } from '../user/entities/user.entity';
import { Review } from './entities/review.entity';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Announcement, Application, User]),
    AuthModule,
    NoticeModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
