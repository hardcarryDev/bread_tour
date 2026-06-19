# 빵투어 (bread tour)

친구들과 함께 빵집·음식점을 정해진 순서로 방문하며 GPS로 디지털 스탬프를 모으는
스탬프 랠리 웹 애플리케이션입니다. (SPEC-BREADTOUR-001)

- 기술 스택: React 19 + TypeScript + Vite
- 지도/길찾기: Kakao Maps JavaScript SDK
- 백엔드/실시간/인증: Supabase (PostgreSQL + Realtime + Auth)
- 모바일 우선(모바일 반응형) 웹 전용

> 이 저장소는 현재 **프로젝트 골격(foundation)** 단계입니다. 실제 기능(F1~F6)은
> 이후 단계에서 구현됩니다.

## 사전 준비물

- Node.js 20 이상 (권장)
- npm
- Supabase 프로젝트 (URL, anon key)
- Kakao Developers 앱 (JavaScript 키, 도메인 허용 설정)

## 설치

```bash
npm install
```

## 환경 변수 설정

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

필요한 변수:

| 변수 | 설명 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon(공개) 키 |
| `VITE_KAKAO_MAP_APP_KEY` | Kakao Maps JavaScript 앱 키 |

> 보안 참고: Supabase anon key와 Kakao JS key는 **클라이언트에 노출되는 공개 키**
> 입니다(SPEC NFR-SEC). 데이터 보안은 키 은닉이 아니라 Supabase RLS와 Kakao 도메인
> 허용 설정에 의존합니다. 다만 값은 반드시 env로 주입해야 하며 소스에 하드코딩하지
> 않습니다. service-role key 등 서버 전용 비밀은 절대 넣지 마세요. `.env`는
> gitignore 되어 있습니다.

## 개발 서버 실행

```bash
npm run dev
```

> GPS 자동 스탬프와 Kakao Maps는 보안 컨텍스트(HTTPS 또는 localhost)에서만
> 동작합니다.

## 테스트

```bash
npm test          # 1회 실행
npm run test:watch
```

## 린트 / 포맷

```bash
npm run lint
npm run format
```

## 빌드 / 미리보기

```bash
npm run build
npm run preview
```

## 폴더 구조

```
src/
  lib/          # 외부 서비스 클라이언트 (supabase.ts, kakao.ts)
  types/        # 타입 정의 (database.ts, kakao.d.ts)
  features/     # 기능별 모듈 (F1~F6)
    stamp/        # F1 GPS 스탬프
    directions/   # F2 길찾기
    map/          # F3 지도 순서 표시
    menu/         # F4 메뉴 추천
    collab/       # F5 실시간 공동 편집
    tour/         # F6 투어 생명주기/권한
  components/   # 공용 UI 컴포넌트
  hooks/        # 공용 커스텀 훅
  pages/        # 라우트 페이지
```
