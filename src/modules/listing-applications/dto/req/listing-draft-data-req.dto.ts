import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

/** 임시저장은 필수값·최소 길이·이메일·숫자·날짜 완성도를 검증하지 않는다. */
export class ListingDraftDataReqDto {
  @ApiPropertyOptional({
    description: '서비스명',
    maxLength: 30,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(30, { message: INVALID_REQUEST_MESSAGE })
  serviceName?: string | null;

  @ApiPropertyOptional({
    description: '한 줄 소개',
    maxLength: 60,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(60, { message: INVALID_REQUEST_MESSAGE })
  summary?: string | null;

  @ApiPropertyOptional({
    description: '상세 설명',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(500, { message: INVALID_REQUEST_MESSAGE })
  description?: string | null;

  @ApiPropertyOptional({
    description: '공식 HTTPS URL',
    maxLength: 2048,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(2048, { message: INVALID_REQUEST_MESSAGE })
  officialUrl?: string | null;

  @ApiPropertyOptional({
    description: '운영사명',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(50, { message: INVALID_REQUEST_MESSAGE })
  operatorName?: string | null;

  @ApiPropertyOptional({
    description: '담당자명',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(50, { message: INVALID_REQUEST_MESSAGE })
  managerName?: string | null;

  @ApiPropertyOptional({
    description: '업무용 이메일',
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(255, { message: INVALID_REQUEST_MESSAGE })
  businessEmail?: string | null;

  @ApiPropertyOptional({
    description: '담당자 연락처',
    maxLength: 30,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(30, { message: INVALID_REQUEST_MESSAGE })
  contactPhone?: string | null;

  @ApiPropertyOptional({
    description: '희망 상장가. 미완성 숫자 입력도 문자열로 보관',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  desiredPrice?: string | null;

  @ApiPropertyOptional({
    description: '총 발행 수량',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  totalIssuedQuantity?: string | null;

  @ApiPropertyOptional({
    description: '최소 주문 수량',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  minOrderQuantity?: string | null;

  @ApiPropertyOptional({
    description: '호가 단위',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  tickSize?: string | null;

  @ApiPropertyOptional({
    description: '가격 산정 근거',
    maxLength: 5000,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(5000, { message: INVALID_REQUEST_MESSAGE })
  priceCalculationBasis?: string | null;

  @ApiPropertyOptional({
    description: '희망 거래 시작 일시',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  desiredListingDate?: string | null;

  @ApiPropertyOptional({ description: 'MAU', maxLength: 40, nullable: true })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  mau?: string | null;

  @ApiPropertyOptional({ description: 'DAU', maxLength: 40, nullable: true })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  dau?: string | null;

  @ApiPropertyOptional({ description: '매출', maxLength: 40, nullable: true })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  revenue?: string | null;

  @ApiPropertyOptional({ description: '거래액', maxLength: 40, nullable: true })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  transactionVolume?: string | null;

  @ApiPropertyOptional({
    description: '지표 집계 시작일',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  metricsStartDate?: string | null;

  @ApiPropertyOptional({
    description: '지표 집계 종료일',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  metricsEndDate?: string | null;

  @ApiPropertyOptional({
    description: '매출 집계 시작일',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  revenueStartDate?: string | null;

  @ApiPropertyOptional({
    description: '매출 집계 종료일',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  revenueEndDate?: string | null;

  @ApiPropertyOptional({
    description: '매출 출처명',
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(255, { message: INVALID_REQUEST_MESSAGE })
  revenueSource?: string | null;

  @ApiPropertyOptional({
    description: '매출 추출일',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  revenueExtractDate?: string | null;

  @ApiPropertyOptional({
    description: '거래액 집계 기준',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  transactionVolumeBasis?: string | null;

  @ApiPropertyOptional({
    description: '거래액 출처명',
    maxLength: 255,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(255, { message: INVALID_REQUEST_MESSAGE })
  transactionVolumeSource?: string | null;

  @ApiPropertyOptional({
    description: '거래액 추출일',
    maxLength: 40,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(40, { message: INVALID_REQUEST_MESSAGE })
  transactionVolumeExtractDate?: string | null;

  @ApiPropertyOptional({
    description: '증빙 자료 설명',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(500, { message: INVALID_REQUEST_MESSAGE })
  evidenceDescription?: string | null;

  @ApiPropertyOptional({ description: '카테고리 코드', nullable: true })
  @IsOptional()
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  sectorCode?: number | null;

  @ApiPropertyOptional({ description: 'LOGO 작성 묶음', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: INVALID_REQUEST_MESSAGE })
  logoCollectionId?: string | null;

  @ApiPropertyOptional({ description: 'MAIN_IMAGE 작성 묶음', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: INVALID_REQUEST_MESSAGE })
  mainImageCollectionId?: string | null;

  @ApiPropertyOptional({ description: 'EVIDENCE 작성 묶음', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: INVALID_REQUEST_MESSAGE })
  evidenceCollectionId?: string | null;
}
