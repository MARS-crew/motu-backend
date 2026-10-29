# motu-backend
2026 마스외전 하반기 프로젝트 모투

<br>

## Getting Started

### 요구 사항

- Node.js 22 이상
- Docker (로컬 PostgreSQL 실행용)
- npm 11 이상 권장 (npm 10에서는 새 패키지 설치 시 `Cannot read properties of null (reading 'edgesOut')` 에러가 날 수 있습니다. `npm ci`는 문제없습니다.)

### 실행

```bash
npm ci                  # 의존성 설치 (package-lock.json 기준, Prisma Client도 같이 생성)
cp .env.example .env    # 환경 변수 파일 생성 후 값 채우기 (JWT_ACCESS_SECRET은 `openssl rand -base64 32`로 생성)
docker compose up -d    # 로컬 PostgreSQL 실행
npm run db:migrate      # 마이그레이션 적용
npm run db:seed         # 테스트 계정 생성 (아래 표 참고)
npm run start:dev       # 개발 서버 (watch 모드)
```

| 주소 | 설명 |
|------|------|
| `http://localhost:3000/api/health` | 헬스 체크 |
| `http://localhost:3000/api/docs` | Swagger API 문서 |

화면별 API 사용법과 에러 처리는 [API 명세서](docs/api/README.md)에 도메인별로 정리되어 있습니다. API를 바꾸는 PR에서는 해당 도메인 문서도 같이 고쳐 주세요.

### 테스트 계정

`npm run db:seed`로 로컬 DB에 아래 계정이 만들어집니다. 초기 포인트 3,000,000P가 지급된 상태입니다.

| 역할 | 아이디 | 비밀번호 | 닉네임 | 이메일 |
|------|------|------|------|------|
| ADMIN | `motuadmin` | `motuadmin1!` | 모투관리자 | `admin@motu.test` |
| USER | `motuuser` | `motuuser1!` | 모투테스터 | `user@motu.test` |

화면 상태를 확인하는 계정도 같이 만들어집니다. 비밀번호는 모두 `motuuser`와 같습니다.

| 아이디 | 상태 |
|------|------|
| `motureset` | 보유 포인트 250,000P. 바로 포인트 리셋 가능 |
| `motugrant` | 2시간 전에 추가 포인트를 받아 지급 대기 중 |
| `motulocked` | 로그인 5회 실패로 잠김 (`AUTH_ACCOUNT_LOCKED`) |
| `motublocked` | 이용 정지 (`AUTH_ACCOUNT_BLOCKED`) |
| `motudraft` | 임시저장 신청서 5건으로 새 신청서 작성 불가 (`LISTING_DRAFT_LIMIT_EXCEEDED`) |
| `motumaker` / `motutaker` | 시장 조성용. 매일 서로 거래해 시세·차트를 만들고, 현재가 위아래로 미체결 주문을 걸어 호가 5단계를 채움 |

`motuuser`에는 포인트 이력, 관심상품 4개, 최근 본 종목 5개, 최근 검색어 3개, 상장 신청서 7건(임시저장 2건, 그중 1건은 만료 임박, 접수·검토 중·보완 요청·승인·반려 각 1건)이 들어갑니다. 신청서 ID는 seed 실행 결과에 출력됩니다. 이미 기록이 있는 항목은 건너뜁니다.

테스트 거래(`prisma/seed-market.ts`)도 같이 만들어집니다. 거래 가능한 상품 7개(`MOTU0001`~`MOTU0007`)는 상장 다음 날부터 오늘까지 시세·차트·최근 체결이 있고, `MOTU0006`은 오늘 체결이 없습니다. `motuuser`는 보유 종목 7개, 이번 달 체결 12건, 부분 체결 주문(20주 중 8주), 일부 체결 후 취소한 주문, 미체결 매수·매도 주문을 갖습니다. 보유 종목이 있어 `motuuser`는 포인트 리셋이 안 됩니다. `motumaker` 계정이 이미 있으면 건너뜁니다.

- Swagger에서 `POST /api/auth/login`으로 로그인한 뒤, 응답의 `accessToken`을 오른쪽 위 **Authorize**에 넣으면 로그인이 필요한 API를 호출할 수 있습니다.
- 저장소에 공개된 비밀번호라 **로컬 전용**입니다. production(`NODE_ENV=production`)에서는 `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`를 지정하지 않으면 seed가 실행되지 않습니다.

