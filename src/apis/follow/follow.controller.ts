import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FollowUserDto } from './dto/follow-user.dto';
import { ListFollowQueryDto } from './dto/list-follow-query.dto';
import { FollowService } from './follow.service';

@ApiTags('follow')
@Controller('follow')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  @Get('users/:userId/following')
  @ApiOperation({
    summary: '특정 유저의 팔로잉 목록 (최근 팔로우한 순, 커서 페이지네이션)',
  })
  listFollowing(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListFollowQueryDto,
  ) {
    return this.followService.listFollowing(userId, query);
  }

  @Get('users/:userId/followers')
  @ApiOperation({
    summary: '특정 유저의 팔로워 목록 (최근 팔로우된 순, 커서 페이지네이션)',
  })
  listFollowers(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListFollowQueryDto,
  ) {
    return this.followService.listFollowers(userId, query);
  }

  @Post()
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '팔로우' })
  follow(@Request() req: { user: { id: string } }, @Body() dto: FollowUserDto) {
    return this.followService.follow(req.user.id, dto.receiverId);
  }

  @Delete(':receiverId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '언팔로우' })
  unfollow(
    @Request() req: { user: { id: string } },
    @Param('receiverId', ParseUUIDPipe) receiverId: string,
  ) {
    return this.followService.unfollow(req.user.id, receiverId);
  }
}
