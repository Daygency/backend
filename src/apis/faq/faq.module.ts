import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { User } from '../user/entities/user.entity';
import { AdminFaqController } from './admin-faq.controller';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { Faq } from './entities/faq.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Faq, User])],
  controllers: [FaqController, AdminFaqController],
  providers: [FaqService, AdminRoleGuard],
  exports: [FaqService],
})
export class FaqModule {}
