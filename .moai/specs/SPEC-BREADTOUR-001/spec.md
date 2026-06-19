---
id: SPEC-BREADTOUR-001
version: 1.0.0
status: approved
created_at: 2026-06-19
updated_at: 2026-06-19
author: cjw06
priority: high
issue_number: null
labels: [breadtour, mvp, gps, realtime]
---

# SPEC-BREADTOUR-001: 빵투어 스탬프 랠리 웹 애플리케이션 (MVP)

## HISTORY

- 2026-06-19 (v1.0.0): plan-auditor 감사(FAIL 0.62) 전체 반영 완료. (D1) 누락 수용 기준 추가 및 Traceability 표를 요구사항별 실제 REQ→AC 매핑으로 교체. (D2) 투어 생명주기 요구사항(F6: 생성/소유자 지정/초대/수락·거절/소유자-멤버 권한/cascade) 추가. (D3/D14) 장소 삭제 시 스탬프·메뉴 처리 + 스탬프 취소/정정·재스탬프 요구사항 추가. (D4) 충돌 해결을 "행 단위(row-level) last-write-wins"로 통일. (D5) 길찾기 출력 측정 가능화(거리 m + 예상 시간 분, A11). (D6) 도착 판정에 dwell-time/연속 샘플(A9) + 정확도 비율 임계값(A10) + 도심 성공률 목표(NFR-PERF-003) 추가. (D7) 반경 겹침 해결을 정식 요구사항(REQ-F1-008, 방문 순서 우선)으로 승격. (D9) GEO 추적 표시기/중지 컨트롤/원시 좌표 미저장 정책 추가. (D10) NFR-SEC 위협 모델 + 작업별(SELECT/INSERT/UPDATE/DELETE) RLS 정책 추가. (D11) 순서 변경 동시성(단일 트랜잭션 재계산) 추가. (D13) REQ-F1-006 정확도 임계값을 정식(normative) 기준으로 승격. (D8) labels 표준화 및 created_at/updated_at 키 정렬. status: approved.
- 2026-06-19 (v0.2.0): D1~D14 1차 반영. status: draft.
- 2026-06-19 (v0.1.0): 최초 작성. 5개 핵심 기능에 대한 EARS 요구사항 및 비기능 요구사항 정의. status: draft.

---

## Goal (목표)

친구 그룹이 빵집과 음식점을 정해진 순서로 방문하는 "빵투어"를 함께 계획하고, 실제로 각 장소에 물리적으로 도착할 때마다 GPS 기반으로 디지털 스탬프를 자동 수집하는 웹 애플리케이션을 제공한다. 스탬프 랠리(stamp-rally) 형태로 투어의 계획-실행-기록 전 과정을 하나의 앱에서 처리한다.

핵심 가치:
- 계획: 여러 멤버가 실시간으로 함께 방문 코스를 편집한다.
- 안내: 카카오맵 길찾기로 다음 장소까지의 경로를 안내한다.
- 실행/기록: 도착 시 GPS로 스탬프가 자동 적용되고 도착 시각이 자동 기록된다.

## Audience (대상 사용자)

- 1차 사용자: 함께 빵투어를 다니는 친구 그룹(소규모, 통상 2~8명)
- 사용 환경: 주로 모바일 브라우저(GPS 사용은 휴대폰에서 발생). 데스크톱 브라우저는 계획 단계에서 보조적으로 사용
- 전제: 각 멤버는 로그인하여 식별되며, 같은 투어를 공유한다

## Scope (범위)

### In Scope (MVP — 전체 기능 포함)

- F1. 스탬프 투어: 장소 도착 시 GPS 자동 스탬프, 도착 시각 자동 기록 및 표시, 스탬프 취소/정정
- F2. 길찾기: 카카오맵 SDK를 이용한 장소 간 경로 안내(거리/예상 시간 제공)
- F3. 지도 순서 표시: 빵집/음식점을 계획된 방문 순서대로 번호가 매겨진 경로로 지도에 표시
- F4. 메뉴 추천: 각 빵집에 멤버가 직접 입력한 시그니처/추천 메뉴 표시
- F5. 실시간 공동 편집: 여러 멤버가 동일한 투어 일정을 실시간으로 함께 편집(Supabase Realtime), 로그인/인증으로 멤버 식별
- F6. 투어 생명주기: 투어 생성(소유자 지정), 멤버 초대(링크/이메일), 초대 수락/거절, 소유자-멤버 권한 구분

