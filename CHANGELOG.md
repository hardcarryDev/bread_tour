# 변경 이력

Keep a Changelog 스타일 (https://keepachangelog.com/ko/1.1.0/)
버전 관리: Semantic Versioning (https://semver.org/lang/ko/)

---

## [미출시] - 2026-06-21

### 추가됨

**정산 (Settlement)**
- 장소별 1:1 정산: 금액 입력, 참여자 선택(균등 분담), 단일 결제자 지정
- 각 참여자가 결제자에게 자신의 몫을 보냈는지 개별 체크 (보냄 / 정산 완료)
- 투어 전체 정산 요약: 미정산 잔액 + 권장 이체 안내
- `spot_settlements` Supabase 테이블 신설 (RLS: 투어 멤버 전원 select/insert/update/delete); `settled_ids uuid[]` 컬럼 추가 마이그레이션 포함
- `src/features/settlement/` — compute.ts, format.ts, api.ts, useSettlements.ts, SettlementModal.tsx, SettlementSummary.tsx (테스트 포함)

**이미지 뷰어 (ImageViewer)**
- 메뉴 사진을 새 탭 대신 인앱 전체화면 라이트박스로 열기
- 스와이프(모바일), 키보드 화살표, 줌-투-핏 지원
- SpotList(읽기) 및 SpotForm(편집) 양쪽에 연결

### 변경됨

**경로 컨트롤 재설계**
- 직선 / 차 / 도보 모드를 지도 우측 상단 컴팩트 아이콘 버튼으로 재배치
- 직선 연결선(straight connector)이 기본 선택; 차/도보 도로 경로 활성 시 직선선 자동 숨김
- 구간별 길찾기 경로와 전체 투어 오버레이 상호 배타적으로 동작
- 대중교통 모드는 DirectionsPanel 내부에만 유지

**길찾기 패널(DirectionsPanel) 재설계**
- 소프트 카드 래퍼 적용
- 도보 / 대중교통 / 차 탭을 길찾기 버튼 아래 세그먼트 pill 컨트롤로 이동
- 셀렉트 및 길찾기 기본 버튼 시각 개선

**스탬프 섹션 재설계**
- `StampProgress` 행을 상태 배지 카드로 재설계 (획득: 초록 pill + 체크 / 미획득: 뮤트)
- 스탬프 완료 행에 초록 워시(wash) 배경 적용
- `StampTracker`: 스탬프 제목 + 위치 추적 시작/중지 버튼을 한 줄에 배치; 목록 최대 5행 후 스크롤

**섹션 아이콘**
- `SectionTitle` 컴포넌트 신설: 멤버 / 장소 / 스탬프 헤딩에 리딩 아이콘 추가

**메뉴 텍스트 수정**
- `updateSpotMenuText` API 추가 — 기존 추천 메뉴 텍스트 편집 지원 (`src/features/menu/api.ts`)

### 수정됨

- 장소 카드 정산 캡션 텍스트 넘침(overflow) → 줄바꿈으로 수정
- DB 마이그레이션 타임스탬프 충돌 수정: `spot_kinds`, `spot_menus_profiles_fk` 파일명을 `…000601_`, `…000701_`로 변경하여 `supabase db push` 블로킹 해소

---

## [0.1.0] - 2026-06-20

### 추가됨

**인증 (F5)**
- Supabase Auth 이메일+비밀번호 회원가입·로그인
- 회원가입 시 표시 이름(display_name) 지정
- `/profile` 정보 변경 페이지 (이름 변경)

**투어 (F6)**
- 투어 생성, 소유자 지정
- 초대 링크 생성 및 수락 (`/invite/:token`)
- 소유자/멤버 권한 구분 (장소 삭제·멤버 내보내기·투어 삭제는 소유자만)
- Supabase Realtime 실시간 공동 편집 (장소·메뉴·스탬프·멤버 변경 실시간 반영)
- 접속 중인 멤버 표시 (Presence), 오프라인 표시 및 재연결 시 재동기화
- 동시 편집 충돌 비파괴 토스트 알림

**장소 (F1/F3)**
- Kakao Maps 지도 클릭 또는 키워드 검색으로 좌표 지정 (LocationPicker)
- 빵집·음식점 종류 선택
- 번호 마커 + 방문 순서 연결선 지도 표시
- 방문 순서 변경 (단일 트랜잭션 `reorder_spots` RPC)
- **내기준정렬**: 현재 위치 기준 선택된 이동 수단 거리순 정렬 (로컬 뷰 전용)

**메뉴 추천 (F4)**
- 멤버별 추천 메뉴 입력, 다중 작성자 표시

**GPS 스탬프 (F1)**
- 장소 반경 내 체류 시간(dwell-time) 충족 시 자동 스탬프
- 정확도 게이트 (기준 미달 시 보류 후 재시도)
- 스탬프 취소 및 재스탬프
- 수동 체크인: 위치 권한 거부 시 다른 멤버 확인으로 스탬프 기록
- **내 위치 지도 표시**: GPS 추적 중 현재 위치 마커 + 정확도 원 표시

**길찾기 (F2)**
- 도보 / 대중교통 / 차 3가지 이동 수단 (차=Kakao Mobility, 도보·대중교통=TMAP)
- Supabase Edge Function `directions` 프록시 (REST 키 서버 보관)
- 대중교통 구간별 환승 내역, 요금, 총 도보 시간 표시
- 길찾기 실패 시 직선 거리 추정 폴백 (지도 화면 유지)
- 다음 미방문 장소로 안내 버튼

**인프라·배포**
- Supabase PostgreSQL + RLS + Realtime + Auth + Edge Functions 백엔드
- GitHub Actions + GitHub Pages 정적 배포 워크플로
- SPA 딥링크 지원 (`404.html` 폴백)
- 하위 경로(`/<저장소명>/`) 자동 대응 (`BASE_PATH` 주입)

[0.1.0]: https://github.com/cjw06/bread_tour/releases/tag/v0.1.0
