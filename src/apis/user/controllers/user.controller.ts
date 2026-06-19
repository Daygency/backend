import type { Express } from 'express';
import { UserService } from '../services/user.service';
import { UserDocumentService } from '../services/user-document.service';
import { CreateUserDto } from '../dto/create-user.dto';
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  Patch,
  Query,
  UsePipes,
  ValidationPipe,
  UploadedFile,
  UseInterceptors,
  Delete,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProfileResponseDto } from '../dto/profile-response.dto';
import { PublicProfileResponseDto } from '../dto/public-profile-response.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ListMyScrapQueryDto } from '../dto/list-my-scrap-query.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { parseAndValidateJsonPayload } from '../../../common/parse-json-payload.util';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userDocumentService: UserDocumentService,
  ) {}

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

  @Get('posts/my/comments')
  @UseGuards(AuthGuard('access'))
  @ApiOperation({ summary: '내가 작성한 댓글 목록 조회' })
  @ApiResponse({ status: 200, description: '내 댓글 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyCommentPosts(@Request() req: { user: { id: string } }) {
    return this.userService.getMyCommentPosts(req.user.id);
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

  @Get('me/documents')
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '내 자료 보관함 — 보관함 업로드·지원서 첨부·내 게시글 첨부 파일 취합',
  })
  @ApiResponse({ status: 200, description: '자료 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getMyDocuments(@Request() req: { user: { id: string } }) {
    return this.userDocumentService.listMyDocuments(req.user.id);
  }

  @Post('me/documents')
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '내 자료 보관함 — 파일 직접 업로드' })
  @ApiResponse({ status: 201, description: '업로드 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  uploadMyDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('업로드할 file 필드가 필요합니다.');
    }
    return this.userDocumentService.uploadMyDocument(req.user.id, file);
  }

  @Delete('me/documents/:fileId')
  @UseGuards(AuthGuard('access'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 자료 보관함 — 직접 업로드 파일 삭제' })
  @ApiResponse({ status: 204, description: '삭제 성공' })
  @ApiResponse({ status: 403, description: '보관함 직접 업로드만 삭제 가능' })
  @ApiResponse({ status: 404, description: '파일 없음' })
  async deleteMyDocument(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Request() req: { user: { id: string } },
  ): Promise<void> {
    await this.userDocumentService.deleteMyDocument(req.user.id, fileId);
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

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: '유저 목록 (가입일 최신순, 무한스크롤) — 전공 필터 복수 선택 가능',
  })
  @ApiResponse({ status: 200, description: '유저 목록 반환' })
  findList(@Query() query: ListUsersQueryDto) {
    return this.userService.findList(query);
  }

  @Get(':id/profile')
  @ApiOperation({
    summary:
      '유저 상세(포트폴리오) — 내 프로필 조회와 동일, 연락처(이메일·전화) 제외',
  })
  @ApiResponse({
    status: 200,
    description: '프로필 조회 성공',
    type: PublicProfileResponseDto,
  })
  @ApiResponse({ status: 404, description: '유저 없음' })
  getUserProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getPublicProfile(id);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('access'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: '내 계정 탈퇴 (소프트 삭제)',
    description:
      'FCM 기기 등록을 삭제한 뒤 사용자 행을 소프트 삭제합니다. 이후 동일 소셜로 로그인하면 계정이 복구될 수 있습니다.',
  })
  @ApiResponse({ status: 204, description: '탈퇴 처리 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '사용자 없음' })
  async deleteMyAccount(
    @Request() req: { user: { id: string } },
  ): Promise<void> {
    await this.userService.deleteMyAccount(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch('profile/my')
  @UseGuards(AuthGuard('access'))
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: '내 프로필 수정' })
  @ApiResponse({
    status: 200,
    description: '프로필 수정 성공',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async updateMyProfile(
    @Body() updateUserDto: UpdateUserDto,
    @Body('payload') payload: string | undefined,
    @UploadedFile() profileImage: Express.Multer.File | undefined,
    @Request() req: { user: { id: string } },
  ) {
    const userId = req.user.id;
    const dto = payload
      ? await parseAndValidateJsonPayload(UpdateUserDto, payload)
      : updateUserDto;
    return this.userService.updateMyProfile(userId, dto, profileImage);
  }
}
