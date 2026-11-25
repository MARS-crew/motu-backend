import { ApiProperty } from '@nestjs/swagger';

export class NotificationSettingsResDto {
  @ApiProperty({ description: '전체 푸시 수신 동의' }) isPushEnabled: boolean;
  @ApiProperty({
    description:
      '저장된 야간 동의값. 전체 푸시 OFF 중에도 보존하며 실제 발송 허용과는 별개',
  })
  nightPushEnabled: boolean;
  @ApiProperty({
    description: '야간 토글 변경 가능 여부. 전체 푸시 OFF이면 false',
  })
  canChangeNightPush: boolean;
  @ApiProperty({ example: 'Asia/Seoul' }) timeZone: string;
  @ApiProperty({ example: '21:00', description: '이 시각부터 야간(포함)' })
  nightStart: string;
  @ApiProperty({ example: '08:00', description: '이 시각부터 주간(미포함)' })
  nightEnd: string;
}
