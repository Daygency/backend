import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { FaqService } from './faq.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { ListFaqQueryDto } from './dto/list-faq-query.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@ApiTags('admin-faqs')
@Controller('admin/faqs')
@UseGuards(AuthGuard('access'), AdminRoleGuard)
export class AdminFaqController {
  constructor(private readonly faqService: FaqService) {}

  @Get()
  @ApiOperation({ summary: 'FAQ 전체 목록 (관리자, 무한스크롤)' })
  findAll(@Query() query: ListFaqQueryDto) {
    return this.faqService.findAllAdmin(query);
  }

  @Get(':faqId')
  @ApiOperation({ summary: 'FAQ 단건 (관리자)' })
  findOne(@Param('faqId') faqId: string) {
    return this.faqService.findOneAdmin(faqId);
  }

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'FAQ 등록' })
  create(@Body() dto: CreateFaqDto) {
    return this.faqService.create(dto);
  }

  @Patch(':faqId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'FAQ 수정' })
  update(@Param('faqId') faqId: string, @Body() dto: UpdateFaqDto) {
    return this.faqService.update(faqId, dto);
  }

  @Delete(':faqId')
  @ApiOperation({ summary: 'FAQ 삭제' })
  remove(@Param('faqId') faqId: string) {
    return this.faqService.remove(faqId);
  }
}
