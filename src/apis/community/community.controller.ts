import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CommunityService } from './community.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Post()
  @UseGuards(AuthGuard('access'))
  create(
    @Body() createCommunityDto: CreateCommunityDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.communityService.create(req.user.id, createCommunityDto);
  }

  @Get()
  findAll() {
    return this.communityService.findAll();
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
