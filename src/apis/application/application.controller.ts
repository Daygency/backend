import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@ApiTags('applications')
@Controller('applications')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '공고에 지원서 제출 (동일 공고에 삭제되지 않은 활성 지원은 1건만)',
  })
  create(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateApplicationDto,
  ) {
    return this.applicationService.submit(req.user.id, dto);
  }

  @Get('post/:postId/me')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '해당 공고에 내가 제출한 지원서 조회' })
  async findMine(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
  ) {
    const row = await this.applicationService.findMine(postId, req.user.id);
    if (!row) {
      throw new NotFoundException('제출한 지원서가 없습니다.');
    }
    return row;
  }

  @Get('post/:postId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '해당 공고에 달린 지원서 목록 (공고 작성자만, 무한스크롤)',
  })
  findAllForPost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Request() req: { user: { id: string } },
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.applicationService.findAllForPost(postId, req.user.id, query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '지원서 단건 조회 (지원자 본인 또는 해당 공고 작성자)',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.applicationService.findOneById(id, req.user.id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '지원 심사 상태 변경 (해당 공고 작성자만: 서류 검토·합격·불합격 등)',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.applicationService.updateStatusByRecruiter(
      req.user.id,
      id,
      dto,
    );
  }

  @Patch(':id')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '지원서 수정 (지원자 본인, 마감 전·OPEN 공고만, 양식 필수항목 유지)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.applicationService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '내 지원서 소프트 삭제 (지원자 본인만, 삭제 후 동일 공고 재지원 가능)',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string } },
  ): Promise<void> {
    await this.applicationService.removeByApplicant(req.user.id, id);
  }
}
