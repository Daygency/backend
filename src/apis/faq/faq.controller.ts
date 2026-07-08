import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListFaqQueryDto } from './dto/list-faq-query.dto';
import { FaqService } from './faq.service';

@ApiTags('faqs')
@Controller('faqs')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Get()
  @ApiOperation({ summary: 'FAQ 목록 (노출 중, 무한스크롤)' })
  findActive(@Query() query: ListFaqQueryDto) {
    return this.faqService.findActivePublic(query);
  }
}
