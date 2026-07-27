import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const STATIC_MAP_URL = 'https://naveropenapi.apigw.ntruss.com/map-static/v2/raster';

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 300;
const MAX_SIZE = 1024;
const DEFAULT_LEVEL = 16;

@Injectable()
export class NaverMapService implements OnModuleInit {
  private readonly logger = new Logger(NaverMapService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.getClientId() || !this.getClientSecret()) {
      this.logger.warn(
        'NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET가 없습니다. backend/.env에 NCP Maps API 키를 넣고 서버를 재시작하세요.',
      );
    }
  }

  private getClientId(): string | undefined {
    return this.config.get<string>('NAVER_MAP_CLIENT_ID')?.trim();
  }

  private getClientSecret(): string | undefined {
    return this.config.get<string>('NAVER_MAP_CLIENT_SECRET')?.trim();
  }

  private clampSize(value: number | undefined, fallback: number): number {
    if (!Number.isFinite(value) || !value) return fallback;
    return Math.min(MAX_SIZE, Math.max(1, Math.round(value)));
  }

  async getStaticMap(options: {
    latitude: number;
    longitude: number;
    width?: number;
    height?: number;
  }): Promise<{ buffer: Buffer; contentType: string }> {
    const { latitude, longitude } = options;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('latitude, longitude가 올바르지 않습니다.');
    }

    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        '지도 미리보기가 설정되지 않았습니다. backend/.env에 NAVER_MAP_CLIENT_ID/NAVER_MAP_CLIENT_SECRET(NCP Maps API 키)를 넣고 백엔드 서버를 재시작해주세요.',
      );
    }

    const width = this.clampSize(options.width, DEFAULT_WIDTH);
    const height = this.clampSize(options.height, DEFAULT_HEIGHT);

    const url = new URL(STATIC_MAP_URL);
    url.searchParams.set('w', String(width));
    url.searchParams.set('h', String(height));
    url.searchParams.set('center', `${longitude},${latitude}`);
    url.searchParams.set('level', String(DEFAULT_LEVEL));
    url.searchParams.set('format', 'png');
    url.searchParams.set(
      'markers',
      `type:d|size:mid|pos:${longitude} ${latitude}`,
    );

    const res = await fetch(url.toString(), {
      headers: {
        'x-ncp-apigw-api-key-id': clientId,
        'x-ncp-apigw-api-key': clientSecret,
      },
    });

    if (!res.ok) {
      this.logger.error(
        `Naver static map 요청 실패: ${res.status} ${await res.text().catch(() => '')}`,
      );
      throw new ServiceUnavailableException('지도 이미지를 불러오지 못했습니다.');
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get('content-type') ?? 'image/png',
    };
  }
}
