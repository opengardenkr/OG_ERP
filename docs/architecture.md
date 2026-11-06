# ERP 서버 구조 — 다른 프로그램을 붙이는 사람을 위한 문서

이 문서는 **ERP 바깥에서 새 프로그램을 만드는 세션**이 읽으라고 쓴 것이다.
ERP 내부 규칙은 `CLAUDE.md`에 있다.

## 한 줄 요약

ERP는 **Vercel 위의 Next.js 앱**이고, 상시 켜진 서버가 아니다.
요청이 올 때만 함수가 돈다. 로그인은 구글(회사 계정만), 데이터는 Airtable.

## 현재 구조

| 항목 | 값 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript |
| 런타임 | Node 22 |
| 호스팅 | Vercel, 서버리스. 프로세스가 계속 떠 있지 않다 |
| 저장소 | `BYEONGJUN33/OG_ERP`, `main` 브랜치에 푸시하면 자동 배포 |
| 주소 | 지금 `og-erp-five.vercel.app` → 예정 `app.open-garden.co.kr`(미연결) |
| 로그인 | Auth.js v5 + Google OAuth. `@open-garden.co.kr` 계정 중 `src/config/users.ts`에 있는 사람만 |
| 세션 | JWT 쿠키. **쿠키 도메인을 지정하지 않았다** → ERP 주소에서만 유효 |
| 접근 통제 | `src/proxy.ts`가 로그인 화면·인증 경로를 뺀 **모든 경로**를 막는다(`public/` 정적 파일 포함) |
| 데이터 | Airtable 베이스 `appzLstFHtHcQlWSu`. 토큰은 서버에서만 쓴다 |
| 외부 호출 | `api.airtable.com`, `www.googleapis.com`(캘린더), `oauth2.googleapis.com`, `map.open-garden.co.kr/data/offices.json`(영업 지도의 관공서 위치, 키 없음) |
| 자체 DB | 없다. Airtable이 유일한 원천 |

## 상시 켜진 서버가 아니라는 뜻

Vercel 서버리스 함수는 **요청이 들어오면 깨어나서 응답하고 끝난다.**

| 새 프로그램이 하는 일 | Vercel(ERP 안)에 맞나 |
|---|---|
| 버튼 누르면 처리하고 결과 돌려주기 | 맞는다 |
| 몇 초~수십 초 걸리는 계산 | 대체로 맞는다(함수 실행 시간 제한 안이면) |
| 하루 몇 번 정해진 시각에 돌기 | Vercel Cron으로 가능 |
| **계속 떠서 무언가를 기다리기**(웹소켓, 큐, 실시간 수집) | **안 맞는다.** 별도 서버가 필요하다 |
| 파일을 서버 디스크에 쌓기 | 안 맞는다. 디스크가 요청마다 사라진다 |

"언제 들어가도 열려 있다"는 뜻의 상시라면 Vercel로 충분하다.
"뒤에서 계속 돌아간다"는 뜻이라면 별도 서버가 필요하다.

## 새 프로그램을 ERP에 붙이는 세 가지 방법

### A. ERP 저장소 안에 넣는다

ERP의 API 라우트·화면으로 만든다.

- 로그인, Airtable 토큰, 배포, 주소를 **전부 공유**한다. 따로 할 게 없다
- 조건: 요청-응답형이어야 한다(위 표의 "맞는다" 범위)
- 가장 단순하다. 조건이 맞으면 이걸 먼저 고려한다

### B. 별도 서버, ERP에서는 링크만

새 서버를 따로 띄우고(예: `xxx.open-garden.co.kr`), ERP `프로그램` 표에
`https://` 주소 한 줄을 넣는다. ERP 배포는 필요 없다.

- **ERP 로그인이 따라가지 않는다.** 세션 쿠키가 ERP 주소에만 묶여 있다
- 그래서 새 서버가 **스스로 로그인을 가져야 한다.** 없으면 주소만 아는
  누구나 들어온다
- 권장: 같은 구글 클라우드 프로젝트(`OG-ERP`)에서 OAuth를 쓰고
  `open-garden.co.kr` 계정만 받는다. 동의 화면이 '내부'라 회사 밖 계정은
  애초에 못 들어온다. 사람 입장에서는 구글 계정 한 번 고르는 클릭 하나다
- 리디렉션 URI는 새 서버 주소로 따로 등록해야 한다

### C. 별도 서버, ERP 로그인을 공유한다

ERP 세션 쿠키를 `.open-garden.co.kr`로 넓히고, 새 서버가 같은 `AUTH_SECRET`으로
ERP의 JWT를 풀어 본다.

