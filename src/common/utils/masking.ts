/**
 * 휴대폰 번호 가운데를 가린다. 예) 01012344821 → 010-****-4821
 */
export function maskPhoneNumber(phoneNumber: string): string {
  return `${phoneNumber.slice(0, 3)}-****-${phoneNumber.slice(-4)}`;
}

/**
 * 이메일 아이디 부분을 앞 2자(3자 미만이면 1자)만 남기고 가린다. 예) kimmt1234@gmail.com → ki*******@gmail.com
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const head = local.slice(0, local.length < 3 ? 1 : 2);
  return `${head}${'*'.repeat(Math.max(local.length - head.length, 1))}${email.slice(at)}`;
}
