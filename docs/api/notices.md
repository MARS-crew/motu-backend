# 공지사항·FAQ

[← API 명세서 목차](README.md)

사용자 공지·FAQ는 로그인 없이 조회할 수 있습니다. 공지 등록·수정·삭제는 관리자 API를 사용합니다. 로컬에서는 seed(`npm run db:seed`)로도 테스트 데이터를 넣을 수 있습니다.

## 공지 항목 (공통)

공지 목록, 최신 공지, 공지 상세가 모두 이 필드를 갖습니다.

| 필드 | 설명 |
|------|------|
| `noticeId` | 공지 ID |
| `type` | `ALL` 전체 서비스 공지 / `STOCK` 상품 공지 |
| `title` | 제목 |
| `stockName` | 상품별 공지의 대상 상품명. 전체 서비스 공지면 `null` |
| `isImportant` | 중요 공지 여부 (true면 중요 배지) |
| `postDate` | 게시일 |

- 게시 상태이고 게시 기간 안에 있는 공지만 조회할 수 있습니다. 상품별 공지는 대상 상품도 공개 상태여야 합니다.

## 공지 목록

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01-02 (공지사항 탭) |
| API | `GET /api/notices?page=&size=&stockId=` |
| 로그인 | 불필요 |
| 페이지 | 페이지 번호 방식. `page` 1부터, `size` 기본 10, 최대 50 |
| 응답 | `items[]`(공지 항목), `page`, `size`, `totalCount` |

- 중요 공지가 맨 위에 오고, 그다음 최근 게시순입니다. 중요 공지는 1페이지부터 채워집니다.
- `stockId`를 생략하면 서비스·상품 공지를 모두 조회합니다. 상품 상세의 공지 영역에서는 `GET /api/notices?stockId={상품 ID}`로 해당 상품의 게시 중 공지만 조회합니다.
- 전체 페이지 수는 `Math.ceil(totalCount / size)`로 계산합니다.
- `totalCount`가 0이면 "등록된 공지가 없습니다." 화면을 보여 줍니다.

## 최신 공지 (홈)

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01 (공지 영역) |
| API | `GET /api/notices/latest` |
| 로그인 | 불필요 |
| 응답 | `notice`(공지 항목). 게시 중인 공지가 없으면 `null` |

- 중요 공지 여부와 상관없이 가장 최근에 게시된 공지 하나입니다.
- 누르면 공지사항 및 FAQ 화면으로 이동합니다.

## 공지 상세

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01-02 (공지 상세) |
| API | `GET /api/notices/:noticeId` |
| 로그인 | 불필요 |
| 응답 | 공지 항목 + `content`(내용) |

| 에러 | 상황 | 화면 처리 |
|------|------|------|
| 404 `NOTICE_NOT_FOUND` | 없거나 게시 기간이 아닌 공지 | `message` 표시 후 목록으로 이동 |
| 400 `BAD_REQUEST` | `noticeId`가 숫자가 아님 | |

- `content`의 줄바꿈을 그대로 표시합니다. 사용자 응답에는 상품 ID와 상품 코드 없이 이름을 반환합니다.

## 관리자 공지사항

