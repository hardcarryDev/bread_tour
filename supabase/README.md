# 빵투어 Supabase 백엔드 (SPEC-BREADTOUR-001)

이 디렉터리는 빵투어 앱의 백엔드 데이터 계층입니다. 별도의 커스텀 서버는 없으며,
**Supabase(PostgreSQL + Auth + Realtime + RLS)** 가 백엔드 전부입니다. 따라서 산출물은
SQL 마이그레이션과 생성된 TypeScript 타입뿐입니다.

> 위협 모델 요약 (D10 / A13): Supabase anon key는 클라이언트 번들에 노출되는 것이
> **정상**입니다. 누구나 anon key로 PostgREST 쿼리를 보낼 수 있으므로, 데이터 보안은
> 전적으로 아래 마이그레이션의 **RLS 정책**에 의존합니다. service-role key는 절대
> 클라이언트나 저장소에 포함하지 마세요.

---

## 디렉터리 구조

```
supabase/
├── config.toml                       # Supabase CLI 로컬 설정
├── README.md                         # (이 문서)
└── migrations/
    ├── 20260619000100_core_schema.sql        # profiles, tours, tour_members, tour_invites + 헬퍼 함수/트리거
    ├── 20260619000200_spots_menus_stamps.sql # spots, spot_menus, stamps + reorder_spots()
    ├── 20260619000300_rls_policies.sql        # 모든 테이블 RLS 활성화 + 작업별 정책 (default-deny)
    └── 20260619000400_realtime.sql            # supabase_realtime publication 등록
```

마이그레이션은 파일명 타임스탬프 순서대로 적용됩니다. **반드시 순서를 유지**하세요
(예: RLS 정책은 1번 마이그레이션의 헬퍼 함수에 의존).

---

## 사전 준비: Supabase CLI 설치

```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# npm (크로스 플랫폼)
npm install -g supabase

# 설치 확인
supabase --version
```

로컬 스택은 Docker를 사용하므로 Docker Desktop이 실행 중이어야 합니다.

---

## 1) 로컬 개발 환경에서 실행하기

프로젝트 루트(`c:\coding\bread_tour`)에서 실행합니다.

```bash
# 로컬 Supabase 스택 시작 (Postgres + Auth + Realtime + Studio)
supabase start

# 마이그레이션을 처음부터 다시 적용 (DB 초기화 후 전체 재적용)
supabase db reset
```

`supabase start`가 출력하는 값으로 프로젝트 루트의 `.env`를 채웁니다
(`.env.example` 참고):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321      # API URL
VITE_SUPABASE_ANON_KEY=<출력된 anon key>
```

Studio(로컬 관리 UI)는 보통 http://127.0.0.1:54323 에서 열립니다.

새 마이그레이션 파일을 추가한 뒤에는:

```bash
# 아직 적용되지 않은 마이그레이션만 순서대로 적용
supabase migration up

# 또는 DB를 깨끗이 비우고 전체 재적용 (개발 중 권장)
supabase db reset
```

---

## 2) 호스팅(클라우드) 프로젝트에 적용하기

```bash
# Supabase 계정 로그인
supabase login

# 로컬 프로젝트를 원격 Supabase 프로젝트에 연결
#   <project-ref>는 대시보드 URL(https://supabase.com/dashboard/project/<ref>)에서 확인
supabase link --project-ref <project-ref>

# 로컬 migrations/ 를 원격 DB에 적용
supabase db push
```

적용 후 대시보드에서:

1. **Database → Replication / Publications**: `supabase_realtime` publication에
   `tours, tour_members, spots, spot_menus, stamps`가 등록됐는지 확인.
2. **Authentication → URL Configuration**: 운영 도메인을 `site_url`/redirect에 등록.
3. **Authentication → Providers**: 이메일 또는 소셜 로그인 활성화(REQ-F5-001).

호스팅 환경의 `.env`(또는 배포 플랫폼의 환경 변수)에는 원격 프로젝트의
`VITE_SUPABASE_URL`과 anon key를 사용합니다.

---

## 3) TypeScript 타입 재생성

`src/types/database.ts`는 현재 **마이그레이션에 맞춰 수기로 작성**되어 있습니다.
실제 Supabase 프로젝트가 연결되면 CLI로 재생성할 수 있습니다.

```bash
# 연결된(linked) 프로젝트 기준
supabase gen types typescript --linked > src/types/database.ts

# 또는 project-id 지정
supabase gen types typescript --project-id <project-ref> > src/types/database.ts

