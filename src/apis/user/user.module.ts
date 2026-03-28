import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './services/user.service';
import { UserController } from './controllers/user.controller';
import { User } from './entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { MajorModule } from '../major/major.module';
import { PortfolioService } from './services/portfolio.service';
import { Award } from './entities/award.entity';
import { Career } from './entities/career.entity';
import { Education } from './entities/education.entity';
import { Certificate } from './entities/certificate.entity';
import { News } from '../news/entities/news.entity';
import { Community } from '../community/entities/community.entity';
import { Announcement } from '../announcement/entities/announcement.entity';
import { Like } from '../like/entities/like.entity';
import { Comment } from '../comment/entities/comment.entity';
import { Scrap } from '../scrap/entities/scrap.entity';
import { Follow } from '../follow/entities/follow.entity';
import { FileModule } from '../file/file.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Award,
      Career,
      Education,
      Certificate,
      News,
      Community,
      Announcement,
      Like,
      Comment,
      Scrap,
      Follow,
    ]),
    FileModule,
    MajorModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [UserController],
  providers: [UserService, PortfolioService],
  exports: [UserService],
})
export class UserModule {}
