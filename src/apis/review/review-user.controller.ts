import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewService } from './review.service';

@ApiTags('review')
@Controller('reviews')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ReviewUserController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('me')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 작성한 후기 목록 (커서 페이지네이션)' })
  listMine(
    @Request() req: { user: { id: string } },
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviewService.listWrittenByUser(req.user.id, query);
  }

  @Get('received')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 받은 후기 목록 (커서 페이지네이션)' })
  listReceived(
    @Request() req: { user: { id: string } },
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviewService.listReceivedByUser(req.user.id, query);
  }

  @Patch(':reviewId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 작성한 후기 수정' })
  update(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.update(req.user.id, reviewId, dto);
  }

  @Delete(':reviewId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 작성한 후기 삭제' })
  remove(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.reviewService.remove(req.user.id, reviewId);
  }
}
