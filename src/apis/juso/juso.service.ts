import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JusoAddressItemDto } from './dto/juso-address-item.dto';

type JusoRoadItem = {
  roadAddr?: string;
};

type JusoLinkResponse = {
  results?: {
    common?: {
      errorCode?: string;
      errorMessage?: string;
    };
    juso?: JusoRoadItem[];
  };
};

@Injectable()
export class JusoService implements OnModuleInit {
  private readonly logger = new Logger(JusoService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.getConfmKey()) {
      this.logger.warn(
        'JUSO_CONFM_KEY가 없습니다. backend/.env에 도로명주소 API 승인키를 넣고 서버를 재시작하세요.',
      );
    }
  }

  private getConfmKey(): string | undefined {
    return this.config.get<string>('JUSO_CONFM_KEY')?.trim();
  }

  async searchAddress(keyword: string): Promise<JusoAddressItemDto[]> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      throw new BadRequestException('검색어를 입력해주세요.');
    }

    const confmKey = this.getConfmKey();
    if (!confmKey) {
      throw new ServiceUnavailableException(
        '주소 검색이 설정되지 않았습니다. backend/.env에 JUSO_CONFM_KEY(도로명주소 API 승인키)를 넣고 백엔드 서버를 재시작해주세요.',
      );
    }

    const url = new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do');
    url.searchParams.set('confmKey', confmKey);
    url.searchParams.set('keyword', trimmed);
    url.searchParams.set('currentPage', '1');
    url.searchParams.set('countPerPage', '20');
    url.searchParams.set('resultType', 'json');

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new ServiceUnavailableException('주소 검색에 실패했습니다.');
    }

    const body = (await res.json()) as JusoLinkResponse;
    const errorCode = body.results?.common?.errorCode;
    if (errorCode && errorCode !== '0') {
      const message = body.results?.common?.errorMessage ?? '주소 검색에 실패했습니다.';
      throw new ServiceUnavailableException(message);
    }

    const juso = body.results?.juso ?? [];
    return juso
      .map((item) => ({ roadAddr: (item.roadAddr ?? '').trim() }))
      .filter((item) => item.roadAddr);
  }
}
