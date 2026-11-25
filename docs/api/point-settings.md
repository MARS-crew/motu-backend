# 신규 가입 초기 지급 포인트 설정

[← API 명세서 목차](README.md)

MOTU-28-3-1 / ADM-MBR-03. 활성 관리자만 조회·변경·이력 조회할 수 있습니다.

## 적용 범위

- 변경값은 **이후 신규 가입자부터 적용**하며 기존 회원 잔액·과거 원장을 소급 변경하지 않습니다.
- DB 단일 행의 최초 기본값은 3,000,000P입니다. 마이그레이션에서 한 번 준비하며 서버 시작·재시작·seed에서 덮어쓰지 않습니다. 서버별 캐시를 두지 않습니다.
- 포인트 리셋은 기존 3,000,000P, 잔액 300,000P 미만·7일 간격 등의 조건을 유지합니다. 추가 지급도 기존 100,000P·24시간 간격입니다.
- 설정은 금액만 바꿉니다. 개별 회원에게 실제 지급하는 관리자 API와 구분합니다.

## 현재 설정

`GET /api/admin/point-settings/initial-grant`

응답 `data`:

```json
{
  "amount": 3000000,
  "version": 1,
  "modifiedDate": "2026-11-25T09:00:00.000Z"
}
```

`modifiedDate`는 최초 설정 준비 또는 마지막 실제 변경 시각입니다. 설정 행이 없으면 임의 기본값으로 가입시키지 않으며 마이그레이션 상태를 점검해야 합니다.

## 설정 변경

`PATCH /api/admin/point-settings/initial-grant`

```json
{
  "amount": 5000000,
  "expectedVersion": 1,
  "reason": "신규 가입 초기 지급 정책 변경"
}
```

| 필드 | 규칙 |
|---|---|
| amount | 필수 JSON 숫자 정수, 1~9,007,199,254,740,991P (JS 안전한 정수 상한). 숫자 문자열·null·소수·boolean 거절 |
| expectedVersion | GET으로 읽은 version 필수. 1~2,147,483,646 정수 |
| reason | 필수 문자열, 앞뒤 공백 제거 후 1~200자 |

성공 시 현재 설정 응답을 반환하며 버전이 1 증가합니다. 같은 버전의 같은 금액을 저장하면 변경으로 보지 않아 시각·버전·이력을 늘리지 않습니다. 같은 금액이라도 버전이 오래됐으면 409입니다. 추가 필드는 받지 않습니다.

설정 변경과 변경 전·후 금액·버전, 사유, 관리자, 시각, 접속 정보의 공통 활동 이력 저장은 **같은 트랜잭션**입니다. 이력 실패 시 설정도 롤백합니다.

### 동시 처리 및 프론트 계약

1. 화면 진입 시 GET의 금액·버전을 보관합니다.
2. 변경할 금액·사유와 함께 `expectedVersion`을 전송합니다. 저장 중 버튼을 비활성화합니다.
3. 409이면 최신 설정을 재조회하고 변경값을 확인받습니다. 새 버전만 붙여 자동 덮어쓰지 않습니다.
4. 회원가입은 같은 가입 트랜잭션에서 설정 행을 `FOR SHARE`로 읽고, 계좌와 DEPOSIT 원장에 동일 금액을 저장합니다. 응답 `cash`도 실제 지급액입니다.
5. 관리자는 설정 행의 `FOR UPDATE` 잠금 후 최신 버전을 확인합니다. 가입이 먼저 잠금을 얻으면 해당 가입은 이전 금액으로 완료된 뒤 설정이 바뀝니다. 변경이 먼저면 가입은 변경 커밋을 기다린 뒤 새 금액을 받습니다. HTTP 요청 시작 시각만으로 적용 금액을 구분하지 않습니다.

## 변경 이력

`GET /api/admin/point-settings/initial-grant/history?page=1&size=20`

