# 파일·외부 링크

관련 이슈: #29 / MOTU-35-01-01 ~ MOTU-35-01-05.

요구사항 근거:
- [화면설계서](https://docs.google.com/presentation/d/1432WUouwlx6Jp-_mh67lpIPurlO5ja5X/edit): USR-LST-02 기본 정보, USR-LST-05 증빙 자료 등록(50쪽), USR-LST-08-03 보완 증빙 자료 수정(55쪽).
- [IA](https://docs.google.com/spreadsheets/d/18IZuGCG0WY9OYwqpgGDTa3rN43op8eiumYNFRp6DHdY/edit): Listing > 05, 05-M01/M02, 08-03 및 보완 첨부 모달.
- [SRS](https://docs.google.com/spreadsheets/d/1Yyk_KWuRlCEWIedvOdFgjUvsCJL54SwqT4zrGmPuCMA/edit): No.3 기본 정보 입력, No.6 증빙 및 신청 처리.

## 정책

로그인한 소유자만 조회·변경·다운로드할 수 있다. 타인 자료는 404다.
JPG/JPEG/PNG는 파일당 10MiB(10×1024×1024 bytes), PDF는 20MiB 이하를 허용한다. 확장자, 요청 MIME, 바이트에서 검출한 형식을 대조한다. 로고와 대표 이미지에는 PDF를 허용하지 않는다.
증빙 작성 묶음(EVIDENCE) 1개당 파일과 링크를 **합산 최대 10개**로 제한한다. LOGO/MAIN_IMAGE 묶음은 각각 이미지 1개다. 교체는 기존 자료 삭제 후 업로드한다.
링크는 HTTPS 절대 URL만 허용하며 URL의 아이디/비밀번호는 거부한다. 서버가 링크를 방문하거나 파일을 내려받지는 않는다.
파일 저장소의 쓰기가 성공한 뒤에만 DB 완료 자료와 ID가 만들어진다. 업로드 도중·실패 자료 ID를 프론트가 임의로 저장할 수 없다. 여러 파일 요청은 전체 검증 후 저장하며 DB 반영 실패 시 저장소 객체를 정리한다. 동시 파일/링크 요청은 작성 묶음의 행 잠금으로 직렬화하여 10개 초과를 막는다.

## 화면 연동 순서

모든 경로는 `/api` 기준이며 공통 성공/실패 응답 형식을 따른다. 다운로드만 파일 바이너리를 반환한다.

| 메서드 | 경로 | 요청 / 동작 |
|---|---|---|
| POST | `/files/collections` | `{ "purpose": "EVIDENCE" }`. 작성 묶음 ID 생성. LOGO/MAIN_IMAGE도 가능 |
| GET | `/files/collections/:id` | 완료 자료 목록, saved 여부, 설명 조회 |
| POST | `/files/collections/:id/uploads` | multipart `files` 필드. 한 요청에 최대 10개. 업로드 성공 시 완료 자료 ID 배열 |
| POST | `/files/collections/:id/links` | `{ "url": "https://example.com/proof" }` |
| PUT | `/files/collections/:id` | `{ "attachmentIds": ["완료 UUID"], "description": "최근 12개월 지표 증빙 자료입니다.", "validateStep": true }` |
| DELETE | `/files/collections/:id/attachments/:attachmentId` | 삭제 확인 모달에서 확정한 파일/링크 제거 |
| GET | `/files/collections/:id/attachments/:attachmentId/content` | 소유자 전용 다운로드. Bearer 헤더 필요 |

업로드·링크 등록 결과는 처음에 `saved=false`다. PUT으로 선택한 완료 ID만 `saved=true`가 된다. 임시 저장은 `validateStep=false`(기본값)로 필수 설명 검증 없이 저장한다. 다음 단계는 true로 보내며 EVIDENCE 설명 10~500자를 검증한다. 형식·용량·최대 개수 제한은 임시 저장에서도 항상 적용한다. 빈 attachmentIds는 모두 선택 해제한다. 삭제한 ID를 PUT하면 FILE_NOT_COMPLETED다.

## ERD와 상장 신청 모듈 연결

제공된 ERD의 ListingEvidence는 ListingApplication을 참조하지만, 작업 시작 시 dev에는 두 모델과 신청서 API가 없었다. 신청서 전체를 이 이슈에서 구현하지 않고 `AttachmentCollection`(소유자·용도·설명)과 `Attachment`(완료 파일/링크)로 작성 단위를 분리했다. 임의 applicationId를 받아 소유권 검증 없이 저장하지 않는다.
상장 신청 모듈을 구현할 때 `FilesModule`을 import하고 exports된 `FilesService.getSavedCollection(userId, collectionId)`으로 검증한 자료를 연결해야 한다. 신청서 생성/소유권/제출 상태와의 FK 연결은 아직 없다. 이 함수는 자료 조회이며 신청서 제출이나 2차 보안을 수행하지 않는다. 제출 후 불변 스냅샷이 필요하면 신청서 모듈의 트랜잭션 안에서 연결·상태 잠금을 추가해야 한다.

## 저장소 / Railway 설정

개발 기본값은 FILE_STORAGE_DRIVER=local, `.data/uploads`이며 Git에서 제외한다. 공개 정적 파일 디렉터리로 노출하지 않는다.
운영에서는 S3 호환 저장소(MinIO 등)를 사용한다. FILE_STORAGE_DRIVER=s3, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY를 설정한다. MinIO는 일반적으로 S3_FORCE_PATH_STYLE=true다. 비밀값은 커밋하지 않는다. 버킷은 사전에 만들어져 있어야 한다. 이 코드는 버킷을 자동 생성하거나 공개 권한으로 바꾸지 않는다.
Railway 내부 MinIO API endpoint(콘솔 포트 아님)를 server 서비스 환경 변수로 연결한다. nginx가 있으면 multipart 본문 크기 제한을 업로드 정책에 맞춘다(최대 10×20MiB + multipart 여유분). 클라이언트는 업로드/다운로드 인증 헤더를 전송한다.
Railway 재연결 후 MOTU production을 조회했다. MinIO는 `/data` 영구 볼륨, API 9000 / 콘솔 9001, private endpoint `minio`로 구성되어 있다. Server는 dev를 배포하며 현재 S3 환경 변수는 없다. 다음 값을 Server에 설정할 수 있도록 준비해야 한다(이 작업에서는 운영 설정을 변경하지 않았다).

```dotenv
FILE_STORAGE_DRIVER=s3
S3_ENDPOINT=http://${{MinIO.RAILWAY_PRIVATE_DOMAIN}}:9000
S3_REGION=${{MinIO.MINIO_REGION_NAME}}
S3_FORCE_PATH_STYLE=true
S3_BUCKET=<실제로 생성한 비공개 버킷 이름>
S3_ACCESS_KEY_ID=<해당 버킷 접근 키>
S3_SECRET_ACCESS_KEY=<해당 버킷 비밀 키>
```

Railway OAuth 연결은 자격증명 값을 제공하지 않으므로 MinIO 내부의 버킷 존재 여부와 실제 업로드는 확인하지 않았다. 운영 배포 전 S3 업로드·다운로드·삭제를 확인해야 한다. Server 시작 전에 환경 변수를 준비하고, 배포 시 `npm run db:deploy`로 추가 테이블을 반영한다.

## 실패 처리와 한계

FILE_INVALID_FORMAT(400), FILE_TOO_LARGE(413), FILE_LIMIT_EXCEEDED(400), FILE_INVALID_URL(400), FILE_NOT_COMPLETED(400), FILE_NOT_FOUND(404), FILE_STORAGE_UNAVAILABLE(503)를 처리한다. multipart 파서 자체의 용량/개수/필드 제한은 공통 413/400으로 반환될 수 있다.
삭제는 DB 참조 제거 후 저장소를 정리한다. 정리 실패는 서버에 로그를 남긴다. 프로세스 강제 종료나 정리 실패로 남은 미참조 객체는 별도 저장소 청소 작업이 필요하다. 업로드는 한 요청 최대 200MiB를 메모리로 처리하므로 운영 동시 요청량에 맞게 프록시 제한과 메모리 용량을 설정한다.

## 로컬 확인

`npm ci`, `npm run db:migrate`, `npm run start:dev` 후 Swagger Files 항목을 사용한다. 로그인 → EVIDENCE 묶음 생성 → 업로드/링크 등록 → 반환 ID로 PUT 저장 → 목록/다운로드/삭제 순서다. 기존 개발 DB에 추가 테이블만 만드는 마이그레이션을 포함한다.

`npm run build` 후 `node scripts/verify-files.mjs`로 로컬 PostgreSQL·HTTP 통합 검증을 재현할 수 있다. localhost DB만 허용하고 테스트용 서버(3089)를 실행한다. README의 로컬 seed 계정을 사용하고, 자신이 만든 자료/작성 묶음과 로그인 세션을 정리한다. 운영 DB나 운영 저장소에 이 스크립트를 사용하지 않는다.

## 실제 MinIO 저장소 연결 검사

로컬 `.env`의 S3_ENDPOINT는 PC에서 접근 가능한 HTTPS S3 API 주소여야 한다. Railway의 `.railway.internal` 주소와 `${{...}}` 참조 구문은 로컬에서 해석되지 않는다. MinIO 서비스의 공개 도메인이 필요하다면 대상 포트를 9000으로 지정한다. 콘솔 포트 9001은 이 검사에 사용하지 않는다.

`.env`에 S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE=true를 설정한다. 기존 MinIO 관리자 자격증명은 버킷 초기 생성에 사용할 수 있고, 서비스 운영에는 버킷 전용 접근 키 사용을 권장한다. 비밀값은 채팅이나 커밋에 포함하지 않는다.

- `node scripts/verify-s3-storage.mjs --create-bucket`: 버킷이 없으면 생성하고 테스트 PNG 쓰기·읽기·바이트 일치·삭제를 검사한다. 다른 버킷과 기존 객체는 수정하지 않는다. 생성된 버킷은 유지한다.
- `node scripts/verify-s3-storage.mjs`: 이미 생성된 버킷에서 같은 검사를 수행한다.

이 검사는 실제 저장소를 사용한다. FILE_STORAGE_DRIVER 값과 관계없이 S3에 접속한다. 다음 단계로 로컬 서버를 FILE_STORAGE_DRIVER=s3로 재시작하고 Swagger Files API에서 업로드해야 백엔드 전체 경로까지 확인된다. `verify-files.mjs`는 여전히 로컬 파일 저장소 전용이다.
