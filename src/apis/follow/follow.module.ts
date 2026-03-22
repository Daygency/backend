import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Block } from '../block/entities/block.entity';
import { User } from '../user/entities/user.entity';
import { Follow } from './entities/follow.entity';
import { FollowController } from './follow.controller';
import { FollowService } from './follow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Follow, Block, User]),
    AuthModule,
  ],
  controllers: [FollowController],
  providers: [FollowService],
  exports: [FollowService],
})
export class FollowModule {}
