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
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProfileResponseDto } from '../dto/profile-response.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ListMyScrapQueryDto } from '../dto/list-my-scrap-query.dto';

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

  @Get('check-activity-name')
  @ApiOperation({ summary: '활동 아이디(activityName) 중복 여부 확인' })
  @ApiResponse({ status: 200, description: '사용 가능 여부 반환' })
  async checkActivityName(
    @Query('activityName') activityName: string,
  ): Promise<{ available: boolean }> {
    return this.userService.checkActivityNameAvailable(activityName);
  }

  @Get('posts/my')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 쓴 작성글 목록 조회' })
  @ApiResponse({
    status: 200,
    description: '내가 쓴 글(커뮤니티/공연소식/모집공고) 반환',
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyWrittenPosts(@Request() req: { user: { id: string } }) {
    return this.userService.getMyWrittenPosts(req.user.id);
  }

  @Get('posts/my/news')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 쓴 공연소식 목록 조회' })
  @ApiResponse({ status: 200, description: '내 공연소식 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyNewsPosts(@Request() req: { user: { id: string } }) {
    return this.userService.getMyNewsPosts(req.user.id);
  }

  @Get('posts/my/announcements')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 쓴 모집공고 목록 조회' })
  @ApiResponse({ status: 200, description: '내 모집공고 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyAnnouncementPosts(@Request() req: { user: { id: string } }) {
    return this.userService.getMyAnnouncementPosts(req.user.id);
  }

  @Get('posts/my/scraps/announcements')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 스크랩한 모집공고 목록 조회 (무한스크롤)' })
  @ApiResponse({ status: 200, description: '내 스크랩 모집공고 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyScrappedAnnouncementPosts(
    @Request() req: { user: { id: string } },
    @Query() query: ListMyScrapQueryDto,
  ) {
    return this.userService.getMyScrappedAnnouncementPosts(req.user.id, query);
  }

  @Get('posts/my/scraps/community')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 스크랩한 커뮤니티글 목록 조회 (무한스크롤)' })
  @ApiResponse({ status: 200, description: '내 스크랩 커뮤니티 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyScrappedCommunityPosts(
    @Request() req: { user: { id: string } },
    @Query() query: ListMyScrapQueryDto,
  ) {
    return this.userService.getMyScrappedCommunityPosts(req.user.id, query);
  }

  @Get('posts/my/scraps/news')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 스크랩한 공연소식 목록 조회 (무한스크롤)' })
  @ApiResponse({ status: 200, description: '내 스크랩 공연소식 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyScrappedNewsPosts(
    @Request() req: { user: { id: string } },
    @Query() query: ListMyScrapQueryDto,
  ) {
    return this.userService.getMyScrappedNewsPosts(req.user.id, query);
  }

  @Get('posts/my/scraps/highlights')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({
    summary: '내 스크랩 최신 묶음 조회 (커뮤니티 1개 + 공연소식 5개)',
  })
  @ApiResponse({ status: 200, description: '내 스크랩 최신 묶음 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyScrappedPostHighlights(@Request() req: { user: { id: string } }) {
    return this.userService.getMyScrappedPostHighlights(req.user.id);
  }

  @Get('posts/my/highlights')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({
    summary:
      '내 최신 글 묶음 조회 (커뮤니티 1개 + 공연소식 5개 + 모집공고 1개)',
  })
  @ApiResponse({ status: 200, description: '최신 글 묶음 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyPostHighlights(@Request() req: { user: { id: string } }) {
    return this.userService.getMyPostHighlights(req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: '사용자 검색 / 추천 목록' })
  @ApiResponse({
    status: 200,
    description: '사용자 검색/추천 성공',
  })
  @ApiResponse({ status: 400, description: '활동명 없음 (검색 시)' })
  searchUsers(
    @Query('activityName') activityName: string,
    @Query('recommend') recommend: string,
  ) {
    if (recommend !== undefined) {
      return this.userService.getRecommendedUsers();
    }
    return this.userService.findUsersByActivityName(activityName);
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
