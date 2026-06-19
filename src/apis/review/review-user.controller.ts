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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiBody({
    description:
      '수정할 필드만 보내면 됩니다. disappointmentReasonCodes/privateNoteToOps는 nullable.',
    schema: {
      type: 'object',
      properties: {
        rating: {
          type: 'string',
          enum: ['DISAPPOINTING', 'GOOD', 'IMPRESSED'],
        },
        disappointmentReasonCodes: {
          type: 'array',
          nullable: true,
          items: {
            type: 'string',
            enum: [
              'TIME_NOT_KEPT',
              'COMMUNICATION',
              'RESPONSE_LATE_OR_UNCLEAR',
              'INSUFFICIENT_PREP',
              'UNCOMFORTABLE_PROCESS',
              'REQUESTS_NOT_REFLECTED',
              'PROBLEM_RESPONSE_WEAK',
            ],
          },
        },
        privateNoteToOps: {
          type: 'string',
          nullable: true,
          maxLength: 2000,
        },
        positiveReasonCodes: {
          type: 'array',
          nullable: true,
          items: {
            type: 'string',
            enum: [
              'TIME_WELL_KEPT',
              'FLEXIBLE_ON_SCHEDULE_CHANGE',
              'SMOOTH_COMMUNICATION',
              'FAST_AND_CLEAR_RESPONSE',
              'WELL_PREPARED',
              'COMFORTABLE_COLLABORATION',
              'POLITE_AND_CONSIDERATE',
              'CALM_PROBLEM_SOLVING',
            ],
          },
        },
        publicNote: {
          type: 'string',
          nullable: true,
          maxLength: 2000,
        },
      },
      example: {
        positiveReasonCodes: ['POLITE_AND_CONSIDERATE'],
        publicNote: '매너가 좋고 진행이 안정적이었어요.',
      },
    },
  })
  @ApiResponse({ status: 200, description: '후기 수정 완료' })
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
