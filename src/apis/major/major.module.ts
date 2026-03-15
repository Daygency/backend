import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Major } from './entities/major.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Major])],
  exports: [TypeOrmModule],
})
export class MajorModule {}
