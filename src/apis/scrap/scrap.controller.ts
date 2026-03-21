import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ScrapService } from './scrap.service';
import { CreateScrapDto } from './dto/create-scrap.dto';
import { ListScrapQueryDto } from './dto/list-scrap-query.dto';
import { RemoveScrapQueryDto } from './dto/remove-scrap-query.dto';

@Controller('scrap')
export class ScrapController {
  constructor(private readonly scrapService: ScrapService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  create(
    @Body() createScrapDto: CreateScrapDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.scrapService.create(req.user.id, createScrapDto);
  }

  @Get()
  findAll(@Query() query: ListScrapQueryDto) {
    return this.scrapService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scrapService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('access'))
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.scrapService.remove(req.user.id, id);
  }

  @Delete()
  @UseGuards(AuthGuard('access'))
  removeByTarget(
    @Query() query: RemoveScrapQueryDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.scrapService.removeByTarget(req.user.id, query.targetType, query.targetId);
  }
}