- page 기본 1 (최대 1,000,000), size 기본 20 (최대 100).
- 응답: `items[] { activityLogId, beforeAmount, afterAmount, beforeVersion, afterVersion, reason, adminId, adminLoginId, createDate }`, `page`, `size`, `totalCount`.
- 최신순이며 같은 시각은 ID 역순으로 정렬합니다. 최초 기본값 준비·같은 금액 저장·실패한 변경은 변경 이력에 포함하지 않습니다.
- 공통 [관리자 활동 이력](admin-activity-logs.md)에서도 `targetType=POINT_SETTING&targetId=1&action=INITIAL_GRANT_UPDATE`로 조회합니다. 회원 지급 `POINT_GRANT`·회수 `POINT_RECALL`과 분리합니다.
- 프론트 활동 이력 필터에 **초기 지급 설정 → 초기 지급액 변경** 매핑을 연결합니다. 화면설계서 파일은 이 작업에서 수정하지 않았습니다.

## 에러

| HTTP / 코드 | 의미 |
|---|---|
| 400 BAD_REQUEST | 금액·버전·사유·페이지 또는 추가 필드 오류 |
| 401 UNAUTHORIZED 등 공통 인증 코드 | 토큰 없음·만료·유효하지 않음 |
| 403 AUTH_FORBIDDEN | 일반 회원 |
| 403 AUTH_ACCOUNT_BLOCKED / AUTH_ACCOUNT_LOCKED | 정지·잠긴 관리자 |
| 409 POINT_SETTINGS_CONCURRENT_UPDATE | 다른 관리자가 먼저 변경. 최신 설정 재조회 |

## 로컬 Swagger 검증 순서

기존 로컬 DB를 사용하는 수동 검증입니다. DB 접속 대상이 localhost인지 먼저 확인합니다.

1. `npm run db:deploy` → `npm run db:generate` → `npm run db:seed` → `npm run start:dev`. 기존 회원 잔액과 원장은 초기화하지 않습니다. production에는 로컬 검증 명령을 실행하지 않습니다.
2. `http://localhost:3000/api/docs`에서 `motuadmin / motuadmin1!`로 로그인 후 Authorize합니다.
3. Admin - Point Settings의 GET으로 현재 amount·version을 적습니다. 최초 적용 DB는 3,000,000P / version 1이고, 이미 변경했다면 현재 값이 나옵니다.
4. 필요하면 먼저 새로운 이메일로 가입 이메일 인증 → 회원가입을 진행해 현재 설정 지급액을 확인합니다. 기존 seed 계정은 가입 경로 검증용이 아닙니다.
5. PATCH에 위 JSON을 넣되 `expectedVersion`은 **방금 GET한 버전**으로 바꿉니다. 성공 후 5,000,000P와 증가한 버전을 확인합니다.
6. history에서 변경 전후 금액·사유·관리자·시각을 확인합니다. 위 PATCH를 **이전 버전 그대로** 재실행하면 409인지 확인합니다.
7. 0·음수·소수·문자열 금액과 공백 사유는 400인지 확인합니다. 최신 버전의 같은 금액 저장은 버전·이력 건수가 그대로입니다.
8. 새로운 이메일·아이디로 다시 가입합니다. 가입 응답 cash, 본인 계좌 GET, 원장 GET의 DEPOSIT 금액이 모두 5,000,000P인지 확인합니다. 이전 회원 계좌는 그대로인지 확인합니다. 관리자 토큰과 회원 토큰을 혼동하지 마세요.
9. 일반 회원 토큰으로 세 관리자 API를 호출하면 403인지 확인합니다. 리셋 가능 여부의 resetCash는 설정 변경 후에도 3,000,000P입니다.
10. 테스트가 끝나면 관리자 토큰으로 원래 금액과 **최신 버전**, 복구 사유를 PATCH합니다. 복구도 정상 변경 이력에 남습니다. 테스트로 이미 가입한 회원에게 소급 적용하지 않습니다.

## 자동 검증

`npm run build` 후 `node scripts/verify-initial-point-settings.mjs`.

localhost의 별도 일회용 PostgreSQL DB와 임시 파일 저장소를 만들고 종료 시 정리합니다. 두 서버의 변경 공유·재시작 보존, 권한·입력 검증·페이징, 변경 전후 실제 HTTP 회원가입, 관리자 동시 수정, 가입/변경 경합의 양방향 순서, DB 트리거로 주입한 이력 실패 및 가입 원장 실패 롤백, 리셋·추가 지급 회귀를 확인합니다. 인증 완료 상태만 일회용 DB에 준비하며 외부 메일·SMS를 보내지 않습니다.
