import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { SetPushEnabledDto } from './dto/set-push-enabled.dto';
import { SetPushCategoryPreferencesDto } from './dto/set-push-category-preferences.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { NoticeService } from './notice.service';

@ApiTags('notifications')
@Controller('notifications')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NoticeController {
  constructor(
    private readonly noticeService: NoticeService,
    private readonly config: ConfigService,
  ) {}

  private assertTestPushAllowed(): void {
    if (this.config.get<string>('NOTIFICATION_TEST_PUSH') !== 'true') {
      throw new ForbiddenException(
        '테스트 푸시는 비활성화되어 있습니다. 백엔드 서버 환경 변수 NOTIFICATION_TEST_PUSH=true 를 설정하고 서버를 재시작하세요.',
      );
    }
  }

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

  @Get('push-enabled')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '실제 알림(댓글/팔로우 등) 수신 여부 조회' })
  getPushEnabled(@Request() req: { user: { id: string } }) {
    return this.noticeService.getPushEnabled(req.user.id);
  }

  @Patch('push-enabled')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '실제 알림(댓글/팔로우 등) 수신 여부 설정' })
  async setPushEnabled(
    @Request() req: { user: { id: string } },
    @Body() dto: SetPushEnabledDto,
  ) {
    await this.noticeService.setPushEnabled(req.user.id, dto.isPushEnabled);
    return { isPushEnabled: dto.isPushEnabled };
  }

  @Get('push-category-preferences')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '케이스별(팔로우/지원/후기/문의) 푸시 수신 여부 조회' })
  getPushCategoryPreferences(@Request() req: { user: { id: string } }) {
    return this.noticeService.getPushCategoryPreferences(req.user.id);
  }

  @Patch('push-category-preferences')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '케이스별(팔로우/지원/후기/문의) 푸시 수신 여부 설정' })
  async setPushCategoryPreferences(
    @Request() req: { user: { id: string } },
    @Body() dto: SetPushCategoryPreferencesDto,
  ) {
    await this.noticeService.setPushCategoryPreferences(req.user.id, dto);
    return this.noticeService.getPushCategoryPreferences(req.user.id);
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

  @Get('unread-count')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '읽지 않은 알림 개수 (notice_recipient.read_at IS NULL)',
  })
  unreadCount(@Request() req: { user: { id: string } }) {
    return this.noticeService.getUnreadCount(req.user.id);
  }

  @Patch('read-all')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 알림 전체 읽음 처리' })
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.noticeService.markAllRead(req.user.id);
  }

  @Post('test-push')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '테스트 푸시 (본인 등록 기기로만). NOTIFICATION_TEST_PUSH=true 일 때만 허용',
  })
  testPush(@Request() req: { user: { id: string } }) {
    this.assertTestPushAllowed();
    return this.noticeService.sendTestPushToSelf(req.user.id);
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
