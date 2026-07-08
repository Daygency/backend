import type { Express } from 'express';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseAndValidateJsonPayload } from '../../common/parse-json-payload.util';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { ListInquiriesQueryDto } from './dto/list-inquiries-query.dto';
import { InquiryService } from './inquiry.service';

@ApiTags('inquiries')
@Controller('inquiries')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FilesInterceptor('files', 3, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '1:1 문의 등록 — FormData: payload(JSON) + files(이미지 최대 3)',
  })
  async create(
    @Request() req: { user: { id: string } },
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const dto = await parseAndValidateJsonPayload(CreateInquiryDto, payload);
    return this.inquiryService.create(req.user.id, dto.content, files ?? []);
  }

  @Get()
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 문의 목록 (무한스크롤)' })
  listMine(
    @Request() req: { user: { id: string } },
    @Query() query: ListInquiriesQueryDto,
  ) {
    return this.inquiryService.listMine(req.user.id, query);
  }

  @Get(':inquiryId')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 문의 상세' })
  findMine(
    @Request() req: { user: { id: string } },
    @Param('inquiryId', ParseUUIDPipe) inquiryId: string,
  ) {
    return this.inquiryService.findMine(req.user.id, inquiryId);
  }
}
