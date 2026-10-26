# 배포 절차

세션이 끊겨도 여기만 보면 이어서 할 수 있게 적어둔다.

## 1. 구글 OAuth (완료)

- 프로젝트 `OG-ERP`, 조직 `open-garden.co.kr`
- 동의 화면: **내부(Internal)** — 검수 불필요, 회사 계정만 로그인 가능
- 클라이언트 유형은 반드시 **웹 애플리케이션**.
  데스크톱 앱으로 만들면 리디렉션 URI 칸이 아예 없고 유형은 나중에 못 바꾼다.
  잘못 만들었으면 지우고 다시 만드는 수밖에 없다.
- 승인된 리디렉션 URI 2개
  - `http://localhost:3000/api/auth/callback/google`
  - `https://app.open-garden.co.kr/api/auth/callback/google`

> Preview는 별도 테스트 OAuth 클라이언트와 고정 브랜치 callback URI를 등록해야 로그인할 수 있다.
> Production 설정을 건드리지 않는 1회 설정과 진단 순서는 [Preview Google 로그인](preview-google-login.md)을 따른다.
> 기존 Production+Preview 변수의 범위를 해제하지 말고, 새 이름의 Preview 전용 변수 두 개만 추가한다.

## 2. 로컬 실행

`.env.example`을 `.env.local`로 복사하고 채운다.

| 변수 | 값 |
|---|---|
| `AUTH_SECRET` | `npx auth secret`로 생성 |
| `AUTH_GOOGLE_ID` | 콘솔에서 받은 클라이언트 ID |
| `AUTH_GOOGLE_SECRET` | 콘솔에서 받은 시크릿 |
| `AUTH_URL` | `http://localhost:3000` |
| `AIRTABLE_TOKEN` | Airtable PAT (아래 3번) |
| `AIRTABLE_BASE_ID` | `appzLstFHtHcQlWSu` |
| `ALLOWED_HD` | `open-garden.co.kr` |
| `GOOGLE_CALENDAR_ID` | 임베드할 캘린더 ID |

## 3. Airtable 토큰

airtable.com/create/tokens 에서 개인 액세스 토큰(PAT) 생성.

- 스코프: `data.records:read` **만**. 쓰기 권한을 주지 않는다(1단계는 읽기 전용).
- 접근 범위: `OpenGarden` 베이스 하나만.
- 토큰은 생성 직후 한 번만 보인다. 못 받으면 다시 만든다.

## 4. Vercel

1. vercel.com → Add New → Project → GitHub `BYEONGJUN33/OG_ERP` 가져오기
2. Framework는 Next.js로 자동 인식된다. Root Directory·빌드 명령은 건드리지 않는다.
3. Environment Variables에 위 표의 값을 넣는다. **단 `AUTH_URL`은 넣지 않는다.**
   Vercel은 요청 헤더로 자기 주소를 판단한다(`trustHost: true`).
   여기에 `http://localhost:3000`이 들어가면 구글 로그인 후 사용자의 PC 주소로
   되돌려보내서 로그인이 통째로 깨진다. `AUTH_URL`은 로컬 `.env.local` 전용이다.
4. Deploy
5. Settings → Domains → `app.open-garden.co.kr` 추가
6. Vercel이 알려주는 CNAME 레코드를 DNS에 등록한다
7. 도메인이 붙으면 그 주소로 로그인 테스트

Node 버전은 `package.json`의 `engines.node`로 22 고정. Vercel이 이걸 읽는다.

## 5. 도구 첫 설정 (사람마다, 주소마다 한 번)

`quote.html`과 `proposal.html`은 설정을 브라우저에 담는다. 주소가 바뀌면
따라오지 않으므로 **도메인을 붙인 뒤** `app.open-garden.co.kr`에서 한다.

1. 도구를 연다
2. **우측 상단에서 작성자를 고른다** — 안 고르면 발행 버튼이 잠겨 있다
3. 🔗 에어테이블 탭에서 **쓰기 권한이 있는 토큰**을 넣는다
   (포털용 읽기 전용 토큰과 별개다)

두 사람이 각자 자기 브라우저에서 해야 한다.

## 6. 배포 후 확인

- [ ] `/`로 가면 `/login`으로 튕긴다
- [ ] 회사 계정으로 로그인된다
- [ ] 회사 밖 계정은 거부된다
- [ ] 프로그램 카드가 노출순서대로 뜬다
- [ ] 사용여부를 끈 행은 안 보인다
- [ ] 내 할 일이 마감 임박순으로 뜨고, 완료 건은 안 보인다
- [ ] 캘린더가 뜬다
- [ ] 폰에서 열어본다