# 로컬 스택 기준 (supabase start 가 떠 있어야 함)
supabase gen types typescript --local > src/types/database.ts
```

재생성 후에는 `npm run build`로 타입 정합성을 다시 확인하세요.

---

## 길찾기 Edge Function (`directions`)

길찾기(F2)는 외부 길찾기 **REST** API를 호출해야 합니다. REST API는 지도용
JavaScript 키가 아니라 **서버 전용 REST/App 키**가 필요하고, 이 키를 클라이언트
번들에 넣는 것은 보안 위험입니다. 그래서 모든 키는 **Edge Function 시크릿에만**
두고, 브라우저는 `directions` Edge Function을 통해 호출합니다.

이 함수는 **세 가지 이동 수단(mode)** 을 지원합니다.

| mode | 제공자 | 사용 시크릿 |
|------|--------|-------------|
| `car` (기본값) | Kakao Mobility 자동차 길찾기 | `KAKAO_REST_API_KEY` |
| `walk` | TMAP 보행자 경로 | `TMAP_APP_KEY` |
| `transit` | TMAP 대중교통 경로 | `TMAP_APP_KEY` |

> 위협 모델: Kakao **JS 키**(`VITE_KAKAO_MAP_APP_KEY`)는 지도 렌더링용으로
> 클라이언트에 노출되는 것이 **정상**입니다(도메인 allowlist 보호). 반면 Kakao
> **REST 키**와 **TMAP App 키**는 절대 클라이언트/번들/저장소에 두지 말고 함수
> 시크릿으로만 관리합니다.

```
supabase/functions/directions/
├── index.ts     # Deno Edge Function (인증 검사 + car/walk/transit 프록시 + 정규화 + CORS)
└── deno.json    # esm.sh import map (@supabase/supabase-js)
```

### 동작 방식

- **인증 필수**: 함수는 들어온 `Authorization` 베어러 JWT를 읽어 **anon 키**로
  `auth.getUser()`를 호출합니다. 유효한 로그인 사용자가 없으면 401을 반환합니다.
  (service-role 키는 사용하지 않으므로 RLS를 우회하지 않습니다.)
  클라이언트는 `supabase.functions.invoke('directions', ...)`로 호출하며,
  supabase-js가 로그인 사용자의 JWT를 **자동으로 첨부**합니다.
- **요청 계약(POST)**:
  ```json
  { "mode": "car",
    "origin": { "lat": 37.5, "lng": 127.0 },
    "destination": { "lat": 37.51, "lng": 127.0 },
    "waypoints": [{ "lat": 37.505, "lng": 127.0 }] }
  ```
  - `mode`는 선택이며 `"car" | "walk" | "transit"` 중 하나입니다. **생략하면
    `"car"`** 로 동작합니다(기존 호출과 100% 호환).
  - `waypoints`는 선택이며 **`car`(Kakao)에서만** 사용됩니다(`walk`/`transit`은 무시).
- **응답 계약(공통)**: 모든 mode가 아래 공통 형태로 정규화되어 반환됩니다.
  거리는 미터(`distanceM`), 시간은 초(`durationSec`)이며 클라이언트가 분으로 포맷합니다.
  ```json
  { "mode": "car",
    "path": [{ "lat": 37.5, "lng": 127.0 }, ...],
    "distanceM": 1200, "durationSec": 480, "fallback": false }
  ```
  - `car`/`walk`: 위 필드만 반환합니다(대중교통 전용 필드는 생략).
  - `transit`: 위 필드에 더해 환승 정보를 추가로 반환합니다.
    ```json
    { "mode": "transit",
      "path": [{ "lat": 37.5, "lng": 127.0 }, ...],
      "distanceM": 8200, "durationSec": 1740, "fallback": false,
      "legs": [
        { "mode": "WALK", "sectionTime": 180, "distance": 200,
          "startName": "출발", "endName": "성수역" },
        { "mode": "SUBWAY", "sectionTime": 1200, "distance": 7000,
          "route": "수도권 2호선", "startName": "성수역", "endName": "강남역" },
        { "mode": "WALK", "sectionTime": 360, "distance": 300,
          "startName": "강남역", "endName": "도착" }
      ],
      "fare": 1500, "transferCount": 0, "totalWalkTime": 540 }
    ```
    - `legs[]`: 구간별 요약(WALK/BUS/SUBWAY/EXPRESSBUS/TRAIN 등). UI에서 환승 내역 표시용.
    - `fare`: 일반 요금(`fare.regular.totalFare`)이 있으면 포함, 없으면 생략.
    - `transferCount`, `totalWalkTime`: 있을 때만 포함.
- **에러 처리**: 실패 시 `{ "error": "..." }`와 적절한 status를 반환하고,
  클라이언트는 직선 거리 추정(A11)으로 폴백합니다(UI 형태 불변).
  - **미설정(500)**: 해당 mode의 키가 없으면 명확히 구분된 메시지를 반환합니다
    (`... not configured (KAKAO_REST_API_KEY)` 또는 `... (TMAP_APP_KEY)`).
  - **경로 없음(422)**: 제공자가 사용 가능한 경로를 못 찾은 경우(예: 대중교통
    itinerary 없음, 너무 짧은 구간).
  - **제공자 오류(502)**: 외부 API가 비정상 응답/네트워크 오류를 낸 경우.
  - **요청 오류(400)**: 잘못된 `mode`, 좌표 누락 등.
- **CORS**: OPTIONS 프리플라이트 처리 + 적절한 CORS 헤더 설정.

### 배포 (사용자가 직접 실행)

> 아래 명령은 **사용자 본인의 로그인/연결된 Supabase CLI**가 있어야 동작합니다.
> 에이전트/CI는 사용자의 자격 증명 없이 배포할 수 없습니다.

```bash
# 1) (최초 1회) 로그인 + 원격 프로젝트 연결 — 이미 했다면 생략
supabase login
supabase link --project-ref <project-ref>

