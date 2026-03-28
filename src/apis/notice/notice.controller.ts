import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { NoticeService } from './notice.service';

@ApiTags('notifications')
@Controller('notifications')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Post('devices')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FCM 기기 토큰 등록/갱신' })
  registerDevice(
    @Request() req: { user: { id: string } },
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.noticeService.registerPushDevice(req.user.id, dto);
  }

  @Delete('devices')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'FCM 기기 토큰 해제' })
  unregisterDevice(
    @Request() req: { user: { id: string } },
    @Body() dto: UnregisterPushDeviceDto,
  ) {
    return this.noticeService.unregisterPushDevice(req.user.id, dto.fcmToken);
  }

  @Get()
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 알림 인박스 (수신자 기준)' })
  listInbox(
    @Request() req: { user: { id: string } },
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.noticeService.listInbox(req.user.id, query);
  }

  @Patch('recipients/:recipientId/read')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '알림 읽음 처리 (notice_recipient.id)' })
  markRead(
    @Request() req: { user: { id: string } },
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.noticeService.markRecipientRead(req.user.id, recipientId);
  }
}