### Out of Scope

본 SPEC의 범위 밖 항목은 아래 `## Exclusions (What NOT to Build)` 섹션에 명시한다.

## Confirmed Technical Decisions (확정된 기술 결정 — 재평가 금지)

| 영역 | 결정 |
|------|------|
| Frontend | React + TypeScript (웹 전용, 모바일 반응형) |
| Map & Directions | Kakao Map JavaScript SDK (지도 표시 + 길찾기/경로) |
| Backend / Realtime / Auth | Supabase (PostgreSQL + Realtime subscriptions + Auth) |
| Stamp mechanism | GPS auto check-in (설정 가능한 반경, 기본 50m 진입 시 자동 스탬프 + 도착 시각 자동 기록) |
| Menu recommendation source | 빵집 등록 시 멤버가 시그니처/추천 메뉴를 수동 입력 |
| MVP scope | 모든 기능 포함 |

## Assumptions (가정 — 명시)

이 SPEC은 아래 가정 위에 작성되었다. 잘못된 가정이 있으면 구현 전에 정정해야 한다.

- A1. 사용자의 브라우저는 HTML5 Geolocation API를 지원하며, GPS 사용에는 HTTPS 환경이 필요하다. (Kakao Map 및 Geolocation 모두 보안 컨텍스트 요구)
- A2. 스탬프 자동 적용은 브라우저가 포그라운드 상태(앱 화면이 활성)일 때 동작하는 것을 기본으로 한다. 백그라운드/화면 잠금 상태의 위치 추적은 MVP 범위 밖이다.
- A3. 기본 도착 판정 반경은 50m이며, 장소별 또는 전역 설정으로 조정 가능하다.
- A4. 한 멤버는 동시에 하나의 활성 투어를 진행하는 것을 기본 시나리오로 한다(여러 투어를 동시 실행하는 경우는 MVP에서 보장하지 않는다).
- A5. 멤버 인증은 Supabase Auth를 통해 이루어진다. 투어 멤버십과 권한은 F6의 정식 요구사항으로 정의되며, 이 가정은 그 요구사항으로 대체된다.
- A6. 도착 시각은 클라이언트 기기 시각이 아니라 서버(Supabase) 기준 타임스탬프를 신뢰원본으로 기록한다.
- A7. 실시간 동시 편집의 충돌 해결 정책은 **행 단위(row-level) last-write-wins**(서버 타임스탬프 기준)을 기본으로 한다. CRDT/필드 병합은 제외(EXC-06)한다. 상세는 NFR-CONFLICT 참조.
- A8. 정확한 좌표(위도/경도)는 빵집/음식점 등록 시 카카오맵 장소 검색 또는 지도 핀 지정으로 확보한다.
- A9. (D6) 도착 판정은 단일 위치 샘플이 아니라 dwell-time(체류) 조건으로 한다. 기본값: 반경 내 위치 샘플이 **연속 3회 이상** 또는 **누적 10초 이상** 유지될 때 도착으로 본다. 이 값은 설정 가능하다.
- A10. (D6) 위치 정확도 임계값은 절대값이 아니라 비율로 정의한다. 보고된 accuracy(미터) < 도착 판정 반경 × 0.5 일 때만 자동 스탬프를 허용한다(기본 반경 50m 기준 25m). 설정 가능.
- A11. (D5) 카카오맵 SDK가 반환하는 경로 정보(거리/예상 소요시간/이동 수단)에 의존한다. 카카오 길찾기는 통상 자동차(driving) 경로를 제공하므로, MVP의 "예상 시간"은 SDK가 제공하는 이동 수단 기준 값을 그대로 표기한다(도보 경로를 SDK가 제공하지 않는 경우 직선거리 기반 보조 표기로 폴백).
- A12. (D9/D10) 위치 데이터 보존 정책: 원시 좌표(raw lat/lng 경로 이력)는 저장하지 않는다. 스탬프 기록에는 도착 시각(arrived_at)과 장소 식별자만 저장하고, 위치 판정은 클라이언트 메모리에서만 처리한다.
- A13. (D10) Supabase anon key의 클라이언트 번들 노출은 정상이며 허용된다. 데이터 보안은 전적으로 RLS에 의존한다(NFR-SEC-004 참조).

