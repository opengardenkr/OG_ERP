# Preview Google 로그인 — 이슈 #3

Production 설정은 그대로 두고, 통합 업데이트 브랜치에서만 새 Google OAuth 클라이언트를 사용한다.
코드 수정 PR의 대상은 `feature/erp-update-20261025`다. `main`으로 병합하거나 Production으로 승격하지 않는다.

## 사용할 주소는 하나

PR #1의 Vercel 봇 댓글에서 확인한 **브랜치 고정 주소**:

https://og-erp-git-feature-erp-update-20261025-opengarden.vercel.app

Google에 등록할 **승인된 리디렉션 URI 하나**:

```
https://og-erp-git-feature-erp-update-20261025-opengarden.vercel.app/api/auth/callback/google
```

브랜치 주소는 같은 브랜치의 최신 배포를 가리킨다. 배포마다 바뀌는 커밋별 주소,
PR #2의 `fix-erp-integration-build-login` 주소, 이번 수정 PR의 임시 주소는 로그인 테스트에 사용하지 않는다.
Vercel 프로젝트·팀·도메인이 바뀌면 Deployments에서 `feature/erp-update-20261025` 배포의
Domains에 위 주소가 있는지 확인한다. 별도의 테스트 도메인을 쓰기로 결정한 경우에도 이 브랜치에만 연결하고,
그 주소 하나의 `/api/auth/callback/google`을 등록한다. 와일드카드는 쓰지 않는다.

## 소유자가 할 설정 — 한 번만

수정 PR이 **feature 브랜치에 반영된 Preview**에서 테스트한다. 이 문서는 PR 병합을 자동 수행하지 않는다.

1. Google Cloud → Google Auth Platform → Clients(또는 API 및 서비스 → 사용자 인증 정보)에서
   이미 만든 **새 테스트 클라이언트**를 연다. 유형이 **웹 애플리케이션(Web application)**인지 확인한다.
   기존 운영 클라이언트를 수정하지 않는다. 새 클라이언트의 **승인된 리디렉션 URI**에 위 주소를 한 번 등록하고 저장한다.
   자바스크립트 원본 입력란이 아니다. 끝에 `/`를 덧붙이지 않는다.
2. Vercel → `og-erp` → Settings → Environment Variables에서 **새 변수 두 개**를 추가한다.
   각각 **Preview만** 선택하고 **Git Branch를 `feature/erp-update-20261025`로 제한**한다.

   | 새 이름 | 사용자가 비공개 입력란에 직접 붙여넣을 값 |
   |---|---|
   | `OG_PREVIEW_GOOGLE_CLIENT_ID` | 새 테스트 클라이언트의 Client ID |
   | `OG_PREVIEW_GOOGLE_CLIENT_SECRET` | 같은 클라이언트의 Client Secret |

   기존 `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_URL` 행은 열거나 수정하지 않는다.
   기존 Production+Preview 체크를 해제하지 않는다. 새 변수에 Production 또는 Development를 선택하지 않는다.
   Branch 제한이 불분명하면 저장하지 말고 대상 브랜치를 먼저 확인한다. 값은 채팅·이슈·PR·스크린샷에 올리지 않는다.
3. 설정 저장 후 해당 **feature 브랜치의 Preview만 Redeploy**한다(또는 설정 저장 뒤 그 브랜치에 코드가 반영되어
   새 Preview가 자동 생성되면 그것을 사용한다). 환경변수는 기존 배포에 소급 적용되지 않는다.
   Production 배포의 Redeploy/Promote 버튼은 사용하지 않는다.
4. 위 고정 주소에서 회사 계정으로 로그인한다. 이전 클라이언트의 세션이 있다면 이 Preview에서만 로그아웃 후
   다시 로그인한다. 운영 사이트 세션이나 공용 `AUTH_SECRET`을 변경할 필요가 없다.

코드는 `VERCEL_ENV === "preview"`일 때만 새 두 변수를 선택한다. Production·로컬은 기존 변수를 사용한다.
토큰 갱신도 로그인에 사용한 것과 동일한 선택 결과를 쓴다. Preview 키 하나라도 누락/공백이면 Google provider를
등록하지 않고, 로그인 버튼을 비활성화하며 화면과 서버 로그에 설정 누락을 알린다. 운영 키로 대신 로그인하지 않는다.
로그에는 변수 이름만 나오고 키 값은 나오지 않는다. 도메인·이메일 검증과 구성원 목록은 기존 그대로다.

## 실패하면 이 순서로 한 번 비교

