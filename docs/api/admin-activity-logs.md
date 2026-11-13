# 관리자 활동 이력

[← API 명세서 목차](README.md)

관리자가 처리한 작업(상장 승인, 상품 수정·거래 중지, 회원 상태 변경, 포인트 지급·회수, 관리자 계정, 공지, 이상 거래 조치)의 기록입니다. 모두 **관리자** 토큰이 필요합니다.

- 화면: `[2차 개발]모투화면설계서.pptx`의 ADM-MON-04 관리자 활동 이력, ADM-PRD-02-01 상품 변경 이력 탭, ADM-DB-01 대시보드 최근 운영 이력
- 이력은 운영 기록이라 **수정·삭제 API가 없습니다.**

## 작업 대상과 수행 작업

화면의 [작업 대상] 선택에 따라 [수행 작업] 선택지가 바뀝니다. 대상을 바꾸면 수행 작업은 '전체'로 되돌립니다.

| 작업 대상 `targetType` | 수행 작업 `action` | 대상 ID `targetId` |
|---|---|---|
| `LISTING_APPLICATION` 상장 신청 | `LISTING_APPROVE` 상장 승인, `LISTING_REVISION_REQUEST` 보완 요청, `LISTING_REJECT` 반려 | 상장 신청 ID |
| `STOCK` 상품 | `STOCK_UPDATE` 상품 정보 수정, `STOCK_PAUSE` 상품 거래 중지, `STOCK_RESUME` 상품 거래 재개, `STOCK_CLOSE` 상품 거래 종료 | 상품 ID |
| `USER` 회원 | `USER_STATUS_CHANGE` 회원 상태 변경, `USER_UNLOCK` 계정 잠금 해제, `POINT_GRANT` 포인트 지급, `POINT_RECALL` 포인트 회수 | 회원 user_id |
| `ADMIN` 관리자 계정 | `ADMIN_CREATE` 관리자 계정 생성, `ADMIN_STATUS_CHANGE` 관리자 계정 상태 변경 | 관리자 user_id |
| `NOTICE` 공지 | `NOTICE_PUBLISH` 공지 게시, `NOTICE_HIDE` 공지 비공개, `NOTICE_DELETE` 공지 삭제 | 공지 ID |
| `ANOMALY` 이상 거래 | `ANOMALY_ACTION` 이상 거래 조치 | 이상 거래 ID |

- 화면에 보이는 대상 ID(예: 상품 `PRD-018`, 회원 `USR-1024`)는 `targetId`에 대상별 접두어를 붙여 만듭니다.
- `targetLabel`은 처리 당시 대상 이름(상품명, 아이디, 공지 제목 등)입니다. 나중에 이름이 바뀌어도 당시 값이 남습니다.

## 목록

`GET /api/admin/activity-logs`

| 쿼리 | 설명 |
|---|---|
| `adminLoginId` | 관리자 아이디. 일부만 입력해도 됩니다. |
| `targetType` | 작업 대상 |
| `action` | 수행 작업. `targetType`과 같이 보내면 그 대상의 작업이어야 합니다. |
| `targetId` | 대상 ID. 한 대상의 기록만 볼 때 `targetType`과 같이 보냅니다. |
| `from`, `to` | 작업 기간. 시간대를 붙인 일시(`2026-09-01T00:00:00+09:00`). `from`은 포함, `to`는 포함하지 않습니다. 비우면 제한 없음. 최대 366일 |
| `page`, `size` | 페이지(1부터), 한 페이지 건수(기본 20, 최대 100) |

응답 `items[]`: `activityLogId`, `createDate`(작업 시각), `adminId`, `adminLoginId`, `targetType`, `targetId`, `targetLabel`, `action`, `result`(`SUCCESS`/`FAILURE`), `summary`(변경 요약, 예: `거래 가능 → 거래 중지`). 최신순이며 `page`, `size`, `totalCount`를 함께 내려줍니다.

화면별 사용법:

| 화면 | 요청 |
|---|---|
| 관리자 활동 이력 (ADM-MON-04) | 작업 기간 버튼: 최근 24시간·7일·30일은 프론트가 `from`을 계산해서 보냅니다. 직접 설정은 KST 시작·종료 일시를 그대로 보냅니다. |
| 상품 변경 이력 탭 (ADM-PRD-02-01) | `targetType=STOCK&targetId={상품 ID}`. 결과가 없으면 '변경 이력이 없습니다.'를 표시합니다. |
| 대시보드 최근 운영 이력 (ADM-DB-01) | `from={7일 전}&size=4` |

## 상세

`GET /api/admin/activity-logs/:activityLogId`

목록 항목에 더해 `before`(변경 전 값), `after`(변경 후 값), `reason`(처리 사유), `ipAddress`(접속 IP, 뒤 두 자리 가림: `192.168.***.***`)를 내려줍니다. `before`·`after`는 `{ 항목: 값 }` 형태이며 바뀐 항목만 들어 있습니다.

```json
{
  "activityLogId": 2,
  "action": "POINT_RECALL",
  "summary": "50,000P 회수",
  "before": { "cash": 2579040 },
  "after": { "cash": 2529040 },
  "reason": "이벤트 중복 지급분 회수",
  "ipAddress": "203.0.***.***"
}
```

## 에러

| 에러 | 상황 |
|---|---|
| 400 `ADMIN_ACTIVITY_LOG_ACTION_TARGET_MISMATCH` | 작업 대상에서 할 수 없는 수행 작업 |
| 400 `ADMIN_ACTIVITY_LOG_TARGET_TYPE_REQUIRED` | `targetId`만 보내고 `targetType`을 안 보냄 |
| 400 `ADMIN_ACTIVITY_LOG_INVALID_PERIOD` | 시작이 종료보다 같거나 늦음, 366일 초과 |
| 400 `BAD_REQUEST` | 일시 형식 오류(시간대 누락 등), 값 범위 오류 |
| 404 `ADMIN_ACTIVITY_LOG_NOT_FOUND` | 없는 이력 |
| 403 `AUTH_FORBIDDEN` | 관리자가 아님 |

## 백엔드: 이력 남기기

관리자 처리 API를 만들 때는 `AdminActivityLogsModule`을 import하고, 처리와 **같은 트랜잭션**에서 `AdminActivityLogsService.record()`를 호출합니다. 처리가 실패해 롤백되면 이력도 남지 않습니다.

```ts
await this.prisma.$transaction(async (tx) => {
  // ... 상품 거래 중지 처리 ...
  await this.adminActivityLogs.record(
    {
      adminId: admin.userId,
      targetType: AdminActivityTarget.STOCK,
      targetId: stock.id,
      targetLabel: stock.name,
      action: AdminActivityAction.STOCK_PAUSE,
      summary: '거래 가능 → 거래 중지',
      before: { tradeStatus: 'ACTIVE' },
      after: { tradeStatus: 'PAUSED' },
      reason: dto.reason,
      client: clientInfo(request), // src/common/utils/client-info.ts
    },
    tx,
  );
});
```

- `action`은 `targetType`에 맞는 작업이어야 합니다. 맞지 않으면 서버 에러가 납니다(코드 실수).
- `before`·`after`에는 바뀐 항목만 넣습니다. 화면에 그대로 보여 주기 쉬운 값으로 넣어 주세요.
- 접속 IP·User-Agent는 컨트롤러에서 `clientInfo(request)`로 꺼내 넘깁니다.
- 현재 기록을 남기는 곳: 회원 포인트 지급·회수(`PATCH /api/admin/accounts/:userId/cash`)