- 로그인이 한 번이면 된다
- 대신 **ERP 코드를 고쳐야 하고**, 두 서버가 같은 비밀값을 나눠 가진다.
  한쪽이 새면 양쪽이 다 뚫린다. 두 쪽을 함께 배포해야 하는 일이 생긴다
- 2인 조직에서는 B의 클릭 하나를 아끼려고 치를 값이 아니다. 권하지 않는다

## 어느 방법이든 지킬 것

- **키는 서버에서만.** Airtable·구글 키가 브라우저 코드에 들어가면 안 된다
  (ERP 원칙 1). HTML 도구들이 토큰을 브라우저에 담는 건 이미 알고 있는 문제다.
  새 프로그램은 같은 실수를 하지 마라
- **Airtable 토큰은 따로 만든다.** ERP 토큰을 복사해 쓰지 마라. 필요한 스코프와
  베이스만 준다. 한쪽 토큰을 바꿔도 다른 쪽이 안 깨진다
- **Airtable이 데이터 원천이다.** 새 프로그램이 같은 데이터를 자체 DB에 복제해
  두면 두 곳이 어긋난다. 꼭 별도 저장이 필요하면 무엇을 왜 따로 두는지 적어라
- **ERP에 노출하는 법**: `프로그램` 표(`tblPMe2YBiKlgHBEN`)에 한 줄.
  `경로`에 `https://` 전체 주소, `새창열기` 체크, `사용여부` 체크
- **주소**: ERP는 `app.open-garden.co.kr`을 쓴다. 새 프로그램은 다른 하위 도메인을
  써라. 같은 주소 아래에 두면 경로가 겹친다

## 새 프로그램 쪽에서 알려줘야 할 것

ERP 쪽에서 도와줄 일이 생기면 이걸 먼저 알려라.

1. 그 서버가 하는 일 — 요청이 올 때만인가, 계속 돌아야 하나
2. 언어·프레임워크, 어디에 띄울 건지
3. 읽고 쓰는 Airtable 테이블
4. 로그인한 사람만 써야 하나(거의 그렇다)
5. 원하는 하위 도메인

---

## 사례: 관공서 영업 지도 (2026-10-01 결정, 같은 날 변경)

**별도 저장소 · 별도 Vercel 프로젝트로 간다(방법 B).** 처음엔 ERP 안에 넣기로
했으나(방법 A), 지도는 담당 세션이 전국 조사와 기능 수정을 계속하는 중이라
저장소를 나누는 쪽으로 바꿨다. ERP는 링크 한 줄만 갖는다.

| | |
|---|---|
| 원본 | 비공개 GitHub `BYEONGJUN33/gov-map`, `main` |
| 배포 | Vercel 별도 프로젝트. `main`에 push → 운영 자동 배포 |
| 주소 | `https://map.open-garden.co.kr` (PC·폰 같은 주소) |
| 형태 | 정적 HTML/JS/CSS + `api/`의 Vercel Functions(`config`, `visits`). 상시 서버 없음 |
| 로그인 | 지도 자체 앱 비밀번호(`APP_PASSWORD`). ERP 구글 로그인은 **넘어가지 않는다** |
| 데이터 | `지자체 영업일지`를 **읽기만** 한다 |

### Vercel 프로젝트 설정

- Import: `BYEONGJUN33/gov-map`, Production Branch `main`
- Framework Preset `Other`, Build Command 비움, Output Directory 비움(저장소 루트)
- Root Directory 비움. `.vercelignore`가 문서·도구·테스트·비밀 파일을 뺀다
- 환경변수(이름만. 값은 사용자가 Vercel에 직접 넣는다):
  `NAVER_MAP_KEY_ID` `AIRTABLE_TOKEN` `AIRTABLE_BASE_ID`
  `AIRTABLE_VISITS_TABLE_ID` `APP_PASSWORD`. TMAP은 보류
- Domains: `map.open-garden.co.kr` 추가

### DNS — 추가할 것 없음 (2026-10-01 확인)

DNS는 카페24에 있다(`ns1.cafe24.co.kr` 등). 이미 **와일드카드**가 걸려 있다 —
`*.open-garden.co.kr` → CNAME `open-garden.co.kr` → A `216.198.79.1`(Vercel).
그래서 `map.`도 `app.`처럼 이미 Vercel로 간다. Vercel 프로젝트의 Domains에
주소를 넣기만 하면 그 프로젝트가 받는다. DNS는 손대지 않는다.
메일(MX: Google)은 와일드카드와 무관하다.