#### 관리자로 포인트 테스트하기

`motuadmin`으로 로그인하면 아래 API로 회원 포인트를 바꿀 수 있습니다. `userId`는 `GET /api/users/me`로 확인합니다.

| API | 설명 |
|------|------|
| `GET /api/admin/accounts/:userId` | 회원 계좌와 마지막 추가 지급·리셋 시각 조회 |
| `GET /api/admin/accounts/:userId/ledgers` | 회원 포인트 변경 이력 조회 |
| `PATCH /api/admin/accounts/:userId/cash` | 포인트 지급/차감 (`{ "amount": -2800000 }`처럼 음수면 차감) |
| `DELETE /api/admin/accounts/:userId/cooldowns/grant` | 추가 지급 24시간 대기시간 초기화 |
| `DELETE /api/admin/accounts/:userId/cooldowns/reset` | 포인트 리셋 7일 대기시간 초기화 |

예) 리셋을 테스트하려면 포인트를 300,000P 미만으로 차감한 뒤 `POST /api/accounts/me/point-reset`을 호출합니다.

### 스크립트

| 명령어 | 설명 |
|------|------|
| `npm run start:dev` | 개발 서버 실행 |
| `npm run build` | 빌드 (`dist/`) |
| `npm run start:prod` | 빌드 결과물 실행 |
| `npm run lint` | oxlint 검사 |
| `npm run format` | Prettier 포맷팅 |
| `npm test` | 단위 테스트 (vitest) |
| `npm run test:e2e` | e2e 테스트 |
| `npm run db:generate` | Prisma Client 생성 (스키마 변경 후) |
| `npm run db:migrate` | 마이그레이션 생성 및 적용 (로컬) |
| `npm run db:deploy` | 마이그레이션 적용 (운영) |
| `npm run db:seed` | 테스트 계정 생성 (이미 있으면 건너뜀) |
| `npm run db:studio` | Prisma Studio (DB 조회 GUI) |

### 폴더 구조

```
prisma/
└── schema.prisma    # DB 스키마, migrations/
src/
├── common/          # 도메인에 종속되지 않는 공통 코드 (filter, interceptor, prisma, type 등)
├── config/          # 환경 변수 검증, Swagger, 로거 설정
├── generated/       # Prisma Client (자동 생성, git 제외)
├── modules/         # 도메인별 모듈
├── app.module.ts
├── setup-app.ts     # 전역 설정 (prefix, CORS, pipe, interceptor, filter)
└── main.ts
```

### 도메인 구조

모든 비즈니스 코드는 `src/modules/<도메인>/` 아래에 도메인 단위로 둡니다. `modules/health`가 기준 예시입니다.

```
modules/users/
├── dto/
│   ├── req/                   # 요청 DTO  create-user-req.dto.ts → CreateUserReqDto
│   └── res/                   # 응답 DTO  user-res.dto.ts        → UserResDto
├── repositories/              # (선택) 커스텀 리포지토리
├── users.controller.ts
├── users.service.ts
├── users.errors.ts            # 도메인 에러 코드 정의
└── users.module.ts
```

- DTO는 항상 `dto/req`, `dto/res`로 나눕니다. 파일은 `<동작>-<대상>-req|res.dto.ts`, 클래스는 `...ReqDto` / `...ResDto`로 짓습니다.
- 다른 도메인의 기능이 필요하면 그 도메인 모듈이 `exports`한 service를 주입받아 씁니다. 다른 도메인의 repository를 직접 쓰지 않습니다.
- 여러 도메인에서 쓰는 코드만 `common/`으로 올립니다.

### 데이터베이스 (Prisma)

- 모델은 `prisma/schema.prisma`에 정의합니다. 바꾼 뒤 `npm run db:migrate`로 마이그레이션을 만들고 함께 커밋합니다.
- `PrismaService`는 전역 모듈이라 import 없이 주입받습니다.

```ts
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findOne(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
```

- Prisma Client 타입은 `src/generated/prisma/client.js`에서 import합니다.

### 로깅

- `nestjs-pino`를 사용합니다. 서비스에서는 Nest 기본 `Logger`를 그대로 쓰면 pino로 출력됩니다.

```ts
private readonly logger = new Logger(UsersService.name);
this.logger.log('회원가입 완료');
```

