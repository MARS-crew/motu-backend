# 상장 신청 보완 요청 조회·재제출 (1차 사용자 기능)

경로는 `/api` 기준이다. [공통 인증·응답](common.md), [신청 상세·상태](listing-applications.md), [파일·링크](files.md)를 함께 참고한다.

## 이번 PR 범위

- MOTU-39-01-02: 사용자가 재제출할 때 보완기한 검사.
- MOTU-39-01-03: 저장 완료된 증빙자료 재제출.
- MOTU-39-01-04: 기존 신청번호·접수일을 유지하면서 검토 중으로 전환.
- MOTU-39-01-05: 본인의 보완 요청·재제출 이력 조회.
- MOTU-39-01-01 관리자 보완 요청 생성, 관리자 이력 조회·기한 연장은 후속 관리자 기능으로 분리한다. 이번 PR에는 해당 API·DTO·생성/연장 서비스가 없다.

## 요구사항과 확정 정책

[1차 개발 IA](https://docs.google.com/spreadsheets/d/18IZuGCG0WY9OYwqpgGDTa3rN43op8eiumYNFRp6DHdY/edit?gid=748545779)와 [화면설계서](https://drive.google.com/file/d/1432WUouwlx6Jp-_mh67lpIPurlO5ja5X) USR-LST-08-02~05의 사용자 조회·증빙 수정·재제출·완료 흐름을 구현한다. 관리자 화면·운영 기능은 별도로 진행한다.

[1차 개발 SRS](https://docs.google.com/spreadsheets/d/1Yyk_KWuRlCEWIedvOdFgjUvsCJL54SwqT4zrGmPuCMA/edit?gid=1313656183)의 이미지/PDF 형식·용량, HTTPS 링크, 합산 최대 10개, 설명 10~500자, 저장 완료 자료 정책을 재사용한다. 사용자와 확인한 추가 정책은 다음과 같다.

- 저장 완료된 파일 또는 링크 최소 1개와 설명이 필요하다.
- 기한 경과 시 재제출을 차단하고 보완 요청 상태를 유지한다. 자동 반려하지 않는다.
- 관리자 기한 연장은 후속 관리자 기능에서 제공한다. 사용자에게 기한 변경 API를 제공하지 않는다.

## 공개 API (모두 로그인 필요)

| 메서드 | 경로 | 내용 |
|---|---|---|
| GET | `/listing-applications/:applicationId/revision-requests?page=1&size=10` | 본인 보완 요청·재제출 이력 |
| POST | `/listing-applications/:applicationId/revision-requests/:revisionId/resubmit` | 증빙 재제출 (성공 200) |

본인 소유·미삭제 신청서만 접근할 수 있다. 관리자 토큰도 타인의 사용자 API 접근을 허용하지 않는다. 타인/없는 신청서/다른 신청서의 회차/삭제된 신청서는 404다.

## 조회

page 기본 1 (1~100000), size 기본 10 (1~50). 최근 회차 ID 내림차순이다. 응답 data는 아래와 같다.

```json
{
  "applicationId": 1,
  "applicationNumber": "LST-261026-001",
  "status": "REVISION_REQUESTED",
  "items": [{
    "id": 3,
    "requestContent": "거래액 집계 근거를 보완해 주세요.",
    "deadline": "2026-11-02T14:59:59.999Z",
    "isDeadlinePassed": false,
    "canResubmit": true,
    "resubmittedAt": null,
    "evidenceCollectionId": null,
    "evidence": null,
    "createDate": "2026-10-26T06:00:00.000Z"
  }],
  "page": 1,
  "size": 10,
  "totalCount": 1
}
```

canResubmit=false면 재제출 버튼을 비활성화한다. 미재제출 회차는 현재 시각이 deadline과 같거나 늦으면 isDeadlinePassed=true다. 이미 기한 내 제출한 과거 회차는 시간이 지나도 기한 초과로 표시하지 않는다. 조회는 상태를 변경하지 않는다. 기존 신청서 상세·상태에서도 최신 reviewComment·revisionDeadline·status를 확인할 수 있다.

## 증빙 저장·재제출

Files API로 본인의 새 EVIDENCE 묶음을 만들고 파일·링크를 등록한다. PUT `/files/collections/:id`에 attachmentIds·description·validateStep=true를 보내 저장한 뒤, 재제출 API에 아래 본문을 전달한다.

```json
{ "evidenceCollectionId": "저장한 증빙 묶음 UUID" }
```

이미지 JPG/JPEG/PNG 각 10MiB 이하, PDF 각 20MiB 이하, 링크는 HTTPS다. 저장 완료된 파일·링크 합산 1~10개, 설명은 공백 제거 후 최소 10자·원문 최대 500자다. 업로드만 하고 PUT 저장하지 않은 항목은 반영하지 않는다.

실제 신청번호·접수일이 있고 REVISION_REQUESTED인 신청서의 해당 미제출 회차에만 허용한다. 신청서 잠금 → 소유자·회차·상태·기한 검사 → FilesService를 통한 묶음 소유자·용도·저장 완료 자료 검사 및 잠금 → 기한 재확인 → 묶음 동결 → 증빙 스냅샷·제출시각 기록 → UNDER_REVIEW 전환을 한 트랜잭션으로 처리한다. 파일 잠금을 기다리다 기한이 지나도 차단하며 실패하면 모두 롤백한다.

성공 data는 `{ applicationId, applicationNumber, status, revision }`이다. revision에 resubmittedAt과 당시 증빙 evidence가 들어간다. draftData의 evidenceCollectionId만 갱신하고 나머지 입력값·신청번호·최초 접수일을 유지한다. 현재 revisionDeadline은 null로 정리하며 원래 요청 내용·기한은 이력에 남는다.

같은 회차·묶음의 재전송은 최초 성공 결과를 반환한다. 완료한 회차에 다른 묶음을 보내면 409다. 예전 회차 재전송은 새 보완 요청 상태를 바꾸지 않는다.

제출한 묶음은 동결하며 업로드·링크 추가·선택/설명 저장·삭제는 FILE_COLLECTION_FROZEN(409)이다. 조회·다운로드는 계속 가능하다. 이후 다른 보완 회차에는 새 묶음을 사용한다.

## 데이터 준비·후속 연동 계약

1차 사용자 기능은 준비된 보완 요청 데이터를 읽는다. 요청 생성·기한 연장을 대신하는 사용자 API나 관리자 우회 경로를 두지 않는다. 운영에서 실제 보완 요청을 생성하는 기능은 후속 관리자 모듈 연결 후 사용할 수 있다.

후속 생산자는 기존 신청서의 실제 신청번호·접수일을 유지하고, 보완 회차의 applicationId·requestedById·requestContent·deadline·previousData와 신청서의 REVISION_REQUESTED·reviewComment·revisionDeadline을 같은 트랜잭션에 기록해야 한다. 미재제출 회차는 신청서당 하나만 허용한다. 공통 요청 이력 모델과 요청자/기한 이력 필드는 이 데이터 계약을 위해 유지하며, 사용자 서비스에서는 요청 생성·기한 갱신을 하지 않는다.

## 로컬 Swagger 테스트

관리자로 로그인하지 않고도 사용자 테스트를 시작할 수 있도록 로컬 전용 준비 명령을 제공한다. 기본 소유자는 motuuser이고 마지막 인자로 다른 로컬 loginId를 지정할 수 있다. 최초 로컬 seed에는 관리자·사용자 계정이 있어야 한다. 관리자 계정 ID는 fixture의 요청자 메타데이터에만 사용한다.

```powershell
# 기한이 남아 있는 보완 요청 + 신청서를 새로 준비
node scripts/prepare-listing-revision-demo.mjs

# 별도의 기한 경과 시나리오 준비
node scripts/prepare-listing-revision-demo.mjs --expired
```

명령은 localhost·비운영 환경만 허용한다. 기존 자료는 수정하지 않고 새 테스트 신청서와 보완 요청을 한 트랜잭션으로 생성한다. 출력의 applicationId·revisionId·applicationNumber를 메모한다. 테스트 데이터 준비는 최종 제출·SMS·관리자 운영 기능을 검증하는 것이 아니다.

motuuser 로그인·Authorize → 본인 보완 GET → Files EVIDENCE 생성·등록·PUT 저장 → 재제출 POST → 기존 번호·UNDER_REVIEW·이력 확인 순서다. `--expired`로 만든 건은 조회에서 canResubmit=false, 재제출에서 410, 상태는 REVISION_REQUESTED 유지가 정상이다. 이 PR에서는 관리자 기한 연장 테스트를 하지 않는다.

## 오류

| 코드 | HTTP | 의미 |
|---|---|---|
| BAD_REQUEST | 400 | UUID·페이지·경로 형식, 서버 전용 필드 전달 |
| LISTING_REVISION_NOT_FOUND | 404 | 신청서/회차 없음·타인·삭제 |
| LISTING_REVISION_INVALID_STATE | 409 | 보완 요청 상태 또는 실제 접수 정보 미충족 |
| LISTING_REVISION_DEADLINE_PASSED | 410 | 기한 경과 |
| LISTING_REVISION_ALREADY_SUBMITTED | 409 | 완료한 회차를 다른 묶음으로 덮어쓰기 |
| LISTING_REVISION_INVALID_EVIDENCE | 400 | 소유자·용도·설명·저장 완료 개수 오류 |
| FILE_COLLECTION_FROZEN | 409 | 제출한 묶음 변경 |

## 검증·배포

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
node scripts/verify-listing-revisions.mjs
```

HTTP 검증은 일회용 로컬 DB에 전체 마이그레이션과 보완 요청 fixture를 준비해 사용자 조회·권한·기한·재제출·동시 요청·동결·롤백을 확인한다. 관리자 경로가 관리자 토큰으로도 404이고 Swagger에도 없음을 검사한다. DB·임시 파일은 정리하며 운영 DB·메일·MinIO는 사용하지 않는다.

`20261026070000_add_listing_revisions`의 공통 이력 테이블·nullable frozenAt·인덱스/제약을 유지한다. 이미 로컬에 적용한 마이그레이션을 다시 쓰거나 DB를 초기화하지 않는다. 운영은 PR 병합·배포 시 기존 Pre-deploy의 npm run db:deploy로 적용한다. 새 환경 변수·Cron 설정은 없다. 알림 발송·최종 제출·SMS·관리자 생성/조회/기한 연장·전체 심사는 후속 범위다.