# 2) 길찾기 키를 함수 시크릿으로 등록 (커밋 금지)
#    - Kakao REST 키: Kakao 개발자 콘솔의 "기본 REST API 키(Default Rest API Key)"
#    - TMAP App 키: SK open API(TMAP) 콘솔의 앱 "appKey"
supabase secrets set KAKAO_REST_API_KEY=<Kakao REST 키>
supabase secrets set TMAP_APP_KEY=<TMAP appKey>

# 3) directions 함수 배포 (시크릿 변경 후 재배포 필요)
supabase functions deploy directions
```

> `car`만 쓸 거라면 `TMAP_APP_KEY` 없이도 동작합니다(기존과 동일). `walk`/`transit`
> 요청 시 `TMAP_APP_KEY`가 없으면 함수가 500 `... not configured (TMAP_APP_KEY)`를
> 반환하므로, 도보/대중교통을 쓰려면 위 `secrets set` + `functions deploy`를
> **반드시** 다시 실행하세요.

`SUPABASE_URL` / `SUPABASE_ANON_KEY`는 Edge Function 런타임에서 기본 제공되는
환경 변수라 따로 설정할 필요가 없습니다. (직접 시크릿으로 덮어쓰지 마세요.)

로컬 테스트:

```bash
supabase functions serve directions   # 로컬에서 함수 실행 (supabase start 필요)
```

> 검증 메모: 이 함수는 이 저장소에서 **실행/배포되지 않았습니다**(Deno 런타임·
> Supabase 로그인 부재). 코드 리뷰와 클라이언트 측 테스트로만 검증되었으며,
> 실제 배포는 위 명령으로 사용자가 직접 수행해야 합니다.

---

## 데이터 모델 / RLS 요약

| 테이블 | 용도 | 핵심 제약 |
|--------|------|-----------|
| `profiles` | auth.users 미러(표시 이름) | 본인 + 같은 투어 멤버만 조회 |
| `tours` | 투어(소유자 지정) | 멤버만 조회, 소유자만 수정/삭제 (REQ-F6) |
| `tour_members` | 멤버십/권한 | owner/member, 멤버만 조회 |
| `tour_invites` | 링크/이메일 초대 | 멤버 또는 초대 대상 이메일만 조회 |
| `spots` | 장소(좌표/반경/순서) | 멤버 추가·편집, 소유자만 삭제 (cascade) |
| `spot_menus` | 추천 메뉴 | 작성자 본인 편집, 작성자/소유자 삭제 |
| `stamps` | GPS 스탬프 | 본인만 추가, 본인/소유자만 취소·정정 |

- **재스탬프 허용 (D14)**: `stamps`에 `UNIQUE(spot_id, user_id) WHERE cancelled_at IS NULL`
  부분 유니크 인덱스를 둬, 유효 스탬프는 1건만 허용하되 취소 후 재스탬프는 허용.
- **cascade (D3)**: 투어 삭제 → 멤버/초대/장소 삭제, 장소 삭제 → 메뉴/스탬프 삭제.
- **서버 시각 (A6)**: `arrived_at`/`updated_at`은 `now()` 기본값·트리거로 서버가 기록.
  클라이언트 시각이나 원시 좌표는 저장하지 않음(NFR-GEO-006).
- **순서 재계산 (D11)**: `reorder_spots(p_tour_id uuid, p_ordered_ids uuid[])`를
  RPC로 호출하면 단일 트랜잭션으로 `order_index`를 1..N로 원자적으로 재번호화.

`reorder_spots` 호출 예시(클라이언트):

```ts
await supabase.rpc('reorder_spots', {
  p_tour_id: tourId,
  p_ordered_ids: spotIdsInNewOrder, // 해당 투어 spot id 전체, 새 방문 순서
});
```

---

## 주의 / 검증 메모

- 이 SQL은 **라이브 DB에 실행되어 검증된 것이 아니라** 코드 리뷰로만 검증되었습니다.
  실제 적용은 `supabase db reset`(로컬) 또는 `supabase db push`(원격)로 수행하세요.
- 모든 테이블은 RLS가 **활성화**되어 있고, 정책이 없는 작업은 기본 거부됩니다.
- 멤버십 검사는 RLS 재귀를 피하기 위해 `SECURITY DEFINER` 헬퍼 함수
  (`is_tour_member`, `is_tour_owner`)를 사용합니다.