- development는 읽기 쉬운 한 줄 형식, production은 JSON 형식으로 출력하고, test에서는 출력하지 않습니다.
- 모든 요청에 `x-request-id`를 붙여 같은 요청의 로그를 묶어 볼 수 있습니다. 응답 헤더에도 같은 값이 들어갑니다.
- 헬스 체크 요청은 로그를 남기지 않습니다. 요청 로그에 헤더(토큰 등)는 남기지 않습니다.
- 로그 레벨은 `LOG_LEVEL` 환경 변수로 바꿉니다.

### 인증

- 로그인하면 Access 토큰(JWT, 기본 15분)과 Refresh 토큰(기본 14일)을 받습니다. API는 `Authorization: Bearer <accessToken>` 헤더로 호출합니다.
- Access 토큰이 만료되면 `AUTH_TOKEN_EXPIRED`(401)가 내려옵니다. `POST /api/auth/refresh`로 재발급하고, Refresh 토큰도 응답의 새 값으로 바꿔 저장합니다.
- **모든 API는 기본으로 로그인이 필요합니다.** 로그인 없이 호출해야 하는 API에만 `@Public()`을 붙입니다.
- 토큰이 유효해도 잠긴 회원은 `AUTH_ACCOUNT_LOCKED`(403), 정지된 회원은 `AUTH_ACCOUNT_BLOCKED`(403)로 막힙니다. 회원 상태는 요청마다 DB에서 확인합니다.

```ts
@Public()                         // 로그인 없이 호출 가능
@Get('notices')
findNotices() { ... }

@OptionalAuth()                   // 로그인 없이도 호출 가능, 토큰을 보내면 회원으로 처리
@Get('search')
search(@CurrentUser() user: AuthUser | undefined) { ... }

@Roles(Role.ADMIN)                // 관리자만 호출 가능
@Patch(':id/unlock')
unlock() { ... }

@Get('me')                        // 로그인한 사용자 정보 주입
getMyInfo(@CurrentUser() user: AuthUser) { ... }
```

- `@OptionalAuth()`는 토큰이 없을 때만 비회원(`user`가 undefined)으로 통과합니다. 토큰이 만료되었거나 잘못되었으면 401로 막아서, 프론트가 재발급 후 다시 호출하게 합니다.
- 데코레이터가 붙은 메서드의 매개변수 타입으로 `AuthUser`를 쓸 때는 `import type { AuthUser } from ...`로 가져와야 빌드됩니다.

### 공통 응답 형식

```jsonc
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "NOT_FOUND", "message": "존재하지 않는 사용자입니다." } }

// 추가 정보가 필요한 실패 (예: 로그인 실패 횟수)
{ "success": false, "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "...", "details": { "failCount": 1, "maxFailCount": 5 } } }

// 요청 검증 실패 (details 추가)
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "요청 값이 올바르지 않습니다.", "details": ["email must be an email"] } }
```

- 컨트롤러는 데이터만 반환하면 됩니다. `ResponseInterceptor`가 감싸줍니다.
- 500 에러는 내용을 숨기고 서버 로그에만 남깁니다.

### 에러 코드

비즈니스 에러는 도메인별 `<도메인>.errors.ts`에 모아 정의하고 `BusinessException`으로 던집니다.

```ts
// modules/users/users.errors.ts
export const UserErrors = {
  EMAIL_DUPLICATED: {
    code: 'EMAIL_DUPLICATED',
    message: '이미 가입된 이메일입니다.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;

// 서비스
throw new BusinessException(UserErrors.EMAIL_DUPLICATED);

// 메시지에 값을 넣어야 할 때
throw new BusinessException(
  VerificationErrors.CODE_MISMATCH,
  `${VerificationErrors.CODE_MISMATCH.message} (남은 횟수 ${remaining}회)`,
);
```

- `code`는 프론트가 분기할 때 쓰는 값이라 한 번 정하면 바꾸지 않습니다. 대문자 snake_case로 짓고, 다른 도메인과 겹치지 않도록 도메인 이름을 앞에 붙입니다. (예: `VERIFICATION_EXPIRED`)
- 에러 코드를 문자열로 직접 쓰지 않고 항상 errors 파일에서 가져다 씁니다.
- 입력값 검증 실패(`BAD_REQUEST`)나 없는 경로(`NOT_FOUND`)처럼 도메인과 관계없는 에러는 HTTP 상태 이름이 코드로 내려갑니다.

