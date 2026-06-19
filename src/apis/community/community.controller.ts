import type { Express } from 'express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { parseAndValidateJsonPayload } from '../../common/parse-json-payload.util';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Post('json')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '커뮤니티 글 작성 (JSON만, 이미지 없음)' })
  createJson(
    @Body() createCommunityDto: CreateCommunityDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.communityService.create(req.user.id, createCommunityDto);
  }

  @Post()
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      '커뮤니티 글 작성 — FormData: payload(JSON 문자열) + files(이미지, 필드명 files 반복)',
  })
  async create(
    @Body('payload') payload: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: { user: { id: string } },
  ) {
    const dto = await parseAndValidateJsonPayload(
      CreateCommunityDto,
      payload,
    );
    return this.communityService.create(req.user.id, dto, files ?? []);
  }

  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
  ) {
    return this.communityService.findAll(categoryId, q);
  }

  @Get('categories')
  findCategories() {
    return this.communityService.findAllCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.communityService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('access'))
  update(
    @Param('id') id: string,
    @Body() updateCommunityDto: UpdateCommunityDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.communityService.update(req.user.id, id, updateCommunityDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('access'))
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.communityService.remove(req.user.id, id);
  }
}
