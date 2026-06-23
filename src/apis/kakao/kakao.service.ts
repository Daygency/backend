import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KakaoPlaceItemDto } from './dto/kakao-place-item.dto';

type KakaoLocalDocument = {
  id?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

@Injectable()
export class KakaoService implements OnModuleInit {
  private readonly logger = new Logger(KakaoService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.getRestApiKey()) {
      this.logger.warn(
        'KAKAO_REST_API_KEY가 없습니다. backend/.env에 REST API 키를 넣고 서버를 재시작하세요.',
      );
    }
  }

  private getRestApiKey(): string | undefined {
    return this.config.get<string>('KAKAO_REST_API_KEY')?.trim();
  }

  async searchPlaces(query: string): Promise<KakaoPlaceItemDto[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new BadRequestException('검색어를 입력해주세요.');
    }

    const apiKey = this.getRestApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        '카카오 장소 검색이 설정되지 않았습니다. backend/.env에 KAKAO_REST_API_KEY(REST API 키)를 넣고 백엔드 서버를 재시작해주세요.',
      );
    }

    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', trimmed);
    url.searchParams.set('size', '10');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });

    if (!res.ok) {
      throw new ServiceUnavailableException('장소 검색에 실패했습니다.');
    }

    const body = (await res.json()) as { documents?: KakaoLocalDocument[] };
    const documents = body.documents ?? [];

    return documents
      .map((doc) => {
        const latitude = Number(doc.y);
        const longitude = Number(doc.x);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }
        const placeName = (doc.place_name ?? '').trim();
        const address =
          (doc.road_address_name ?? '').trim() ||
          (doc.address_name ?? '').trim();
        if (!placeName && !address) {
          return null;
        }
        return {
          placeId: String(doc.id ?? ''),
          placeName: placeName || address,
          address: address || placeName,
          latitude,
          longitude,
        };
      })
      .filter((item): item is KakaoPlaceItemDto => item != null);
  }
}
