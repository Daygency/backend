import { Module } from '@nestjs/common';
import { UserModule } from './apis/user/user.module';
import { AuthModule } from './apis/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementModule } from './apis/announcement/announcement.module';
import { FileModule } from './apis/file/file.module';
import { AnnouncementCategory } from './apis/announcement/entities/announcement-category.entity';
import { CommunityCategory } from './apis/community/entities/community-category.entity';
import { Major } from './apis/major/entities/major.entity';
import { DatabaseSeedService } from './common/database-seed.service';
import { CommunityModule } from './apis/community/community.module';
import { NewsModule } from './apis/news/news.module';
import { CommentModule } from './apis/comment/comment.module';
import { LikeModule } from './apis/like/like.module';
import { ScrapModule } from './apis/scrap/scrap.module';
import { ChatModule } from './apis/chat/chat.module';
import { ApplicationModule } from './apis/application/application.module';
import { FollowModule } from './apis/follow/follow.module';
import { BlockModule } from './apis/block/block.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    UserModule, //
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: process.env.DATABASE_TYPE as 'mysql',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '3306'),
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      synchronize: true,
      logging: true,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
    }),
    TypeOrmModule.forFeature([AnnouncementCategory, CommunityCategory, Major]),
    FileModule,
    AnnouncementModule,
    ApplicationModule,
    CommunityModule,
    NewsModule,
    CommentModule,
    LikeModule,
    ScrapModule,
    ChatModule,
    FollowModule,
    BlockModule,
    HealthModule,
  ],
  providers: [DatabaseSeedService],
})
export class AppModule {}
