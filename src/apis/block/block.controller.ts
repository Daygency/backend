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
import { BlockUserDto } from './dto/block-user.dto';
import { BlockService } from './block.service';

@ApiTags('block')
@Controller('block')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '차단 — 등록 시 해당 유저와의 양방향 팔로우 관계가 모두 삭제됩니다.',
  })
  block(@Request() req: { user: { id: string } }, @Body() dto: BlockUserDto) {
    return this.blockService.block(req.user.id, dto.blockedId);
  }

  @Delete(':blockedId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '차단 해제' })
  unblock(
    @Request() req: { user: { id: string } },
    @Param('blockedId', ParseUUIDPipe) blockedId: string,
  ) {
    return this.blockService.unblock(req.user.id, blockedId);
  }
}