---

## EARS Functional Requirements (기능 요구사항)

EARS 키워드 표기: **WHEN**(event-driven), **WHILE**(state-driven), **WHERE**(optional/feature), **IF...THEN**(unwanted behavior), **THE SYSTEM SHALL**(ubiquitous/response).

### F1. Stamp Tour (GPS 자동 스탬프 + 취소/정정)

- **REQ-F1-001 (Ubiquitous)**: THE SYSTEM SHALL 각 등록된 장소(spot)에 대해 좌표(위도/경도)와 도착 판정 반경(기본 50m)을 저장한다.
- **REQ-F1-002 (Event-Driven)**: **WHEN** 사용자의 현재 위치가 등록된 장소의 도착 판정 반경 안에서 dwell-time 조건(A9: 연속 3샘플 또는 누적 10초)을 충족하면, THE SYSTEM SHALL 해당 장소의 스탬프를 해당 멤버에게 자동으로 적용한다.
- **REQ-F1-003 (Event-Driven)**: **WHEN** 스탬프가 자동 적용되면, THE SYSTEM SHALL 도착 시각(서버 기준 타임스탬프)을 자동으로 기록하고 화면에 표시한다.
- **REQ-F1-004 (State-Driven)**: **WHILE** 특정 장소의 유효한(취소되지 않은) 스탬프가 이미 해당 멤버에게 존재하는 상태이면, THE SYSTEM SHALL 동일 장소에 대한 중복 스탬프를 추가로 적용하지 않는다(최초 도착 시각을 유지).
- **REQ-F1-005 (Event-Driven)**: **WHEN** 투어 진행 화면이 표시되면, THE SYSTEM SHALL 각 장소의 스탬프 획득 여부와 도착 시각을 방문 순서대로 표시한다.
- **REQ-F1-006 (Unwanted Behavior)**: **IF** 보고된 위치 정확도(accuracy, 미터)가 도착 판정 반경 × 0.5 이상이면(A10), **THEN** THE SYSTEM SHALL 자동 스탬프를 보류하고 사용자에게 위치 정확도 경고를 표시한다.
- **REQ-F1-007 (Optional)**: **WHERE** 자동 스탬프가 적용되지 않는 환경(GPS 불가/거부 또는 정확도 부족)이면, THE SYSTEM SHALL 다른 멤버의 확인을 거친 수동 체크인(manual check-in) 대체 수단을 제공한다.
- **REQ-F1-008 (State-Driven)**: **WHILE** 사용자의 현재 위치가 둘 이상의 장소 도착 반경에 동시에 들어가 dwell-time 조건을 충족한 상태이면, THE SYSTEM SHALL 그중 **방문 순서가 가장 빠른 미방문(미스탬프) 장소** 하나에만 스탬프를 적용하고, 한 위치 진입으로 여러 장소에 동시에 자동 스탬프를 부여하지 않는다. (동순위/순서 미정 시 중심까지의 거리가 더 가까운 장소를 택한다.)
- **REQ-F1-009 (Event-Driven)**: **WHEN** 권한 있는 멤버(스탬프 본인 또는 투어 소유자)가 스탬프 취소/정정을 요청하면, THE SYSTEM SHALL 해당 스탬프를 취소(또는 도착 시각을 정정) 처리하고 변경 사실을 기록한다.
- **REQ-F1-010 (Unwanted Behavior)**: **IF** 권한 없는 멤버가 다른 멤버의 스탬프 취소/정정을 시도하면, **THEN** THE SYSTEM SHALL 해당 요청을 거부한다.
- **REQ-F1-011 (Event-Driven)**: **WHEN** 스탬프가 취소된 뒤 동일 멤버가 동일 장소의 반경에서 다시 도착 조건을 충족하면, THE SYSTEM SHALL 새 스탬프를 적용할 수 있도록 허용한다(재스탬프 허용, D14 참조).

### F2. Directions / 길찾기

