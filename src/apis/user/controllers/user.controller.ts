import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Request,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProfileResponseDto } from '../dto/profile-response.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get('profile/my')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiResponse({
    status: 200,
    description: '프로필 조회 성공',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getMyProfile(
    @Request() req: { user: { id: string } },
  ): Promise<ProfileResponseDto> {
    return this.userService.getMyProfile(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch('profile/my')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내 프로필 수정' })
  @ApiResponse({
    status: 200,
    description: '프로필 수정 성공',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  updateMyProfile(
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: { user: { id: string } },
  ) {
    const userId = req.user.id;
    return this.userService.updateMyProfile(userId, updateUserDto);
  }
}
