import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
export class CreateLinkReqDto {
  @ApiProperty({ example: 'https://example.com/evidence' })
  @IsString()
  @MaxLength(2048)
  url: string;
}