- **REQ-F2-001 (Event-Driven)**: **WHEN** 사용자가 두 장소(또는 현재 위치와 다음 장소) 사이의 길찾기를 요청하면, THE SYSTEM SHALL 카카오맵 SDK를 통해 경로를 계산하여 지도에 표시한다.
- **REQ-F2-002 (Ubiquitous)**: THE SYSTEM SHALL 길찾기 결과로 **경로 거리(미터 단위)** 와 **예상 소요 시간(분 단위, 카카오 SDK가 제공하는 이동 수단 기준; A11)** 을 함께 표시한다.
- **REQ-F2-003 (Event-Driven)**: **WHEN** 사용자가 "다음 장소로 안내"를 선택하면, THE SYSTEM SHALL 현재 위치에서 방문 순서상 다음(미방문) 장소까지의 경로를 안내한다.
- **REQ-F2-004 (Unwanted Behavior)**: **IF** 카카오맵 경로 API 호출이 실패하면, **THEN** THE SYSTEM SHALL 오류 메시지를 표시하고 지도상 장소 위치는 계속 확인할 수 있도록 유지한다.

### F3. Map Ordering (지도 순서 표시)

- **REQ-F3-001 (Ubiquitous)**: THE SYSTEM SHALL 투어에 포함된 모든 빵집/음식점을 카카오맵 위에 마커로 표시한다.
- **REQ-F3-002 (Ubiquitous)**: THE SYSTEM SHALL 각 마커에 계획된 방문 순서를 나타내는 번호(1, 2, 3 ...)를 표시한다.
- **REQ-F3-003 (Event-Driven)**: **WHEN** 방문 순서가 변경되면, THE SYSTEM SHALL 지도상의 번호와 연결 경로 표시를 갱신된 순서로 다시 그린다.
- **REQ-F3-004 (Event-Driven)**: **WHEN** 사용자가 지도의 장소 마커를 선택하면, THE SYSTEM SHALL 해당 장소의 이름, 순서, 추천 메뉴, 스탬프 상태를 요약 표시한다.

### F4. Menu Recommendation (메뉴 추천)

- **REQ-F4-001 (Event-Driven)**: **WHEN** 멤버가 빵집을 등록하거나 편집하면, THE SYSTEM SHALL 시그니처/추천 메뉴를 직접 입력할 수 있는 필드를 제공한다.
- **REQ-F4-002 (Ubiquitous)**: THE SYSTEM SHALL 각 빵집 상세 화면에 멤버가 입력한 추천 메뉴를 표시한다.
- **REQ-F4-003 (Optional)**: **WHERE** 한 빵집에 여러 멤버의 추천 메뉴가 입력되어 있으면, THE SYSTEM SHALL 입력자(멤버)와 함께 모든 추천 메뉴를 함께 표시한다.
- **REQ-F4-004 (Unwanted Behavior)**: **IF** 추천 메뉴 입력이 비어 있으면, **THEN** THE SYSTEM SHALL 빵집을 추천 메뉴 없이도 정상 등록하고 "추천 메뉴 없음" 상태로 표시한다.

### F5. Collaborative Editing (실시간 공동 편집 + 인증)

- **REQ-F5-001 (Ubiquitous)**: THE SYSTEM SHALL Supabase Auth를 통해 멤버를 인증하고, 인증된 멤버만 투어를 보거나 편집할 수 있도록 한다.
- **REQ-F5-002 (Event-Driven)**: **WHEN** 한 멤버가 투어 일정(장소 추가/삭제/순서 변경/메뉴 편집)을 변경하면, THE SYSTEM SHALL Supabase Realtime을 통해 같은 투어를 보고 있는 다른 멤버에게 변경 사항을 실시간으로 반영한다.
- **REQ-F5-003 (State-Driven)**: **WHILE** 여러 멤버가 같은 투어를 동시에 보고 있는 상태이면, THE SYSTEM SHALL 현재 접속 중인 멤버 목록(presence)을 표시한다.
- **REQ-F5-004 (Unwanted Behavior)**: **IF** 두 멤버가 동일한 레코드(행)를 동시에 편집하면, **THEN** THE SYSTEM SHALL 서버 타임스탬프 기준 **행 단위 last-write-wins**로 충돌을 해결하고, 덮어쓰기가 발생한 멤버에게 변경이 갱신되었음을 알린다(NFR-CONFLICT 참조).
- **REQ-F5-005 (Unwanted Behavior)**: **IF** 멤버가 오프라인 상태가 되면, **THEN** THE SYSTEM SHALL 마지막으로 동기화된 상태를 유지 표시하고, 재연결 시 서버 기준 최신 상태로 동기화한다.
- **REQ-F5-006 (Event-Driven)**: **WHEN** 권한 없는 사용자가 투어에 접근을 시도하면, THE SYSTEM SHALL 접근을 거부하고 인증/초대 안내를 표시한다.
- **REQ-F5-007 (Event-Driven)**: **WHEN** 여러 멤버가 거의 동시에 방문 순서(order_index)를 변경하면, THE SYSTEM SHALL 순서 재계산을 서버 측에서 단일 트랜잭션으로 처리하여 중복/누락 없는 연속된 순서를 보장한다(D11).

