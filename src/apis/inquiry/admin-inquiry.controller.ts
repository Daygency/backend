import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { ListAdminInquiriesQueryDto } from './dto/list-admin-inquiries-query.dto';
import { ReplyInquiryDto } from './dto/reply-inquiry.dto';
import { InquiryService } from './inquiry.service';

@ApiTags('admin-inquiries')
@Controller('admin/inquiries')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@ApiBearerAuth()
export class AdminInquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Get()
  @ApiOperation({ summary: '고객센터 문의 목록 (관리자)' })
  list(@Query() query: ListAdminInquiriesQueryDto) {
    return this.inquiryService.listForAdmin(query);
  }

  @Get(':inquiryId')
  @ApiOperation({ summary: '고객센터 문의 상세 (관리자)' })
  findOne(@Param('inquiryId', ParseUUIDPipe) inquiryId: string) {
    return this.inquiryService.findForAdmin(inquiryId);
  }

  @Patch(':inquiryId/reply')
  @ApiOperation({ summary: '고객센터 문의 답변 (관리자)' })
  reply(
    @Param('inquiryId', ParseUUIDPipe) inquiryId: string,
    @Body() dto: ReplyInquiryDto,
  ) {
    return this.inquiryService.reply(inquiryId, dto.answer);
  }
}
