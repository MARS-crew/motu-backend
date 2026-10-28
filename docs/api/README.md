# MOTU API 명세서

화면별로 필요한 API와 실패했을 때의 처리 방법을 정리한 문서입니다. 필드 타입과 예시는 Swagger(`/api/docs`)에서 직접 호출해 볼 수 있고, 이 문서는 Swagger만으로는 알기 어려운 **화면 연결, 동작 규칙, 에러 처리**를 중심으로 적습니다.

- 화면 ID는 화면설계서 기준입니다. (인증 화면 USR-AUTH는 `모투화면설계서.pptx`, 나머지는 `[1차 개발]모투화면설계서.pptx`)
## 문서 목록

| 문서 | 내용 | 코드 |
|------|------|------|
| [공통](common.md) | 응답 형식, 인증(로그인 필요·선택·관리자), 토큰 만료·계정 잠김 처리, 페이지네이션, 값 형식, 메일 발송 실패 | `src/common` |
| [인증](auth.md) | 로그인, 토큰 재발급, 로그아웃, 아이디 찾기, 비밀번호 재설정, 인증번호 공통 규칙 | `modules/auth`, `modules/verifications` |
| [회원가입·회원](users.md) | 아이디·닉네임 중복 확인, 가입 이메일 인증, 회원가입, 내 정보 | `modules/users` |
| [계좌·포인트](accounts.md) | 내 계좌, 포인트 이력, 추가 지급, 리셋, 관리자 계좌 관리 | `modules/accounts` |
| [상품](stocks.md) | 카테고리, 상품 목록, 신규 상장, 상품 상세, 최근 본 종목 | `modules/sectors`, `modules/stocks` |
| [검색](search.md) | 상품 검색, 최근 검색어 | `modules/stocks`, `modules/search-histories` |
| [관심상품](wishlists.md) | 관심상품 등록·해제, 관심 상품 목록 | `modules/stocks` |
| [공지사항·FAQ](notices.md) | 공지 목록·상세, 홈 최신 공지, FAQ | `modules/notices`, `modules/faqs` |
| [주문](orders.md) | 거래 규칙, 주문 가능 정보, 매수·매도 주문, 주문 취소, 내 주문, 호가 5단계 | `modules/orders`, `modules/matching` |
| [체결](trades.md) | 최근 체결 | `modules/trades` |
| [포트폴리오](portfolio.md) | 총 자산, 평가손익, 자산 구성, 보유 종목 | `modules/portfolio` |
| [차트·시세](charts.md) | 당일 거래 요약, 기간별 차트, 실시간 시세(SSE) | `modules/charts` |
| [알림](notifications.md) | 내 알림 목록·읽음·미확인 수, 체결·목표가 생성 서비스, 임시저장 만료 안내 | `modules/notifications`, `modules/listing-applications` |
| [상장 신청](listing-applications.md) | 임시저장·작성 중 목록, 단계별 검증·저장, 본인 상세·상태 조회 | `modules/listing-applications` |
| [보완 요청·재제출](listing-revisions.md) | 본인 보완 요청 조회·기한 검사·증빙 재제출 | `modules/listing-applications` |

## 문서 관리

파일 업로드/검증과 외부 링크 API는 [파일·외부 링크](files.md)를 참고합니다.

- 도메인(모듈)마다 문서 하나를 둡니다. 새 도메인을 만들면 문서를 추가하고 위 목록에 넣습니다.
- API를 바꾸는 PR에서는 해당 도메인 문서도 같이 고칩니다.
- 여러 도메인이 같이 쓰는 규칙(응답 형식, 인증, 페이지네이션 등)은 [공통](common.md)에만 적고, 다른 문서에서는 링크로 연결합니다.

## 아직 구현되지 않은 것

| 항목 | 현재 동작 | 예정 |
|------|------|------|
| 상품 목록·상세의 시세 값 (현재가, 전일 대비, 거래량, 거래대금) | 현재가 = 기준가, 나머지 0, 모든 정렬이 최근 상장순 | 상품 API에 반영 (체결 쪽 계산은 완료, [당일 거래 요약](charts.md#당일-거래-요약)과 같은 값) |
| 포인트 리셋: 보유 종목 조건, 거래내역 삭제 | 없음 | 보유·주문 테이블 생성 완료, 리셋에 반영 예정 |
| 체결 알림, 가격 도달 알림 | 없음 | 알림 작업 |
| 새 기기 확인, 2차 보안(SMS) | 없음 | SMS 서비스 확정 후 |
| 공지·FAQ 등록·수정·삭제 (관리자) | 없음, 로컬은 seed로 넣음 | 관리자 화면 작업 때 |
| 회원 탈퇴, 비밀번호 재설정 메일의 화면 주소 | 없음 / 로컬 주소 | 2차 개발 |

