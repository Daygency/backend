import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoleGuard } from '../../../common/guards/admin-role.guard';
import { ListBannedUsersQueryDto } from '../dto/list-banned-users-query.dto';
import { UserService } from '../services/user.service';

@ApiTags('admin-users')
@Controller('admin/users')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
@ApiBearerAuth()
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get('banned')
  @ApiOperation({ summary: '정지(BAN) 계정 목록 (관리자, 무한스크롤)' })
  listBanned(@Query() query: ListBannedUsersQueryDto) {
    return this.userService.listBannedForAdmin(query);
  }

  @Post(':userId/unban')
  @ApiOperation({ summary: '계정 정지 해제 (관리자)' })
  unban(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.unbanUserForAdmin(userId);
  }
}