새 하위 주소(`xxx.open-garden.co.kr`)를 붙일 때도 같다 — Vercel Domains에 추가만.

### 네이버 지도

네이버 클라우드 콘솔 → Maps 앱 → Web 서비스 URL에 `https://map.open-garden.co.kr`
추가. Vercel 미리보기 주소는 매번 바뀌므로 지도 확인은 운영 주소에서 한다.

### ERP 등록

`프로그램` 표에 한 줄(2026-10-01 등록, 레코드 `recWhiKbm92uzhYOx`):
이름 `관공서 영업 지도` / 경로 `https://map.open-garden.co.kr` / 아이콘 `map-pin` /
분류 `지도` / 노출순서 30 / 새창열기 체크.
주소가 열리는 걸 확인하고(2026-10-01, 비밀번호 화면·API 401 정상) 사용여부를 켰다. 이후 지도 업데이트는 같은 주소라
ERP를 고칠 일이 없다.

### 회사 로그인 통합 — 지금은 안 한다

ERP 로그인 쿠키는 `app.open-garden.co.kr`에만 붙어서 `map.`에서 읽히지 않는다.
통합하려면 지도 쪽에 구글 로그인을 따로 넣거나 쿠키 도메인을 넓혀야 한다.
필요해지면 지도 담당 세션과 따로 정한다.

<details>
<summary>버린 안: ERP 안에 넣기(방법 A)</summary>

정적 HTML/JS/CSS + JSON + Node API(`/api/config`, `/api/visits`), 서버리스로 충분.
→ **방법 A, ERP 안에 넣는다.** 주소는 ERP 하위 경로 `/tools/map/`.

### 폴더

```
public/tools/map/index.html
public/tools/map/js/…        화면 스크립트
public/tools/map/css/…
public/tools/map/data/…json  기관·부서 정보
src/app/api/map/config/route.ts
src/app/api/map/visits/route.ts
src/lib/airtable/visits.ts   지자체 영업일지 읽기 (Airtable 호출은 여기서만)
```

### 지도 코드에서 바꿀 것

- **루트 경로를 쓰지 않는다.** ERP가 이미 `/api`를 쓴다(로그인).
  `/js/app.js` → `js/app.js`(상대 경로), `/api/config` → `/api/map/config`
- **앱 비밀번호를 뺀다.** ERP 로그인이 대신한다
- **브라우저에서 키를 입력·저장하는 화면을 뺀다.** 키는 Vercel 환경변수로 간다
  - `AIRTABLE_TOKEN` — ERP 것을 그대로 쓴다(서버에서만)
  - `NAVER_MAP_CLIENT_ID` — 새로 추가. 네이버 지도 Client ID는 원래 브라우저에
    드러나는 값이라 비밀이 아니다. 대신 네이버 클라우드 콘솔의 **Web 서비스 URL에
    ERP 주소를 등록**해야 그 주소에서만 지도가 뜬다
  - `/api/map/config`가 Client ID를 내려준다
- API는 Express/`(req, res)` 형식이 아니라 Next.js Route Handler 형식으로 옮긴다

```ts
// src/app/api/map/visits/route.ts
import { auth } from "@/lib/auth";
import { getVisits } from "@/lib/airtable/visits";

export async function GET() {
  const session = await auth();
  if (!session?.user.member) {
    return Response.json({ error: "로그인이 필요하다" }, { status: 401 });
  }
  const result = await getVisits();
  return result.ok
    ? Response.json(result.data)
    : Response.json({ error: result.message }, { status: 502 });
}
```

### 로그인

- `src/proxy.ts`가 `/tools/map/*`와 `/api/map/*`를 이미 막고 있다. 로그인 안 한
  사람은 `/login`으로 간다. 지도 쪽에서 따로 할 일이 없다
- API 안에서도 `auth()`로 한 번 더 확인한다(위 코드). 입구는 둘 다 막는다

### 등록

`프로그램` 표에 한 줄: 이름 `관공서 영업 지도` / 경로 `/tools/map/` /
아이콘 `map-pin` / 분류 `지도` / 새창열기 체크 / 사용여부 체크.

### 데이터

`지자체 영업일지` 테이블을 **읽기만** 한다. CLAUDE.md §3의 "기존 테이블은 읽지도
쓰지도 않는다"에 대한 예외로, 사용자가 결정했다. 쓰기와 `거래처` 링크 전환은
여전히 §3 범위 밖이다.

</details>
