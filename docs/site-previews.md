# 외부 사이트 대표 이미지

2026-11-10 각 공개 사이트에서 사용 중인 이미지를 WebP(최대 800px)로 축소했다.
화면 캡처나 실시간 미리보기가 아닌 대표 이미지다.

| 파일 | 원본 |
| --- | --- |
| `public/site-previews/docent.webp` | https://docent.open-garden.co.kr/api/photos/d5921474-0965-486e-bc49-4eef34130968.jpg |
| `public/site-previews/ipark.webp` | https://open-garden.co.kr/docent/images/og-cover.jpg |
| `public/site-previews/home.webp` | https://open-garden.co.kr/assets/hero.jpg |

관공서 영업 지도는 로그인 전용 화면이므로 기존 지도 아이콘으로 표시한다.
교체할 때는 `프로그램` 표의 `미리보기 이미지` URL을 바꾼다. 현재 주소는
`https://app.open-garden.co.kr/site-previews/<파일명>.webp`이며 ERP 로그인 보호를 유지한다.
외부 HTTPS 이미지 주소도 가능하다. 이미지가 없거나 불러오기 실패 시 아이콘이 남는다.
