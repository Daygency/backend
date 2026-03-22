import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FollowUserDto } from './dto/follow-user.dto';
import { FollowService } from './follow.service';

@ApiTags('follow')
@Controller('follow')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class FollowController {
  constructor(private readonly followService: FollowService) {}

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
