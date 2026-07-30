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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiBody({
    description:
      '아쉬웠어요(DISAPPOINTING) 선택 시 disappointmentReasonCodes 사용 가능. comment는 평점 상관없이 선택 입력, 상대방에게 공개됨.',
    schema: {
      type: 'object',
      required: ['revieweeUserId', 'rating'],
      properties: {
        revieweeUserId: { type: 'string', format: 'uuid' },
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
        comment: {
          type: 'string',
          nullable: true,
          maxLength: 2000,
        },
      },
      example: {
        revieweeUserId: '550e8400-e29b-41d4-a716-446655440111',
        rating: 'GOOD',
        positiveReasonCodes: ['SMOOTH_COMMUNICATION', 'WELL_PREPARED'],
        comment: '덕분에 연주가 매우 편안했고 소통이 좋았습니다.',
      },
    },
  })
  @ApiResponse({ status: 201, description: '후기 작성 완료' })
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
  @ApiResponse({ status: 200, description: '후기 1건 또는 null 반환' })
  findMine(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.reviewService.findMineForPost(req.user.id, postId);
  }
}