### F6. Tour Lifecycle & Permissions (투어 생명주기 및 권한)

- **REQ-F6-001 (Event-Driven)**: **WHEN** 인증된 사용자가 새 투어를 생성하면, THE SYSTEM SHALL 해당 사용자를 그 투어의 소유자(owner)로 지정한다.
- **REQ-F6-002 (Event-Driven)**: **WHEN** 소유자(또는 권한 있는 멤버)가 멤버 초대를 요청하면, THE SYSTEM SHALL 초대 링크 또는 이메일을 통한 초대 수단을 생성한다.
- **REQ-F6-003 (Event-Driven)**: **WHEN** 초대받은 사용자가 초대를 수락하면, THE SYSTEM SHALL 그 사용자를 투어 멤버로 추가하고, 거절하면 멤버로 추가하지 않는다.
- **REQ-F6-004 (State-Driven)**: **WHILE** 사용자가 투어 소유자인 상태이면, THE SYSTEM SHALL 그 사용자에게 장소 삭제, 순서 변경, 멤버 제거, 투어 삭제 권한을 허용한다.
- **REQ-F6-005 (State-Driven)**: **WHILE** 사용자가 투어의 일반 멤버(non-owner)인 상태이면, THE SYSTEM SHALL 장소 추가/편집, 메뉴 입력, 자신의 스탬프 기록은 허용하되, 투어 삭제와 다른 멤버 제거는 허용하지 않는다.
- **REQ-F6-006 (Unwanted Behavior)**: **IF** 일반 멤버가 소유자 전용 작업(투어 삭제, 멤버 제거)을 시도하면, **THEN** THE SYSTEM SHALL 해당 요청을 거부한다.
- **REQ-F6-007 (Event-Driven)**: **WHEN** 권한 있는 사용자가 장소(spot)를 삭제하면, THE SYSTEM SHALL 해당 장소에 연결된 추천 메뉴(spot_menus)와 스탬프(stamps)도 함께 제거(cascade)하고, 남은 장소의 방문 순서를 빈틈 없이 재계산한다(상세 FK 정책은 plan.md 참조, D3).

---

## Non-Functional Requirements (비기능 요구사항)

### NFR-GEO: Geolocation Permission & Tracking (위치 권한 처리, 추적 제어, 보존)

- **NFR-GEO-001 (Event-Driven)**: **WHEN** 앱이 위치 권한을 필요로 하는 화면에 진입하면, THE SYSTEM SHALL 권한 요청의 목적(자동 스탬프)을 설명한 뒤 브라우저 위치 권한을 요청한다.
- **NFR-GEO-002 (Unwanted Behavior)**: **IF** 사용자가 위치 권한을 거부하거나 위치 정보를 사용할 수 없으면(`permission denied` / `position unavailable` / `timeout`), **THEN** THE SYSTEM SHALL 자동 스탬프를 비활성화하고, 지도/길찾기/계획/실시간 편집 기능은 정상 동작하도록 유지하며, 수동 체크인 대체 수단(REQ-F1-007)을 안내한다.
- **NFR-GEO-003 (Ubiquitous)**: THE SYSTEM SHALL HTTPS(보안 컨텍스트)에서만 Geolocation 기능을 활성화한다.
- **NFR-GEO-004 (State-Driven)**: **WHILE** 위치 추적(watchPosition)이 활성화된 상태이면, THE SYSTEM SHALL 추적이 진행 중임을 나타내는 지속적인 표시기(indicator)를 화면에 표시한다(D9).
- **NFR-GEO-005 (Event-Driven)**: **WHEN** 사용자가 위치 추적 일시중지/중지 컨트롤을 조작하면, THE SYSTEM SHALL 위치 추적을 중단하고 그동안 자동 스탬프를 적용하지 않는다(D9).
- **NFR-GEO-006 (Ubiquitous)**: THE SYSTEM SHALL 원시 위치 좌표 이력을 저장하지 않으며, 스탬프에는 도착 시각과 장소 식별자만 기록한다(A12, D9).

