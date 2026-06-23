import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import { Community } from './entities/community.entity';
import { CommunityCategory } from './entities/community-category.entity';
import { Like } from '../like/entities/like.entity';
import { Comment } from '../comment/entities/comment.entity';
import { FileModule } from '../file/file.module';
import { CommunityFileService } from './community-file.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Community, CommunityCategory, Like, Comment]),
    FileModule,
    AuthModule,
  ],
  controllers: [CommunityController],
  providers: [CommunityService, CommunityFileService],
  exports: [CommunityFileService],
})
export class CommunityModule {}
