import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportService } from './report.service';

@ApiTags('reports')
@Controller('reports')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '콘텐츠/사용자 신고',
    description:
      '동일 신고자→피신고자는 1회만 가능. 차단 관계면 신고 불가. 누적 신고 수가 설정값 초과 시 피신고자 activity=FLAGGED.',
  })
  @ApiResponse({ status: 201, description: '신고 접수' })
  @ApiResponse({ status: 400, description: '본인 신고·대상 불일치 등' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '차단 관계' })
  @ApiResponse({ status: 404, description: '대상 없음' })
  @ApiResponse({ status: 409, description: '이미 신고함' })
  async create(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateReportDto,
  ) {
    return this.reportService.create(req.user.id, dto);
  }
}
