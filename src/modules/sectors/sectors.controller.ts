import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { GetSectorsResDto } from './dto/res/get-sectors-res.dto.js';
import { SectorsService } from './sectors.service.js';

@ApiTags('Sectors')
@Controller('sectors')
export class SectorsController {
  constructor(private readonly sectorsService: SectorsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '상품 카테고리 목록',
    description: '마켓의 카테고리 버튼에 쓴다. 상장 신청과 같은 9개 값이다.',
  })
  @ApiOkResponse({ type: GetSectorsResDto })
  getSectors(): Promise<GetSectorsResDto> {
    return this.sectorsService.getSectors();
  }
}
