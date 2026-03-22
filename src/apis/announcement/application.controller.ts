import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { ApplicationSubmissionService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';

@ApiTags('applications')
@Controller('announcement')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ApplicationSubmissionController {
  constructor(
    private readonly applicationSubmissionService: ApplicationSubmissionService,
  ) {}

  @Post(':postId/applications')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '공고에 지원서 제출 (지원폼 1건)' })
  submit(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationSubmissionService.submit(postId, req.user.id, dto);
  }

  @Get(':postId/applications/me')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '해당 공고에 내가 제출한 지원서 조회' })
  async findMine(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
  ) {
    const row = await this.applicationSubmissionService.findMine(
      postId,
      req.user.id,
    );
    if (!row) {
      throw new NotFoundException('제출한 지원서가 없습니다.');
    }
    return row;
  }

  @Get(':postId/applications')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '해당 공고에 달린 지원서 목록 (공고 작성자만)',
  })
  findAllForPost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.applicationSubmissionService.findAllForPost(
      postId,
      req.user.id,
    );
  }
}
