import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { ListAdminReportsQueryDto } from './dto/list-admin-reports-query.dto';
import { ReportService } from './report.service';

@ApiTags('admin-reports')
@Controller('admin/reports')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@ApiBearerAuth()
export class AdminReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @ApiOperation({
    summary: '신고 목록 (관리자) — 출처·대상·신고자 정보 포함',
  })
  list(@Query() query: ListAdminReportsQueryDto) {
    return this.reportService.listForAdmin(query);
  }
}
