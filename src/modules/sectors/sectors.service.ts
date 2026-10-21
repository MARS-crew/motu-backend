import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { GetSectorsResDto } from './dto/res/get-sectors-res.dto.js';

@Injectable()
export class SectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSectors(): Promise<GetSectorsResDto> {
    const sectors = await this.prisma.sector.findMany({
      orderBy: { code: 'asc' },
    });
    return {
      items: sectors.map(({ code, name }) => ({
        sectorCode: code,
        sectorName: name,
      })),
    };
  }
}
