# 변경 이력

Keep a Changelog 스타일 (https://keepachangelog.com/ko/1.1.0/)
버전 관리: Semantic Versioning (https://semver.org/lang/ko/)

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
