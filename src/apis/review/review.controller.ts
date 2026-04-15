import {
  Body,
  Controller,
  Get,
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
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewService } from './review.service';

@ApiTags('review')
@Controller('announcement')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post(':postId/reviews')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '공연 완료 후 활동 후기 작성 — 상대에게 인박스 알림과 FCM 푸시(설정 시)',
  })
  create(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.create(req.user.id, postId, dto);
  }

  @Get(':postId/reviews/me')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '해당 공고에 내가 작성한 활동 후기 (없으면 null)' })
  findMine(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.reviewService.findMineForPost(req.user.id, postId);
  }
}
