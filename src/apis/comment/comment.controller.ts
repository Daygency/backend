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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentQueryDto } from './dto/list-comment-query.dto';

@Controller('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  create(
    @Body() createCommentDto: CreateCommentDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.commentService.create(req.user.id, createCommentDto);
  }

  @Get()
  findAll(@Query() query: ListCommentQueryDto) {
    return this.commentService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('access'))
  update(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.commentService.update(req.user.id, id, updateCommentDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('access'))
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.commentService.remove(req.user.id, id);
  }
}