MOTU-26-1-1, MOTU-26-1-2 (이슈 #75). 아래 경로는 관리자 Bearer 토큰이 필요합니다.

| 메서드 | 경로 | 결과 |
|------|------|------|
| GET | `/api/admin/notices` | 관리자 공지 검색·필터·페이징 |
| GET | `/api/admin/notices/{noticeId}` | 공지 상세와 본문 |
| POST | `/api/admin/notices` | 임시 저장 또는 즉시·예약 게시 후 상세 반환 (201) |
| PATCH | `/api/admin/notices/{noticeId}` | 전달한 필드를 수정하고 저장 상태를 유지 (200) |
| POST | `/api/admin/notices/{noticeId}/publish` | 임시 저장·비공개 공지 게시 또는 게시 기간 변경 (200) |
| POST | `/api/admin/notices/{noticeId}/hide` | 처리 사유를 저장하고 즉시 비공개 (200) |
| POST | `/api/admin/notices/{noticeId}/delete` | 처리 사유와 삭제 시각을 기록 (204) |

목록은 게시 시작일 내림차순이며 시작일이 없는 공지는 맨 뒤에 나옵니다. 시작일이 같으면 ID 내림차순입니다. 응답은 `items`, `page`, `size`, `totalCount`입니다. `page`는 1~100000(기본 1), `size`는 1~50(기본 10)입니다.

| 목록 쿼리 | 적용 기준 |
|---|---|
| `keyword` | 공지 제목 부분 일치(대소문자 무시) 또는 숫자 공지 ID 정확히 일치 |
| `type`, `stockId` | `ALL` 전체 서비스 / `STOCK` 상품별. 선택한 대상 상품 ID로 추가 필터링 |
| `status` | `DRAFT` 임시 저장, `SCHEDULED` 예약, `PUBLISHED` 게시 중, `ENDED` 종료, `HIDDEN` 비공개, `DELETED` 삭제. 생략하면 삭제된 공지를 제외하고 조회 |
| `from`, `to` | 지정 구간과 게시 기간이 겹치는 공지를 조회. 시간대를 포함한 일시이며 시작 포함·종료 미포함. 시작일이 없는 공지는 기간 필터에서 제외 |

관리자 목록·상세에는 `stockId`, `stockCode`, `stockName`을 반환합니다. 전체 서비스 공지는 모두 `null`입니다. 게시 상태의 공지는 날짜에 따라 예약·게시 중·종료로 표시됩니다.

다음은 등록 요청 예시입니다.

```json
{
  "type": "ALL",
  "title": "서비스 점검 안내",
  "content": "서비스 점검 일정을 안내드립니다.",
  "isImportant": true,
  "postStartDate": "2026-11-16T09:00:00+09:00",
  "postEndDate": "2026-11-18T09:00:00+09:00"
}
```

- 등록할 때 `status: "DRAFT"`를 보내면 미완성 상태로 임시 저장됩니다. 상태를 생략하거나 `POSTED`를 보내면 게시합니다. 게시하기 전에 `type`, 제목(공백 제거 후 1~100자), 본문과 게시 시작일을 채웁니다. 상품별은 유효한 `stockId`가 필요하고, 전체 서비스 공지는 상품 ID를 비워 둡니다.
- `publish`는 저장한 값으로 게시하려면 `{}`를 보내고, 게시 기간 등을 함께 바꾸려면 그 필드를 보냅니다. 종료 시각이 지난 공지는 종료 시각을 바꾸거나 `postEndDate: null`로 해제한 뒤 게시합니다. 게시 일시는 시간대를 포함한 ISO 일시로 보내며 게시 시작은 포함, 종료는 미포함입니다.
- 고정 한도는 전체·상품별 공지의 게시 중·예약을 합쳐 **같은 시각에 최대 3개**입니다. 임시 저장, 비공개, 종료, 삭제 공지는 한도에서 제외합니다. 등록·수정·게시가 동시에 들어와도 동일한 한도가 적용됩니다.
- 비공개·삭제 요청 본문에 `{ "reason": "처리 사유" }`를 보냅니다. 앞뒤 공백을 제거한 뒤 1~200자여야 합니다. 비공개는 다시 게시할 수 있습니다. 삭제된 공지는 관리자 목록의 `status=DELETED` 필터와 활동 이력에서 확인할 수 있습니다.
- 공지 변경과 활동 이력은 같은 트랜잭션에 저장합니다. 게시·예약·다시 게시(`NOTICE_PUBLISH`), 임시 저장·수정(`NOTICE_UPDATE`), 비공개(`NOTICE_HIDE`), 삭제(`NOTICE_DELETE`)를 기록하며 비공개·삭제는 사유도 저장합니다. [관리자 활동 이력](admin-activity-logs.md)을 참고합니다.

| 응답 | 상황 |
|------|------|
| 400 `BAD_REQUEST` | 요청 타입·필수값·날짜 형식 위반 |
| 400 `NOTICE_INVALID_PERIOD` | 종료가 시작과 같거나 앞섬 |
| 400 `NOTICE_REQUIRED_FIELDS` / `NOTICE_INVALID_TARGET` | 게시 필수 항목 또는 대상 상품 조건 위반 |
| 400 `NOTICE_PUBLISH_PERIOD_ENDED` | 게시 종료가 현재와 같거나 앞섬 |
| 401 / 403 | 로그인 필요 / 관리자 권한 없음 |
| 404 `NOTICE_ADMIN_NOT_FOUND` | 공지가 없거나 삭제됨 |
| 404 `NOTICE_STOCK_NOT_FOUND` | 대상 상품이 없거나 삭제됨 |
| 409 `NOTICE_INVALID_STATUS` | 임시 저장 공지에 비공개 요청 |
| 409 `NOTICE_PIN_LIMIT_EXCEEDED` | 같은 시각에 게시되는 고정 공지가 3개를 초과함 |

마이그레이션은 대상 상품을 알 수 없는 기존 상품별 공지를 임시 저장으로 옮깁니다. 관리자 목록에서 대상을 지정한 뒤 다시 게시할 수 있습니다. 기존 전체 공지는 원래 기간으로 게시됩니다.

로컬 Swagger에서 직접 테스트하려면 로컬 DB에 `npm run db:deploy`를 실행한 뒤 **Admin - Notices**를 사용합니다. 자동 검증은 `npm run build` 후 `node scripts/verify-admin-notices.mjs`로 실행합니다.

## FAQ 목록

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01-03 (FAQ 탭) |
| API | `GET /api/faqs?category=` |
| 로그인 | 불필요 |
| 요청 | `category` (기본 `ALL` 전체) |
| 응답 | `items[] { faqId, category, question, answer }` — 노출 순서대로 |

| 필터 | `category` |
|------|------|
| 전체 | `ALL` (비워도 전체) |
| 거래/주문 | `TRADE` |
| 포인트/자산 | `POINT` |
| 계정/보안 | `ACCOUNT` |
| 상장 | `LISTING` |
| 기타 | `ETC` |

- 건수가 적어 페이지 없이 한 번에 내려줍니다.
- 답변은 응답에 같이 들어 있어서, 질문을 펼치고 접는 것은 프론트에서 처리합니다.
- `answer`도 줄바꿈(`\n`)이 들어간 텍스트입니다.
- 없는 `category` 값이면 400 `BAD_REQUEST`입니다.
