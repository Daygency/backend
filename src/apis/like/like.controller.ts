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
import { LikeService } from './like.service';
import { CreateLikeDto } from './dto/create-like.dto';
import { ListLikeQueryDto } from './dto/list-like-query.dto';
import { RemoveLikeQueryDto } from './dto/remove-like-query.dto';

@Controller('like')
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  create(
    @Body() createLikeDto: CreateLikeDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.likeService.create(req.user.id, createLikeDto);
  }

  @Get()
  findAll(@Query() query: ListLikeQueryDto) {
    return this.likeService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.likeService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('access'))
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.likeService.remove(req.user.id, id);
  }

  @Delete()
  @UseGuards(AuthGuard('access'))
  removeByTarget(
    @Query() query: RemoveLikeQueryDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.likeService.removeByTarget(
      req.user.id,
      query.likeType,
      query.targetId,
    );
  }
}