- 이슈의 기존 오류는 **PR #2 임시 주소**를 `redirect_uri`로 보낸 `redirect_uri_mismatch`다.
  이는 로그인 후 복귀 경로와 별개로, Google에서 승인한 callback 주소가 일치하지 않은 문제다.
- 먼저 현재 브라우저 주소가 위 **feature 브랜치 고정 주소**인지 확인한다.
- “Preview Google 로그인이 설정되지 않았습니다”가 보이면 새 두 변수의 Preview/브랜치 범위와
  설정 저장 후 Preview가 새로 배포되었는지만 확인한다. 기존 운영 변수의 범위는 바꾸지 않는다.
- Google 오류 화면의 요청 세부정보 또는 브라우저 Network의 Google authorize 요청에서
  `redirect_uri`를 URL 디코딩하여 위 한 줄과 **완전히 일치**하는지 확인한다.
- 같은 요청의 `client_id`는 **본인 화면에서만** 새 Google 클라이언트의 ID와 비교한다.
  ID나 Secret, 쿠키, OAuth code/state, 전체 인증 URL은 복사·공유하지 않는다.
  ID가 운영 클라이언트와 같으면 새 코드가 배포되지 않았거나 잘못된 배포 주소에 접속한 것이다.
- ID는 새 클라이언트이고 URI도 맞으면, 그 **동일한 클라이언트**의 승인된 리디렉션 URI에 위 주소가
  저장되어 있는지 확인한다. 다른 클라이언트에 등록한 URI는 적용되지 않는다.
- `AccessDenied`이면 회사 도메인, 확인된 이메일, `src/config/users.ts`의 기존 두 구성원인지 확인한다.
  allowlist나 `ALLOWED_HD`를 완화하지 않는다. `invalid_client`이면 새 ID/Secret이 같은 웹 클라이언트의
  쌍인지 소유자가 직접 확인한다. 토큰 갱신 `invalid_grant`는 Preview 로그아웃/재로그인 후 확인한다.

현재 연결에는 Vercel 설정 관리 및 Google Cloud 자격증명 접근 권한이 없다.
새 ID/Secret과 현재 배포의 실제 요청이 일치하는지는 소유자의 비공개 비교가 필요하며,
코드/CI 통과만으로 실제 Google 로그인이 성공했다고 볼 수 없다.

## 로그인 뒤 확인 순서 — 실제 업무 데이터 쓰기 금지

1. 위 고정 Preview에 로그인 → 대시보드 → 새로고침 후 세션 유지. 본인 이름과 캘린더 조회 확인.
   오래 열린 세션의 캘린더 조회로 토큰 갱신을 확인하되 실패 시 Preview만 다시 로그인한다.
2. 카탈로그에서 선택한 링크를 이 Preview의 제안서/카탈로그 연결 화면으로 열어 품목·수량 확인.
   로그아웃 상태에서 같은 링크를 열었다면 로그인 후 선택 정보가 유지되는지도 확인한다.
   발행/저장/전송은 누르지 않는다.
3. 영업 지도에서 목록·검색·탭·핀 표시 확인. 지도 API가 이 Preview 도메인을 허용하지 않으면
   별도 미검증 항목으로 남기고 운영 지도 설정을 수정하지 않는다.
4. 업데이트 확인 버튼·실패 안내 확인. 할 일 상세 입력을 바꾸기만 하고 저장하지 않은 상태에서
   새 버전 알림이 있을 때 새로고침이 차단되는지 확인한다. 테스트 후 입력을 취소한다.
   실제 버전 변경이 없으면 새 버전 알림 경로는 미검증으로 남긴다.
5. 기존 할 일·프로그램·캘린더를 조회하고 Preview에서 로그아웃한다. Airtable 기록·댓글·상태 및
   Google 일정을 생성/수정하지 않는다.

## 자동 검증

`npm ci`, `node --experimental-strip-types --test tests/*.test.mjs`,
`npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm run build`.
테스트는 가짜 키와 모의 토큰 응답만 사용하며 Google/Airtable에 업무 요청을 보내지 않는다.
Preview/Production/개발 환경 선택, 누락 시 provider 차단, 로그인·refresh의 동일 키 사용,
회원 정책, 만료/갱신 실패, 기존 로그인 복귀 경로를 검사한다.

## 근거

- [Vercel 브랜치 고정 URL](https://vercel.com/docs/deployments/generated-urls)
- [Vercel 환경변수 및 Preview 범위](https://vercel.com/docs/environment-variables)
- [Google 웹 서버 OAuth와 redirect_uri_mismatch](https://developers.google.com/identity/protocols/oauth2/web-server)
- [확인한 PR #1 Preview 주소](https://github.com/opengardenkr/OG_ERP/pull/1#issuecomment-6399091171)
