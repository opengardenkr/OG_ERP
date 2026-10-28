# ERP 내장 캘린더 — 2026-10-28

일정 원본은 Google Calendar, 기존 업무 원본은 Airtable로 유지한다. 데이터 이전·자동 생성·배포 시 데이터 수정 없음.

- `/calendar` 월/주/일 보기. 날짜 이동, 로딩·빈 화면·오류 표시. 일 보기는 시간순 일정 목록이다.
- Google 일정 클릭은 ERP 상세·편집 모달. 읽기 권한만 있으면 상세만 표시한다. 외부 Google 탭 링크를 제거했다.
- 생성 POST, 수정 PATCH, 삭제 DELETE. 서버 액션은 매번 회원 세션과 해당 캘린더 writer/owner 권한을 확인한다. 권한 목록은 캐시하지 않는다.
- 기존 OAuth `calendar.events` scope 사용. 새로운 권한·키·환경변수 불필요.
- 수정/삭제는 조회 당시 ETag로 `If-Match`를 보내며 412 충돌은 재조회 안내한다. 변경한 기본 필드 외 참석자·첨부·반복 규칙 등을 덮어쓰지 않는다.
- 반복 일정은 펼쳐진 회차 ID만 수정/삭제한다. 모달에 이를 명시한다. 전체 반복 시리즈 편집은 제공하지 않는다.
- 삭제는 별도 확인 단계 이후에만 요청한다. 네트워크 결과가 불명확하면 새로고침으로 확인하도록 안내한다.
- 날짜·시각 검증 및 Asia/Seoul 적용. 종일 일정 종료일은 Google의 exclusive-end 규칙으로 변환한다.
- 기존 날짜 있는 업무는 캘린더에 읽기 합성한다. 날짜 없는 업무도 `/calendar`의 기존 업무 전체 보기 링크로 접근 가능하다. 업무를 Google로 복사하지 않는다.

검증: `node --experimental-strip-types --test tests/calendar-write.test.mjs` — 실제 API 호출 없이 fetch와 인증/권한을 mock하여 날짜·시간, 생성/수정/삭제, ETag 충돌, 권한 및 삭제 확인을 검증한다. Production 일정 쓰기 테스트를 하지 않는다.

Google 공식 참조:
- https://developers.google.com/workspace/calendar/api/v3/reference/events/patch
- https://developers.google.com/workspace/calendar/api/guides/version-resources
