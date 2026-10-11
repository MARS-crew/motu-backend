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
cp .env.example .env    # 환경 변수 파일 생성 후 값 채우기
docker compose up -d    # 로컬 PostgreSQL 실행
npm run db:migrate      # 마이그레이션 적용
npm run start:dev       # 개발 서버 (watch 모드)
```

| 주소 | 설명 |
|------|------|
| `http://localhost:3000/api/health` | 헬스 체크 |
| `http://localhost:3000/api/docs` | Swagger API 문서 |

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

### 공통 응답 형식

```jsonc
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "NOT_FOUND", "message": "존재하지 않는 사용자입니다." } }

// 요청 검증 실패 (details 추가)
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "요청 값이 올바르지 않습니다.", "details": ["email must be an email"] } }
```

- 컨트롤러는 데이터만 반환하면 됩니다. `ResponseInterceptor`가 감싸줍니다.
- 비즈니스 에러 코드는 `throw new NotFoundException({ code: 'USER_NOT_FOUND', message: '...' })`처럼 던집니다.
- 500 에러는 내용을 숨기고 서버 로그에만 남깁니다.

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
