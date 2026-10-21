import { ApiProperty } from '@nestjs/swagger';

export class SectorItemResDto {
  @ApiProperty({ example: 1 })
  sectorCode: number;

  @ApiProperty({ example: 'SaaS / 소프트웨어' })
  sectorName: string;
}

export class GetSectorsResDto {
  @ApiProperty({ type: [SectorItemResDto], description: '카테고리 코드순' })
  items: SectorItemResDto[];
}
