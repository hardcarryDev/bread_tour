# 빵투어 (bread-tour)

친구들과 함께 빵집·음식점을 정해진 순서로 방문하며 GPS 디지털 스탬프를 모으는 스탬프 랠리 웹 앱입니다. 투어를 만들고, 멤버를 초대하고, 지도에서 장소를 추가하면 팀이 실시간으로 공동 편집하며 각 장소를 방문할 수 있습니다. 모바일 우선 반응형 웹 전용으로 설계되어 있습니다.

---

## 주요 기능

**인증**
- Supabase Auth 이메일+비밀번호 회원가입/로그인
- 회원가입 시 표시 이름 지정, `/profile` 페이지에서 이름 변경

**투어**
- 투어 생성(소유자), 초대 링크로 멤버 초대·수락
- 소유자/멤버 권한 구분 (장소 삭제·멤버 내보내기는 소유자만)
- Supabase Realtime 기반 실시간 공동 편집 + 접속 중인 멤버 표시

**장소**
- Kakao Maps 지도 클릭 또는 키워드 검색으로 좌표 지정
- 종류 선택 + "종류 추가" 버튼으로 투어별 종류 목록을 직접 확장 (기본: 빵집·음식점)
- 번호 마커 + 연결선으로 방문 순서 표시, 드래그 순서 변경
- **내기준정렬**: 현재 위치 기준 거리 가까운 순 정렬 (로컬 뷰, 공유 순서 미변경)

**메뉴 추천**
- 멤버가 장소별 추천 메뉴 입력, 다중 작성자 표시
- 메뉴 사진 첨부 및 인앱 전체화면 이미지 뷰어(스와이프·키보드·줌-투-핏)

**정산 (Dutch-pay)**
- 장소별 금액·결제자·참여자 입력 → 1/N 균등 분담 자동 계산
- 각 참여자가 결제자에게 보냈는지 개별 체크 (보냄 / 정산 완료)
- 투어 전체 정산 요약: 미정산 잔액 + 권장 이체 안내

**GPS 스탬프**
- 장소 반경 내 체류 시간(dwell-time) 충족 시 자동 스탬프
- 정확도 게이트: 정확도 미달 시 스탬프 보류 후 재시도
- 스탬프 취소 및 재스탬프 지원
- 수동 체크인: 위치 권한 거부 시 다른 멤버가 확인 후 스탬프 기록
- 내 위치 실시간 지도 표시 (인메모리, 미저장)

**길찾기**
- 도보 / 대중교통 / 차 3가지 이동 수단 선택
  - 차: Kakao Mobility REST API
  - 도보·대중교통: TMAP API
- Supabase Edge Function 프록시로 REST 키를 서버에서만 관리
- 길찾기 실패 시 직선 거리 추정으로 폴백 (지도 화면 유지)

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 19, TypeScript 5.7, Vite 6, react-router-dom 7 |
| 테스트 | Vitest 3 (pool: forks), @testing-library/react 16 |
| 백엔드/DB | Supabase (PostgreSQL + RLS + Realtime + Auth + Edge Functions) |
| 지도 | Kakao Maps JavaScript SDK |
| 길찾기 | Kakao Mobility REST API (차), TMAP API (도보·대중교통) |
| 배포 | GitHub Pages (GitHub Actions) |

---

## 로컬 개발

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 만들고 아래 세 변수를 채웁니다.

```
VITE_SUPABASE_URL=<Supabase 프로젝트 URL>
VITE_SUPABASE_ANON_KEY=<Supabase anon 키>
VITE_KAKAO_MAP_APP_KEY=<Kakao Maps JavaScript 앱 키>
```

로컬 Supabase 스택을 사용하는 경우 `supabase start` 출력값을 사용합니다.

### 3. 개발 서버 실행

```bash
npm run dev
# http://localhost:5173
```

> GPS 자동 스탬프와 Kakao Maps는 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작합니다.

### 4. 테스트

```bash
npm test          # 1회 실행
npm run test:watch  # 감시 모드
```

### 5. 빌드

```bash
npm run build     # dist/ 생성 + postbuild(404.html 복사)
npm run preview   # 빌드 결과 로컬 미리보기
```

---

## 백엔드 설정

자세한 내용은 [supabase/README.md](supabase/README.md)를 참조하세요.

**마이그레이션 적용 (클라우드)**

```bash
# supabase/ALL_MIGRATIONS.sql 을 Supabase 대시보드 SQL 에디터에서 실행하거나:
supabase link --project-ref <project-ref>
supabase db push
```

**Edge Function 배포 (길찾기)**

```bash
# REST 키를 함수 시크릿으로 등록
supabase secrets set KAKAO_REST_API_KEY=<Kakao REST 키>
supabase secrets set TMAP_APP_KEY=<TMAP appKey>

# 함수 배포
supabase functions deploy directions
```

---

## 배포

GitHub Pages 배포 절차는 [DEPLOY.md](DEPLOY.md)를 참조하세요.

배포 후 반드시 [Kakao Developers 콘솔](https://developers.kakao.com)에서
배포 URL(`https://<사용자명>.github.io`)을 **사이트 도메인 허용 목록**에 추가해야 지도가 정상 동작합니다.

---

## 보안 메모

| 키 종류 | 노출 범위 | 보호 수단 |
|---------|----------|-----------|
| `VITE_SUPABASE_ANON_KEY` | 클라이언트 번들에 포함 (정상) | Supabase RLS |
| `VITE_KAKAO_MAP_APP_KEY` | 클라이언트 번들에 포함 (정상) | Kakao 도메인 허용 목록 |
| `KAKAO_REST_API_KEY` | Edge Function 시크릿만 | 서버 전용 |
| `TMAP_APP_KEY` | Edge Function 시크릿만 | 서버 전용 |

`service-role` 키 등 서버 전용 비밀키는 절대 클라이언트나 저장소에 포함하지 마세요.
