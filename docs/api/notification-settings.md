# 푸시·야간 푸시 알림 수신 설정

[← API 목차](README.md)

이슈 #114 / MOTU-14-1-2. [2차 개발 화면설계서](https://docs.google.com/presentation/d/1enVRxUOunj_8btTQwLHhJdK1t9dmbxcK/edit)의 USR-MY-05 기준이다. 전체 푸시 OFF 때 야간 동의값을 보존하는 동작은 기획 담당자가 확정했다.

## API

둘 다 Bearer 로그인이 필요하고 인증된 본인의 설정만 처리한다. 회원 ID를 본문·경로로 받지 않는다. 별도의 이메일/SMS 인증은 요구하지 않는다. 잠금·정지·탈퇴 회원은 기존 공통 인증 규칙을 적용하며, PATCH는 회원 행 잠금 후 상태도 다시 확인한다.

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/users/me/notification-settings` | 본인 설정·야간 토글 변경 가능 여부·한국 야간 시간대 |
| PATCH | `/api/users/me/notification-settings` | 전달한 설정만 부분 변경하고 저장 결과 반환 |

```json
{
  "success": true,
  "data": {
    "isPushEnabled": false,
    "nightPushEnabled": true,
    "canChangeNightPush": false,
    "timeZone": "Asia/Seoul",
    "nightStart": "21:00",
    "nightEnd": "08:00"
  }
}
```

- `nightPushEnabled`는 저장된 야간 동의값이다. 전체 푸시가 OFF면 true로 남아도 실제 푸시 발송을 허용하지 않는다.
- `canChangeNightPush`가 false면 야간 토글은 비활성화하되 저장된 선택값은 보존한다. 전체 푸시를 다시 켜면 이전 야간 선택값을 그대로 사용한다.
- 야간은 **한국 시간 21:00 이상~다음 날 08:00 미만**이다. 20:59:59.999와 08:00은 주간, 21:00과 07:59:59.999는 야간이다.
- 기존 `User.isPushEnabled`, `User.nightPushEnabled`를 사용한다. 두 컬럼의 기존 기본값(true), 기존 회원의 모든 조합을 그대로 유지하며 조회로 값을 보정하지 않는다.

## 변경 요청과 원자성

전체 푸시만 끄기:

```json
{ "isPushEnabled": false }
```

야간 동의값은 그대로 남는다. 전체 푸시만 다시 켜려면 `{"isPushEnabled":true}`를 보낸다.

전체 푸시가 ON일 때 야간만 변경:

```json
{ "nightPushEnabled": false }
```

전체 푸시 ON과 야간 변경을 한 번에 수행:

```json
{ "isPushEnabled": true, "nightPushEnabled": false }
```

| 요청 | 결과 |
|---|---|
| 전체 푸시만 OFF | 성공. 기존 야간 동의 보존 |
| OFF 상태에서 야간 필드 전달 | 409. 같은 값을 보내더라도 야간 필드 전달 자체를 거절 |
| 전체 ON + 야간 변경 | 성공. 요청 반영 후 전체 푸시가 ON이므로 허용 |
| 전체 OFF + 야간 필드 전달 | 409. 전체 요청을 거절하며 두 값 모두 유지 |
| 현재 값과 같은 유효한 값 재전송 | 200. 최종 상태 유지 |
| `{}` | 400 `NOTIFICATION_SETTINGS_NOTHING_TO_UPDATE` |
| 문자열 `"false"`, 숫자, null, 배열, 회원 ID 등 추가 필드 | 400 `BAD_REQUEST` |

한 회원의 PATCH는 `users` 행의 `FOR NO KEY UPDATE`로 직렬화한다. 잠금 획득 후 최신 전체 푸시와 회원 상태를 읽으므로 다른 요청에서 OFF로 바꾼 값을 건너뛰어 야간 설정을 변경할 수 없다. 생략한 필드는 UPDATE에 넣지 않는다. 이 잠금은 회원 FK 확인을 불필요하게 막지 않는다.

## 프론트 연결

1. 화면 진입 시 GET 결과로 두 토글과 야간 토글 활성 상태를 표시한다.
2. 토글 변경 시 바꿀 필드만 PATCH한다. 요청 중 중복 조작을 막고 서버가 반환한 값으로 화면을 맞춘다.
3. 전체 푸시를 끌 때 `nightPushEnabled`를 함께 false로 보내지 않는다. 전체 푸시만 OFF 요청하고 야간 토글을 비활성화한다.
4. OFF 상태에서 두 설정을 한 번에 바꾸려면 전체 ON과 야간 값을 함께 전송한다.
5. 409 `NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH`면 최신 설정을 조회하고 전체 푸시 ON이 필요한지 안내한다. 실패한 조작이 저장된 것처럼 표시하지 않는다.

## 푸시 발송기 연결 계약

푸시 발송 기능은 포함하지 않는다. 발송기 모듈에서 `NotificationsModule`을 import하고 export된 `NotificationSettingsService`를 주입한다.

```ts
const decision = await notificationSettings.getPushDecision(userId, new Date());
if (!decision.allowed) {
  return;
}
// 여기서 별도로 기기 토큰·OS 권한을 확인하고 푸시 공급자에 전송한다.
```

실제 전송 직전에 최신 저장값을 읽는다. 큐 등록 시점의 허용 결과나 이벤트 발생 시각을 그대로 재사용하지 않는다. 지연 발송·재시도에서는 다시 판단한다. 상태 조회와 외부 전송 사이의 모든 경합을 원자적으로 막아주는 API는 아니며 외부 네트워크 요청 동안 DB 잠금을 유지하지 않는다.

`getPushDecision(userId, at = new Date(), tx?)`는 `{allowed, reason}`을 반환한다. `at`은 서버의 실제 발송 예정 시각이며 클라이언트 입력값이 아니다. 선택적으로 기존 트랜잭션의 읽기에 참여할 수 있지만, 전송 직전에는 오래된 스냅샷을 재사용하지 않는 것이 원칙이다. 호출자가 이미 읽은 설정에 대해 같은 순수 판단이 필요하면 `evaluatePushDelivery(preferences, at)`을 사용할 수 있다.

| reason | 의미 |
|---|---|
| `ALLOWED` | 이 설정상 발송 허용. 실제 전송·기기 권한 허용을 뜻하지 않음 |
| `PUSH_DISABLED` | 전체 푸시 수신 OFF |
| `NIGHT_PUSH_DISABLED` | 전체 ON이지만 한국 야간이고 야간 동의 OFF |
| `USER_UNAVAILABLE` | 없거나 삭제·탈퇴·잠금·정지 등 비활성 회원 |
| `INVALID_TIME` | 잘못된 Date. 발송하지 않음 |

FCM·기기 토큰 등록·OS 권한 요청·공급자 재시도·예약 큐 구현은 별도 범위다. 이 판단을 [앱 내 알림](notifications.md)의 생성·목록·읽음·미확인 수에 적용하지 않는다. 푸시 OFF여도 앱 내 체결·목표가·만료 안내 이력은 기존대로 저장·조회한다.

## 로컬 Swagger 확인

새 마이그레이션과 환경 변수는 없다. 기존 dev 마이그레이션이 미적용이면 **로컬 DATABASE_URL**에서 `npm run db:deploy` → `npm run db:generate` 후 서버를 재시작한다. 기존 테스트 계정이 없을 때만 `npm run db:seed`를 실행한다.

1. `npm run start:dev` 후 `http://localhost:3000/api/docs`를 열고 `motuuser / motuuser1!`로 로그인·Authorize한다. `Notification Settings` 태그를 찾는다.
2. GET으로 기존 두 값을 기록한다. 기존 값은 회원마다 다를 수 있다.
3. PATCH `{"isPushEnabled":true,"nightPushEnabled":true}` → 두 값과 `canChangeNightPush`가 true인지 확인한다.
4. PATCH `{"isPushEnabled":false}` → 야간 값은 true, `canChangeNightPush`는 false인지 확인한다.
5. 이 상태에서 PATCH `{"nightPushEnabled":false}` → HTTP 409, 코드 `NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH`인지 확인한다. 재조회하면 이전 두 값이 유지되어야 한다.
6. PATCH `{"isPushEnabled":true}` → 이전 야간 true가 복원되는지 확인한다. 야간 false로도 같은 OFF/ON 반복을 확인한다.
7. ON 상태에서 `{"isPushEnabled":false,"nightPushEnabled":false}`를 보내 요청 전체가 409로 거절되고 전체 ON이 유지되는지 확인한다.
8. `{}`, `{"isPushEnabled":"false"}`, `{"nightPushEnabled":null}`, `{"userId":1,"isPushEnabled":true}`는 400이어야 한다.
9. 푸시 OFF 전후 기존 `GET /api/notifications`, `/unread-count`, `PATCH /api/notifications/{id}/read`가 기존대로 동작하는지 확인한다. 확인 후 2번의 원래 설정값으로 복원한다. 원래 전체 OFF였다면 먼저 ON+원래 야간 값으로 저장한 뒤 전체만 OFF로 되돌린다.

자동 검증: `npm run build` 후 `node scripts/verify-notification-settings.mjs`. localhost에 별도 일회용 DB와 파일 디렉터리를 만들고 기존 마이그레이션을 적용한다. 서버 두 개에서 권한·엄격한 입력·부분 변경·야간 보존·동시 변경·계정 정지 경합·기존 앱 내 알림을 검사한 뒤 생성한 DB·파일을 정리한다. 실제 FCM·SMS·메일 발송과 기존 로컬/운영 데이터 변경은 없다. 단위 테스트는 한국 시간의 21:00·08:00·자정·연말 경계와 발송 판단도 검증한다.