### NFR-CONFLICT: Realtime Conflict Resolution (실시간 동시 편집 충돌 해결)

- **NFR-CONFLICT-001 (Ubiquitous)**: THE SYSTEM SHALL 모든 일정 변경 레코드에 서버 타임스탬프(updated_at)와 변경 멤버 식별자를 함께 기록한다.
- **NFR-CONFLICT-002 (State-Driven)**: **WHILE** 동일 레코드(행)에 대한 동시 변경이 감지되는 상태이면, THE SYSTEM SHALL **행 단위 last-write-wins**(서버 타임스탬프 기준)로 최종 상태를 확정한다. (필드 단위 병합/CRDT는 제외, EXC-06.)
- **NFR-CONFLICT-003 (Event-Driven)**: **WHEN** 자신의 미반영 변경이 다른 멤버의 변경으로 덮어쓰여지면, THE SYSTEM SHALL 해당 멤버에게 비파괴적 알림(예: 토스트)을 통해 최신 값을 안내한다.

### NFR-RESP: Mobile Responsiveness (모바일 반응형)

- **NFR-RESP-001 (Ubiquitous)**: THE SYSTEM SHALL 모바일 세로 화면(최소 360px 폭)에서 지도, 일정, 스탬프 UI가 가로 스크롤 없이 사용 가능하도록 반응형으로 렌더링한다.
- **NFR-RESP-002 (Ubiquitous)**: THE SYSTEM SHALL 터치 조작(마커 탭, 순서 드래그/이동, 버튼)을 모바일에서 정상 동작하도록 지원한다.

### NFR-SEC: API Key Management & Threat Model (키 관리 및 위협 모델)

위협 모델(D10): 본 앱은 React SPA로, 클라이언트 번들에 포함되는 값은 누구나 열람할 수 있다. 따라서 **Supabase anon key와 Kakao JavaScript key는 클라이언트에 노출되는 것이 정상이며 허용된다**(A13). 데이터 보안은 키 은닉이 아니라 전적으로 RLS와 Kakao 도메인 허용 설정에 의존한다. 반드시 은닉해야 하는 것은 서버 전용 비밀(예: Supabase service-role key)이다.

- **NFR-SEC-001 (Ubiquitous)**: THE SYSTEM SHALL Kakao 및 Supabase 설정을 환경 변수(env)로 주입하고, 어떤 비밀 값도 저장소(repository)에 커밋하지 않는다.
- **NFR-SEC-002 (Ubiquitous)**: THE SYSTEM SHALL 서버 전용 비밀 키(예: Supabase service-role key)를 클라이언트 번들에 포함하지 않는다.
- **NFR-SEC-003 (Ubiquitous)**: THE SYSTEM SHALL Kakao JavaScript key에 대해 허용 도메인 제한을 설정한다.
- **NFR-SEC-004 (Ubiquitous)**: THE SYSTEM SHALL Supabase RLS 정책을 작업별로 적용한다:
  - **SELECT**: 투어 멤버(tour_members에 존재)만 해당 투어의 tours/spots/spot_menus/stamps 조회 가능.
  - **INSERT**: 멤버만 spots/spot_menus 추가 가능; stamps는 본인(user_id = auth.uid()) 행만 추가 가능.
  - **UPDATE**: 멤버만 spots/spot_menus 수정 가능; stamps 수정(정정)은 본인 또는 소유자만 가능.
  - **DELETE**: spots/멤버 제거/투어 삭제는 소유자만; stamps 취소는 본인 또는 소유자만 가능.

### NFR-PERF: Performance (성능)

