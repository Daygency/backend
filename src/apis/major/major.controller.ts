import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MajorListItemDto } from './dto/major-list-item.dto';
import { MajorService } from './major.service';

@ApiTags('majors')
@Controller('major')
export class MajorController {
  constructor(private readonly majorService: MajorService) {}

  @Get()
  @ApiOperation({
    summary: '전공 목록',
    description:
      'DB에 등록된 전공을 이름순으로 반환. 모집공고 작성 시 `majorIds`에 넣을 `majorId` 조회에 사용. 인증 불필요.',
  })
  @ApiOkResponse({ type: [MajorListItemDto] })
  findAll(): Promise<MajorListItemDto[]> {
    return this.majorService.findAll();
  }
}
