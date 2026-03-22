import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FollowModule } from '../follow/follow.module';
import { User } from '../user/entities/user.entity';
import { Block } from './entities/block.entity';
import { BlockController } from './block.controller';
import { BlockService } from './block.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Block, User]),
    AuthModule,
    FollowModule,
  ],
  controllers: [BlockController],
  providers: [BlockService],
})
export class BlockModule {}
