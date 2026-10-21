import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { todayInKorea } from '../../users.constants.js';
import { CreateUserReqDto } from './create-user-req.dto.js';

const DAY = 24 * 60 * 60 * 1000;

describe('CreateUserReqDto', () => {
  const birthDateErrors = (birthDate: string) => {
    const dto = plainToInstance(CreateUserReqDto, {
      loginId: 'motu01',
      password: 'motu1234!',
      nickname: '모투투자',
      email: 'name@example.com',
      birthDate,
      termsAgreed: true,
      privacyAgreed: true,
      marketingAgreed: false,
    });
    return validateSync(dto)
      .filter(({ property }) => property === 'birthDate')
      .flatMap(({ constraints }) => Object.values(constraints ?? {}));
  };

  it('오늘 날짜까지는 생년월일로 받는다', () => {
    expect(birthDateErrors('2000-01-01')).toEqual([]);
    expect(birthDateErrors(todayInKorea())).toEqual([]);
  });

  it('오늘 이후 날짜는 막는다', () => {
    const tomorrow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
    }).format(new Date(Date.now() + DAY));

    expect(birthDateErrors(tomorrow)).toEqual([
      '생년월일은 오늘 이후 날짜로 입력할 수 없습니다.',
    ]);
  });
});
