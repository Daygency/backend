import { ApiProperty } from '@nestjs/swagger';

export class JusoAddressItemDto {
  @ApiProperty({ description: '도로명주소' })
  roadAddr: string;
}
