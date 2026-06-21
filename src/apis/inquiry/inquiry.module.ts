import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../file/file.module';
import { NoticeModule } from '../notice/notice.module';
import { User } from '../user/entities/user.entity';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { AdminInquiryController } from './admin-inquiry.controller';
import { Inquiry } from './entities/inquiry.entity';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inquiry, User]),
    AuthModule,
    FileModule,
    NoticeModule,
  ],
  controllers: [InquiryController, AdminInquiryController],
  providers: [InquiryService, AdminRoleGuard],
  exports: [InquiryService],
})
export class InquiryModule {}
