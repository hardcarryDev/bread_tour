---
id: SPEC-BREADTOUR-001
version: 1.0.0
status: approved
created_at: 2026-06-19
updated_at: 2026-06-19
author: cjw06
priority: high
labels: [breadtour, mvp, gps, realtime]
---

# Implementation Plan: SPEC-BREADTOUR-001

## HISTORY

- 2026-06-19 (v1.0.0): plan-auditor 감사(FAIL 0.62) 전체 반영 완료. (D3) 장소 삭제 시 spot_menus/stamps FK on-delete cascade 정책 및 순서 재계산 명시. (D14) UNIQUE(spot_id, user_id)를 부분 유니크 인덱스(cancelled_at IS NULL 한정)로 변경하여 취소 후 재스탬프 허용. (D4) Realtime 충돌 해결을 행 단위 last-write-wins로 정렬. (D11) 순서 변경 동시성을 서버 측 단일 트랜잭션 재계산으로 보장. (D10) 위협 모델 반영(anon key 노출 정상, 보안은 작업별 RLS 의존). F6(투어 생명주기) 마일스톤 추가. labels 표준화 및 created_at/updated_at 키 정렬. status: approved.
- 2026-06-19 (v0.2.0): D1~D14 1차 반영. status: draft.
- 2026-06-19 (v0.1.0): 최초 작성. 기술적 접근, 데이터 모델, 마일스톤 정의. status: draft.

---

빵투어 스탬프 랠리 웹 애플리케이션(MVP)의 구현 계획. 본 문서는 WHAT/WHY가 아니라 구현 순서와 기술적 접근을 정리한다. 상세 요구사항은 spec.md, 검증 기준은 acceptance.md를 참조한다.

## Technical Approach (기술적 접근)

| 영역 | 접근 |
|------|------|
| Frontend | React + TypeScript SPA, 모바일 반응형(최소 360px). 상태는 Supabase 데이터에 종속(서버를 신뢰원본으로). |
| Map / Directions | Kakao Map JavaScript SDK 동적 로드. 마커 + 순번 오버레이 + 경로(polyline). |
| Data / Realtime | Supabase PostgreSQL 스키마(tours, tour_members, spots, spot_menus, stamps, tour_invites). Realtime channel로 **행(row) 변경** 구독 + presence. 충돌은 행 단위 last-write-wins(updated_at 서버 타임스탬프 기준)로 해결한다(필드 병합/CRDT 미사용, EXC-06). |
| Auth | Supabase Auth. 투어 멤버십 테이블 + 작업별(SELECT/INSERT/UPDATE/DELETE) RLS로 접근 제한(NFR-SEC-004). |
| GPS Stamp | 브라우저 `navigator.geolocation.watchPosition`로 위치 감지 → 반경 진입 + dwell-time(연속 3샘플/누적 10초) 판정 → 스탬프 insert. 도착 시각은 DB default(서버 시각)로 기록. 원시 좌표는 저장하지 않음(NFR-GEO-006). |
| Secrets / Threat Model | Kakao JS key / Supabase anon key는 빌드 타임 env로 주입되며 **클라이언트 번들에 노출되는 것이 정상이고 허용된다**(D10). 데이터 보안은 키 은닉이 아니라 전적으로 RLS + Kakao 도메인 허용 설정에 의존한다. service-role key는 클라이언트에 절대 미포함. |

## Data Model (개략)

- `tours`: 투어(id, name, owner_id, created_at, updated_at)
- `tour_members`: 투어-멤버 매핑(tour_id, user_id, role[owner|member]) — 인증/RLS 기준
- `tour_invites`: 초대(id, tour_id, invited_email[nullable], token, status[pending|accepted|rejected], created_at) — 링크/이메일 초대(REQ-F6-002/003)
- `spots`: 장소(id, tour_id, name, lat, lng, radius_m, order_index, kind[bakery|restaurant], updated_at)
- `spot_menus`: 추천 메뉴(id, spot_id, author_id, menu_text, updated_at)
- `stamps`: 스탬프(id, spot_id, user_id, arrived_at[server default], method[auto|manual], cancelled_at[nullable], updated_at)

### FK On-Delete 정책 (D3)

- `spots.tour_id` → `tours(id)` **ON DELETE CASCADE** (투어 삭제 시 장소 제거)
- `spot_menus.spot_id` → `spots(id)` **ON DELETE CASCADE** (장소 삭제 시 추천 메뉴 제거)
- `stamps.spot_id` → `spots(id)` **ON DELETE CASCADE** (장소 삭제 시 해당 장소의 스탬프 제거; REQ-F6-007)
- `tour_members.tour_id` / `tour_invites.tour_id` → `tours(id)` **ON DELETE CASCADE**
- 장소 삭제는 단일 트랜잭션으로 처리하여 cascade 삭제와 잔여 spot의 `order_index` 재계산을 원자적으로 수행한다(REQ-F6-007, EC-09).

### 중복 스탬프 방지 + 재스탬프 허용 (D14)

기존 `UNIQUE(spot_id, user_id)` 전체 제약은 취소 후 재스탬프(REQ-F1-011)를 막으므로 사용하지 않는다. 대신:

- **부분 유니크 인덱스**: `UNIQUE(spot_id, user_id) WHERE cancelled_at IS NULL` — 유효한(취소되지 않은) 스탬프는 멤버·장소당 1건만 허용(REQ-F1-004)하되, 취소된 스탬프가 있어도 새 스탬프를 추가할 수 있다(REQ-F1-011, EC-10).
- 스탬프 취소는 행 삭제가 아니라 `cancelled_at` 설정(soft-cancel)로 처리하여 변경 이력을 보존한다(REQ-F1-009).