<br>

## Convention

### 작업 흐름

**이슈 → 브랜치 → 커밋 → PR** 순서로 진행합니다. `main`, `dev` 브랜치에 직접 커밋하지 않습니다.

```
1. 이슈 생성      GitHub Issues에서 템플릿 선택       → #13
2. 브랜치 생성    dev에서 분기                       → feat/#13
3. 커밋          feat: 카카오 로그인 API 추가 (파일별)
4. PR 생성       base: dev, PR 템플릿 작성 후 리뷰 요청
5. 리뷰 후 Merge (1명 이상 승인 권장)
```

<br>

### Type

이슈, 브랜치, 커밋, PR 모두 아래 8개 Type을 공통으로 사용합니다. (커밋·PR 제목·브랜치에는 소문자로 작성)

| Type | 설명 | 예시 |
|------|------|------|
| `Feat` | 새로운 기능 추가 | 소셜 로그인 API 구현 |
| `Fix` | 버그 수정 (긴급 수정 포함) | 이메일 중복 검사 누락 수정 |
| `Refactor` | 기능 변화 없는 코드 개선 (포맷팅, 이름 변경, 파일 삭제 포함) | UserService 도메인별 분리 |
| `Perf` | 성능 개선 | 게시글 조회 N+1 쿼리 해결 |
| `Test` | 테스트 코드 추가 및 수정 | LoginService 단위 테스트 작성 |
| `Docs` | 문서 수정 | README 컨벤션 추가 |
| `Chore` | 의존성, 설정, 초기 세팅 등 기타 작업 | 패키지 의존성 버전 업데이트 |
| `CI` | 빌드·배포 파이프라인 | GitHub Actions 배포 워크플로우 추가 |

> **Refactor vs Perf** — 둘 다 기능은 그대로입니다. 코드를 *읽기 좋게* 바꾸면 Refactor, *빠르게/가볍게* 바꾸면 Perf입니다.

<br>

### 1. 이슈 (Issue)

- `New issue`에서 Type에 맞는 템플릿을 선택합니다.
- 제목: `[Type] 작업 요약` → `[Feat] 카카오 소셜 로그인`
- 본문은 **Overview(필수) / Description / To do**로 작성합니다.

<br>

### 2. 브랜치 (Branch)

- `dev`에서 분기합니다.
- 이름: `<type>/#<이슈번호>` (type은 소문자)

```
feat/#13
fix/#112
refactor/#109
```

| 브랜치 | 역할 |
|--------|------|
| `main` | 배포 브랜치 |
| `dev` | 개발 통합 브랜치, 모든 PR의 base |
| `<type>/#<이슈번호>` | 작업 브랜치, 머지 후 삭제 |

<br>

### 3. 커밋 메시지 (Commit)

```
<type>: 한 줄 설명
```

```
feat: 카카오 로그인 API 추가
fix: 회원가입 이메일 중복 검사 누락 수정
perf: 게시글 목록 조회 N+1 쿼리 해결
```

- type은 위 Type 표의 값을 **소문자**로 작성합니다.
- 설명은 한 줄, 한글로 무엇을 했는지 명확하게 작성합니다.
- **커밋은 파일별로 나눕니다.** 한 커밋에는 한 파일의 변경만 담는 것을 원칙으로 합니다.

<br>

### 4. Pull Request

- **base 브랜치**: `dev`
- **제목**: 커밋 메시지와 같은 형식 → `feat: 카카오 소셜 로그인 구현`
- **본문**: `.github/pull_request_template.md` 양식을 따릅니다.
  - 연관된 이슈 (`closes #13` → 머지 시 이슈 자동 종료)
  - 작업 내용 (`Type | 내용 | 파일` 표)
  - 공유 사항, 체크리스트, 스크린샷, 리뷰 요구사항
- 머지 후 작업 브랜치는 삭제합니다.

**머지 규칙**

- 빠른 개발을 위해 승인 없이도 머지할 수 있습니다.
- 다만 되도록 **팀원 1명 이상의 승인(Approve)을 받은 뒤 머지**하는 것을 원칙으로 합니다.
- 승인 없이 머지한 경우, 팀원에게 공유하고 사후에라도 리뷰를 받습니다.
