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
| `isImportant` | 중요 공지 여부 (true면 중요 배지) |
| `postDate` | 게시일 |

- 게시 기간 안에 있는 공지만 내려옵니다. 게시 전이거나 게시가 끝난 공지는 목록에서 빠지고, 상세도 404입니다.

## 공지 목록

| 항목 | 내용 |
|------|------|
| 화면 | USR-HOME-01-02 (공지사항 탭) |
| API | `GET /api/notices?page=&size=` |
| 로그인 | 불필요 |
| 페이지 | 페이지 번호 방식. `page` 1부터, `size` 기본 10, 최대 50 |
| 응답 | `items[]`(공지 항목), `page`, `size`, `totalCount` |

- 중요 공지가 맨 위에 오고, 그다음 최근 게시순입니다. 중요 공지는 1페이지부터 채워집니다.
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

- `content`는 줄바꿈(`\n`)이 들어간 텍스트입니다. 줄바꿈을 그대로 보여 주세요.

## 관리자 공지사항

MOTU-26-1-1, MOTU-26-1-2 (이슈 #75). 아래 경로는 관리자 Bearer 토큰이 필요합니다.

| 메서드 | 경로 | 결과 |
|------|------|------|
| GET | `/api/admin/notices?page=1&size=10` | 삭제 전 공지 목록. 예약·게시 중·종료 공지를 모두 조회 |
| GET | `/api/admin/notices/{noticeId}` | 공지 상세와 본문 |
| POST | `/api/admin/notices` | 공지 등록 후 상세 반환 (201) |
| PATCH | `/api/admin/notices/{noticeId}` | 전달한 필드만 변경하고 상세 반환 (200) |
| DELETE | `/api/admin/notices/{noticeId}` | 삭제 시각을 저장하고 관리자·사용자 조회에서 제외 (204) |

관리자 목록은 게시 시작일 내림차순, 같은 시각이면 ID 내림차순입니다. `items`, `page`, `size`, `totalCount`를 반환합니다. `page`는 1~100000, `size`는 1~50입니다. 각 항목에는 게시 기간과 현재 게시 상태(`SCHEDULED`, `PUBLISHED`, `ENDED`)가 들어 있습니다. 상태는 조회 시각과 게시 기간으로 계산합니다.

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

- `type`, `title`, `content`, `postStartDate`는 등록 시 필수입니다. 제목은 공백을 제거한 뒤 1~100자, 본문은 공백을 제거한 뒤 한 글자 이상이어야 합니다. 본문의 줄바꿈은 유지합니다.
- `isImportant`는 상단 고정 여부이며 생략하면 `false`입니다. 게시 일시는 시간대를 포함한 ISO 일시로 보냅니다. 게시 시작은 포함, 종료는 미포함입니다. `postEndDate: null`은 종료일 없는 게시를 뜻하며, PATCH로 전달하면 종료일을 지웁니다.
- 고정 한도는 `ALL`과 `STOCK`을 합쳐 **같은 시각에 게시되는 공지 최대 3개**입니다. 등록·수정할 때 현재부터 미래의 게시 겹침을 확인합니다. 예약 기간이 순차적으로 이어지면 각각의 동시 게시 개수를 기준으로 판단합니다. 공지 삭제, 고정 해제, 기간 종료로 해당 시간의 자리가 비워집니다. 동시 등록·수정에서도 같은 제한을 적용합니다.
- 등록(`NOTICE_PUBLISH`), 수정(`NOTICE_UPDATE`), 삭제(`NOTICE_DELETE`) 이력은 공지 변경과 같은 트랜잭션에 기록합니다. 수정 이력은 바뀐 필드의 이전·이후 값을 저장합니다. [관리자 활동 이력](admin-activity-logs.md)을 참고합니다.

| 응답 | 상황 |
|------|------|
| 400 `BAD_REQUEST` | 요청 타입·필수값·날짜 형식 위반 |
| 400 `NOTICE_INVALID_PERIOD` | 종료가 시작과 같거나 앞섬 |
| 401 / 403 | 로그인 필요 / 관리자 권한 없음 |
| 404 `NOTICE_ADMIN_NOT_FOUND` | 공지가 없거나 삭제됨 |
| 409 `NOTICE_PIN_LIMIT_EXCEEDED` | 같은 시각에 게시되는 고정 공지가 3개를 초과함 |

로컬 Swagger에서 직접 테스트하려면 로컬 DB에 `npm run db:deploy`로 마이그레이션을 적용한 뒤 **Admin - Notices**를 사용합니다. 자동 검증은 `npm run build` 후 `node scripts/verify-admin-notices.mjs`로 실행합니다. 관리자 권한, CRUD, 게시 상태, 현재·예약·동시 고정 한도, 활동 이력과 롤백을 일회용 로컬 PostgreSQL에서 확인합니다.

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