- **NFR-PERF-001 (Ubiquitous)**: THE SYSTEM SHALL 위치 샘플이 dwell-time 도착 조건을 충족한 시점부터 스탬프 반영 및 화면 표시까지를 사용자 체감 1초 이내로 처리한다.
- **NFR-PERF-002 (Ubiquitous)**: THE SYSTEM SHALL 실시간 일정 변경을 동일 투어의 다른 접속 멤버에게 통상 2초 이내로 전파한다.
- **NFR-PERF-003 (Ubiquitous)**: THE SYSTEM SHALL 도심 환경(고층 빌딩 등 GPS 다중경로 간섭이 있는 환경)에서 권한 허용 + 정확도 조건 충족 시 도착-자동스탬프 성공률(반경 진입 후 정상 스탬프 부여 비율)이 90% 이상이 되도록 dwell-time/정확도 임계값을 조정한다(D6).

---

## Key Edge Cases (핵심 엣지 케이스)

| ID | 상황 | 기대 동작 | 관련 요구사항 |
|----|------|-----------|---------------|
| EC-01 | GPS 권한 거부 / 위치 사용 불가 | 자동 스탬프 비활성화, 나머지 기능 유지, 수동 체크인 안내 | NFR-GEO-002, REQ-F1-007 |
| EC-02 | 위치 정확도 부족(accuracy >= 반경×0.5) | 자동 스탬프 보류 + 정확도 경고 | REQ-F1-006, A10 |
| EC-03 | 멤버 오프라인 | 마지막 동기화 상태 유지, 재연결 시 서버 기준 재동기화 | REQ-F5-005 |
| EC-04 | 두 멤버가 같은 행 동시 편집 | 서버 타임스탬프 행 단위 last-write-wins, 덮어쓰인 멤버에 알림 | REQ-F5-004, NFR-CONFLICT-002/003 |
| EC-05 | 두 장소의 도착 반경이 겹침 | 방문 순서가 가장 빠른 미방문 장소 1곳에만 스탬프, 다중 동시 부여 금지 | REQ-F1-008 |
| EC-06 | 카카오맵 경로 API 실패 | 오류 메시지 표시, 마커/지도 표시는 유지 | REQ-F2-004 |
| EC-07 | 추천 메뉴 미입력 | "추천 메뉴 없음"으로 정상 등록 | REQ-F4-004 |
| EC-08 | 권한 없는 사용자 접근 | 접근 거부 + 인증/초대 안내 | REQ-F5-006, NFR-SEC-004 |
| EC-09 | 장소 삭제 시 연결된 스탬프/메뉴 존재 | 연결 스탬프·메뉴 cascade 삭제 + 순서 재계산 | REQ-F6-007 |
| EC-10 | 잘못 찍힌 스탬프 취소 후 재방문 | 취소 후 재스탬프 허용 | REQ-F1-009, REQ-F1-011, D14 |
| EC-11 | 일반 멤버가 소유자 전용 작업 시도 | 거부 | REQ-F6-006, NFR-SEC-004 |
| EC-12 | 동시 순서 변경(여러 멤버) | 서버 단일 트랜잭션 재계산으로 연속 순서 보장 | REQ-F5-007 |
| EC-13 | 도심 GPS 다중경로(튐) | dwell-time/정확도 임계값으로 오탐 억제, 성공률 90% 목표 | REQ-F1-002, NFR-PERF-003 |

---

## Exclusions (What NOT to Build)

다음 항목은 본 SPEC(MVP)의 범위에서 명시적으로 제외한다.

- **EXC-01 (네이티브 앱)**: iOS/Android 네이티브 앱은 만들지 않는다. 웹(모바일 반응형) 전용이다.
- **EXC-02 (백그라운드 위치 추적)**: 앱이 백그라운드/화면 잠금 상태일 때의 위치 추적 및 자동 스탬프는 제외한다(A2 참조).
- **EXC-03 (외부 메뉴 데이터 연동)**: 외부 API/크롤링으로 추천 메뉴를 자동 수집하지 않는다. 메뉴는 멤버 수동 입력만 사용한다.
- **EXC-04 (결제/예약)**: 빵집 예약, 결제, 포인트/리워드 정산 기능은 제외한다.
- **EXC-05 (소셜/공개 피드)**: 공개 타임라인, 좋아요/댓글, 외부 SNS 공유 기능은 제외한다.
- **EXC-06 (CRDT/필드 병합)**: 텍스트 단위 병합(CRDT/OT) 및 필드 단위 충돌 병합은 제외한다. 충돌은 행 단위 last-write-wins로만 처리한다(NFR-CONFLICT).
- **EXC-07 (오프라인 우선 편집)**: 오프라인 상태에서의 변경 큐잉/지연 동기화(offline-first write)는 제외한다. 오프라인은 읽기 유지 + 재연결 동기화만 보장한다(REQ-F5-005).
- **EXC-08 (관리자/운영 콘솔)**: 별도 운영자 대시보드, 사용자 관리 콘솔은 제외한다.
- **EXC-09 (위치 이력 저장/추적 분석)**: 멤버의 이동 경로(원시 좌표) 저장 및 분석은 제외한다(A12, NFR-GEO-006).

