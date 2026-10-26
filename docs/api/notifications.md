# 알림

모든 경로는 `/api` 기준이며 로그인이 필요하다. 공통 응답·인증 오류는 [공통 규칙](common.md)을 따른다.

## 기준과 범위

- [1차 개발 IA](https://docs.google.com/spreadsheets/d/18IZuGCG0WY9OYwqpgGDTa3rN43op8eiumYNFRp6DHdY/edit?gid=748545779) `[1차 개발] 사용자 IA`의 Home → 알림 내역.
- [1차 개발 SRS](https://docs.google.com/spreadsheets/d/1Yyk_KWuRlCEWIedvOdFgjUvsCJL54SwqT4zrGmPuCMA/edit?gid=1313656183) `[1차 개발] 요구사항 정의서` 29행: 체결·지정가 알림 최신순, 미확인 선택 시 읽음, 설정 가격 최초 도달 1회.
- [1차 개발 화면설계서](https://drive.google.com/file/d/1432WUouwlx6Jp-_mh67lpIPurlO5ja5X): USR-HOME-01-04, USR-MARKET-02-M01, USR-LST-01-01 / USR-LST-08-01 (90일 만료, 7일 전 안내).
- MOTU-30-02-02와 MOTU-14-01-01~04. 앱 내 알림 저장·조회 기능이다. 푸시·SMS·이메일·WebSocket 발송은 포함하지 않으며, 회원의 푸시 수신 설정과 별도로 앱 내 이력은 보존한다.
- 이 작업 기준 dev에는 주문 체결·목표가 설정/감지 모델과 서비스가 없다. 알림 생산 서비스는 구현·검증하지만, 실제 이벤트 호출 연결은 각 담당자가 진행한다. 주문 매칭은 #28과 연계한다. 가격 조회를 주기적으로 호출해 가짜 체결/도달 이벤트를 만들지 않는다.

## API

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/notifications?page=1&size=20` | 내 알림 목록 |
| GET | `/notifications/unread-count` | 내 전체 미확인 수 |
| PATCH | `/notifications/:notificationId/read` | 선택한 내 알림을 읽음으로 변경 (본문 없음) |

### 목록과 카운트

`page` 기본 1 (1~100000), `size` 기본 20 (1~50). 발생 시각 내림차순, 같은 시각이면 ID 내림차순이다. 페이지 이동 사이에 새 알림이 생기면 위치가 달라질 수 있으므로 목록을 새로 고친다. `totalCount`는 본인 전체 알림 수이며 현재 페이지 크기와 관계없다. 목록 조회 자체는 읽음 처리하지 않는다.

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 1,
      "type": "ORDER",
      "content": "PLI·20주·매수 주문이 체결되었습니다.",
      "payload": { "tradeId": "31", "orderId": "12", "stockId": 1, "stockName": "PLI", "side": "BUY", "quantity": "20", "price": "4350" },
      "isRead": false,
      "readAt": null,
      "createDate": "2026-10-26T04:00:00.000Z"
    }],
    "page": 1,
    "size": 20,
    "totalCount": 1
  }
}
```

`createDate`는 생산자가 전달한 이벤트 발생 시각이다. `ORDER`는 체결, `PRICE`는 목표가 도달, `LISTING_DRAFT_EXPIRING`은 임시저장 만료 예정 안내다. 외부 링크 대신 `stockId`나 `applicationId`로 화면을 연결한다. 가격·수량·거래/주문 ID는 큰 정수의 정밀도를 잃지 않도록 문자열로 전달한다.

카운트 응답은 `data: { "unreadCount": 1 }`이다. 0이면 아이콘의 미확인 표시를 없앤다. 목록이 비어 있으면 `items: []`, `totalCount: 0`이며 화면에 “알림이 없습니다”를 표시한다.

### 읽음

미확인 알림을 선택하면 해당 ID로 PATCH를 호출한다. 성공하면 목록의 항목과 같은 필드를 반환하며 `isRead: true`, `readAt`에 최초 읽음 시각이 들어간다. 재시도와 동시 호출에도 최초 시각을 유지한다. 이후 카운트를 다시 조회해 아이콘을 갱신한다. 다른 미확인 알림이 남아 있으면 배지를 유지한다. 타인 알림·없는 ID는 모두 `NOTIFICATION_NOT_FOUND`(404)다.

## 이벤트 생산자 연결 계약

생산자 모듈에서 `NotificationsModule`을 imports하고 exports된 `NotificationsService`를 주입한다. 알림 생성 REST API는 제공하지 않는다. 요청자가 임의의 체결 알림을 만들 수 없다.

### 주문 체결 담당자 (#28)

확정한 **체결·자산 정산과 같은 DB 트랜잭션**에서 아래 메서드를 호출한다. 매수자·매도자 각각 해당 회원 ID와 주문 ID로 호출한다. 가격·수량은 이번 체결분이며, 부분 체결마다 다른 tradeId를 사용한다. 요청 접수나 미체결 주문 생성 시에는 호출하지 않는다.

```ts
await this.notifications.createOrderFilled({
  userId: buyerUserId,
  tradeId: trade.id.toString(),
  orderId: buyOrder.id.toString(),
  stockId: stock.id,
  stockName: stock.name,
  side: 'BUY', // 매도자는 SELL
  quantity: trade.quantity.toString(),
  price: trade.price.toString(),
  occurredAt: trade.createDate,
}, tx);
```

### 목표가 담당자

목표가가 0P 초과인지, 도달 조건(이상/이하 등)이 충족됐는지, 설정이 유효한지, 취소되지 않았는지는 생산자가 확인한다. `alertId`는 설정 ID, `revision`은 **설정/수정 시 발급하는 버전 ID**다. 감지·재시도마다 새 revision을 만들면 안 된다. 수정 또는 해제 후 재설정 시에는 새 버전을 사용한다. 같은 설정 버전은 첫 도달 한 번만 저장한다.

```ts
await this.notifications.createTargetPriceReached({
  userId: alert.userId,
  alertId: alert.id.toString(),
  revision: alert.version.toString(),
  stockId: stock.id,
  stockName: stock.name,
  targetPrice: alert.targetPrice.toString(),
  reachedPrice: currentPrice.toString(),
  occurredAt: reachedAt,
}, tx);
```

목표가 설정의 소진/비활성 변경과 알림 생성을 **같은 트랜잭션**에서 처리한다. 한 설정을 동시에 수정/해제/감지하는 경합은 생산자에서 행 잠금 또는 버전 조건부 갱신으로 제어한다. 대상가격 설정·수정·해제 API, 시세 감지와 조건 판정은 이번 범위에 포함하지 않는다.

두 메서드는 `{ notification, created }`를 반환한다. ID·revision은 1~64자의 영문/숫자/`_`/`-`, 금액·수량은 양의 정수 문자열(최대 PostgreSQL bigint), 상품명은 1~30자, 날짜는 유효한 Date다. 잘못된 이벤트는 `NOTIFICATION_INVALID_EVENT`로 거절한다. DB 실패는 숨기지 않고 생산자에 전달하므로 트랜잭션을 롤백하고 안정된 키로 재시도한다.

DB UNIQUE `(userId, type, eventKey)`와 `ON CONFLICT DO NOTHING`으로 동시 재시도를 막는다. 체결은 tradeId+orderId, 목표가는 alertId+revision으로 식별한다. 중복 전송 시 기존 내용·발생 시각·읽음 상태를 덮어쓰지 않는다. tx를 생략하면 알림만 별도 트랜잭션으로 저장하므로, 체결 정산/설정 소진에는 반드시 tx를 전달한다.

## 임시저장 만료 안내 배치

- 기존 `ListingDraftExpirationService`가 서버 시작 시와 15분마다 안내 생성 후 기존 만료 처리를 실행한다. Railway에 별도의 Cron 서비스나 새 환경 변수는 필요 없다. 서버가 실행 중이어야 주기 작업이 동작한다.
- 현재 시각 < expiresAt ≤ 현재 시각+7일이며 DRAFT·미삭제인 신청서만 대상이다. 서버 중단 후에는 아직 만료 전인 7일 이내 신청서를 재개 시 안내한다. 이미 만료된 건에는 늦은 경고를 생성하지 않는다.
- 100건씩 ID 순서로 조회하고, 저장/삭제와 같은 회원 잠금을 잡은 다음 최신 상태·만료일을 다시 확인한다. 연장·삭제·제출된 신청서의 오래된 후보는 제외한다.
- 신청 ID+만료일로 1회만 생성한다. 여러 서버·재배포·재시작에도 중복되지 않는다. 다시 저장하면 만료가 90일로 연장되고, 나중에 새 만료일의 7일 이내가 되면 새 안내를 생성할 수 있다.
- 과거 안내는 이력으로 보존하며 문구·payload.expiresAt은 당시 만료일 스냅샷이다. 선택 시 `GET /listing-applications/:id/status`로 최신 상태를 확인한다. 안내만 보고 현재도 만료 예정이라고 판단하지 않는다.
- 알림 한 건 실패는 로그를 남기고 다음 후보를 진행하며, 알림 조회 실패도 기존 EXPIRED 전환을 막지 않는다. 실패한 안내는 다음 주기에 재시도한다. 물리 파일 삭제는 하지 않는다.

## 검증과 배포

```powershell
npm run lint
npm test
npm run build
node scripts/verify-notifications.mjs
```

HTTP 검증은 localhost PostgreSQL에 임의 이름의 일회용 DB를 생성해 모든 마이그레이션을 적용하고, 전용 계정·이벤트로 실행한 뒤 DB를 삭제한다. 로컬 DB 계정에 데이터베이스 생성 권한이 필요하다. 실제 API 인증/한글 검증/소유권/읽음·카운트/페이지, 체결·목표가 동시 재시도와 롤백, D-7 제외 조건·저장 경합·103건 배치 순회를 검사한다. 운영 DB·메일·MinIO는 사용하지 않는다.

운영 적용 시 새 `add_notifications` 마이그레이션이 필요하다. 현재 Railway Server의 `npm run db:deploy` Pre-deploy 설정을 통해, PR 병합 후 해당 코드가 배포될 때 적용한다. 로컬 검증 완료가 운영 배포 완료를 의미하지 않는다. 실제 주문·목표가 발생 검증은 생산자 연결 후 각 담당자와 진행한다.