## Milestones (우선순위 기반 — 시간 추정 없음)

### M1 — Foundation & Tour Lifecycle (Priority: High)
- 프로젝트 셋업(React + TypeScript), env 키 관리 구조(NFR-SEC-001/002/003)
- Supabase 스키마(tours, tour_members, tour_invites, spots, spot_menus, stamps) + 작업별 RLS 정책(NFR-SEC-004)
- Supabase Auth 로그인/멤버 식별(REQ-F5-001)
- 투어 생성/소유자 지정, 초대(링크·이메일)/수락·거절, 소유자-멤버 권한 구분(F6)

### M2 — Plan & Map (Priority: High)
- 투어/장소 CRUD, 추천 메뉴 입력(F4)
- 장소 삭제 시 cascade(메뉴/스탬프) + 순서 재계산(REQ-F6-007, EC-09)
- 카카오맵 마커 + 방문 순번 표시 + 순서 변경 시 재렌더(F3)
- 모바일 반응형 레이아웃(NFR-RESP)

### M3 — Realtime Collaboration (Priority: High)
- Supabase Realtime 구독으로 일정 변경 실시간 반영(REQ-F5-002)
- presence(접속 멤버 표시, REQ-F5-003)
- 충돌 해결(행 단위 last-write-wins) + 덮어쓰기 알림(REQ-F5-004, NFR-CONFLICT)
- 순서 변경 동시성: 서버 측 단일 트랜잭션 order_index 재계산(REQ-F5-007, EC-12)
- 오프라인/재연결 동기화(REQ-F5-005)

### M4 — GPS Stamp (Priority: High)
- 위치 권한 요청/폴백 + 추적 표시기/중지 컨트롤(NFR-GEO-001~005)
- watchPosition 기반 반경 진입 + dwell-time 판정 + 자동 스탬프 + 도착 시각 기록/표시(F1)
- 정확도 비율 임계값(accuracy < 반경×0.5) 보류 처리(REQ-F1-006, EC-02)
- 반경 겹침 시 방문 순서 우선 단일 스탬프(REQ-F1-008, EC-05)
- 스탬프 취소/정정 + 취소 후 재스탬프(REQ-F1-009/011, EC-10)
- 원시 좌표 미저장(NFR-GEO-006), 도심 성공률 목표 튜닝(NFR-PERF-003)
- 수동 체크인 대체 수단(REQ-F1-007)

### M5 — Directions (Priority: Medium)
- 장소 간 / 현재 위치→다음 장소 길찾기(F2)
- 경로 거리(m) + 예상 소요 시간(분) 표시(REQ-F2-002)
- 경로 API 실패 폴백(REQ-F2-004)

### M6 — Hardening (Priority: Medium)
- 엣지 케이스 검증(EC-01~13), 반응형/터치 점검, 키/RLS 노출 점검

## Dependencies & Ordering

- M1 → (M2, M3) → M4 → M5 → M6
- M3(Realtime)는 M2의 데이터 모델 확정 후 진행
- M4(GPS)는 M2의 spot 좌표/반경 확정에 의존
- F6(권한/멤버십)는 M1에서 확정되어야 이후 RLS·삭제·권한 로직의 기반이 된다

## Risks (위험 요소)

| 위험 | 영향 | 완화 |
|------|------|------|
| 브라우저 GPS 정확도 편차(도심 빌딩 등) | 오탐/미탐 스탬프 | dwell-time + 정확도 비율 임계값(REQ-F1-002/006), 수동 체크인 폴백(REQ-F1-007), 도심 성공률 90% 목표(NFR-PERF-003) |
| 반경 겹침으로 다중 스탬프 | 잘못된 도착 기록 | 방문 순서 우선 단일 스탬프 규칙(REQ-F1-008) |
| 동시 편집 충돌로 의도치 않은 덮어쓰기 | 멤버 작업 손실 | 행 단위 last-write-wins + 비파괴 알림(NFR-CONFLICT-003) |
| 동시 순서 변경으로 order_index 중복/누락 | 잘못된 방문 순서 | 서버 측 단일 트랜잭션 재계산(REQ-F5-007) |
| anon key 노출에 대한 오해로 RLS 미흡 | 데이터 유출 | 위협 모델 명시(D10): 보안은 키 은닉이 아닌 작업별 RLS에 의존(NFR-SEC-004) |
| service-role key 클라이언트 노출 | 권한 우회 | env 관리 + service-role 클라이언트 미포함(NFR-SEC-002) |
| HTTPS 미구성 시 GPS/지도 동작 불가 | 핵심 기능 마비 | 배포 환경 HTTPS 강제(NFR-GEO-003) |
| 장소 삭제 시 잔여 스탬프/메뉴 orphan | 데이터 정합성 깨짐 | FK ON DELETE CASCADE + 순서 재계산 트랜잭션(REQ-F6-007) |

## MX Tag Targets (구현 시 주석 대상)

- 반경 진입 + dwell-time 판정 로직: `@MX:ANCHOR`(스탬프 정확성 불변식), `@MX:WARN`(정확도/겹침 위험, @MX:REASON 포함)
- 행 단위 충돌 해결 함수: `@MX:ANCHOR`(row-level last-write-wins 계약)
- order_index 재계산 트랜잭션: `@MX:ANCHOR`(연속 순서 불변식), `@MX:WARN`(동시성)
- 장소 삭제(cascade + 순서 재계산) 트랜잭션: `@MX:WARN`(연쇄 삭제 위험, @MX:REASON 포함)
- 키 로딩 지점: `@MX:NOTE`(anon key 노출은 정상; 보안은 RLS 의존, D10)