---

## Traceability (요구사항 추적)

[HARD] 모든 기능/비기능 요구사항은 acceptance.md에 1개 이상의 수용 기준(AC)을 가진다.

| 요구사항 ID | 수용 기준 ID(acceptance.md) |
|-------------|-----------------------------|
| REQ-F1-001 | AC-F1-06 |
| REQ-F1-002 | AC-F1-01 |
| REQ-F1-003 | AC-F1-01 |
| REQ-F1-004 | AC-F1-02 |
| REQ-F1-005 | AC-F1-07 |
| REQ-F1-006 | AC-F1-03 |
| REQ-F1-007 | AC-F1-04 |
| REQ-F1-008 | AC-F1-05 |
| REQ-F1-009 | AC-F1-08 |
| REQ-F1-010 | AC-F1-09 |
| REQ-F1-011 | AC-F1-10 |
| REQ-F2-001 | AC-F2-01 |
| REQ-F2-002 | AC-F2-01 |
| REQ-F2-003 | AC-F2-02 |
| REQ-F2-004 | AC-F2-03 |
| REQ-F3-001 | AC-F3-01 |
| REQ-F3-002 | AC-F3-01 |
| REQ-F3-003 | AC-F3-02 |
| REQ-F3-004 | AC-F3-03 |
| REQ-F4-001 | AC-F4-01 |
| REQ-F4-002 | AC-F4-01 |
| REQ-F4-003 | AC-F4-02 |
| REQ-F4-004 | AC-F4-03 |
| REQ-F5-001 | AC-F5-01 |
| REQ-F5-002 | AC-F5-02 |
| REQ-F5-003 | AC-F5-03 |
| REQ-F5-004 | AC-F5-04 |
| REQ-F5-005 | AC-F5-05 |
| REQ-F5-006 | AC-F5-01 |
| REQ-F5-007 | AC-F5-06 |
| REQ-F6-001 | AC-F6-01 |
| REQ-F6-002 | AC-F6-02 |
| REQ-F6-003 | AC-F6-03 |
| REQ-F6-004 | AC-F6-04 |
| REQ-F6-005 | AC-F6-05 |
| REQ-F6-006 | AC-F6-06 |
| REQ-F6-007 | AC-F6-07 |
| NFR-GEO-001 | AC-NFR-GEO-03 |
| NFR-GEO-002 | AC-NFR-GEO-01 |
| NFR-GEO-003 | AC-NFR-GEO-02 |
| NFR-GEO-004 | AC-NFR-GEO-04 |
| NFR-GEO-005 | AC-NFR-GEO-05 |
| NFR-GEO-006 | AC-NFR-GEO-06 |
| NFR-CONFLICT-001 | AC-NFR-CONFLICT-01 |
| NFR-CONFLICT-002 | AC-F5-04 |
| NFR-CONFLICT-003 | AC-NFR-CONFLICT-02 |
| NFR-RESP-001 | AC-NFR-RESP-01 |
| NFR-RESP-002 | AC-NFR-RESP-02 |
| NFR-SEC-001 | AC-NFR-SEC-01 |
| NFR-SEC-002 | AC-NFR-SEC-01 |
| NFR-SEC-003 | AC-NFR-SEC-03 |
| NFR-SEC-004 | AC-NFR-SEC-02 |
| NFR-PERF-001 | AC-NFR-PERF-01 |
| NFR-PERF-002 | AC-F5-02 |
| NFR-PERF-003 | AC-NFR-PERF-02 |
