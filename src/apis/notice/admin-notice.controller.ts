import {
  Body,
  Controller,
  Post,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { SendAdminNotificationDto } from './dto/send-admin-notification.dto';
import { NoticeService } from './notice.service';

@ApiTags('admin-notifications')
@Controller('admin/notifications')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@ApiBearerAuth()
export class AdminNoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Post('broadcast')
  @ApiOperation({
    summary: '전체 유저에게 공지 알림 발송 (isPushEnabled 무시하고 전송)',
  })
  broadcast(
    @Request() req: { user: { id: string } },
    @Body() dto: SendAdminNotificationDto,
  ) {
    return this.noticeService.sendAdminBroadcast(req.user.id, dto);
  }
}
