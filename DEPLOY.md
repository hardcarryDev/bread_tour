# GitHub Pages 배포 가이드

bread-tour 프런트엔드(Vite + React SPA)를 GitHub Actions로 GitHub Pages에 배포하는 절차입니다.
백엔드는 이미 호스팅된 Supabase + 배포된 Edge Function 이므로, 프런트엔드는 순수 정적 빌드만 올리면 됩니다.

배포가 끝나면 접속 주소는 다음과 같습니다:

```
https://<사용자명>.github.io/<저장소명>/
```

---

## 동작 원리 (base / basename / 404 의 관계)

GitHub Pages 프로젝트 사이트는 `/<저장소명>/` 하위 경로에서 서비스됩니다. 세 가지 설정이 맞물려 동작합니다.

- **base** (`vite.config.ts`): `process.env.BASE_PATH || '/'`. GitHub Actions 가 빌드 시
  `BASE_PATH=/<저장소명>/` 을 주입합니다. 로컬 개발은 환경변수가 없으므로 `'/'` 가 됩니다.
  저장소 이름은 워크플로의 `${{ github.event.repository.name }}` 로 자동 주입되므로 **하드코딩하지 않습니다.**
- **basename** (`src/App.tsx`): `<BrowserRouter basename={import.meta.env.BASE_URL}>`.
  `BASE_URL` 은 위 `base` 에서 파생되는 값(로컬 `'/'`, Pages `'/<저장소명>/'`)이라
  하위 경로 환경에서도 라우팅이 올바르게 동작합니다.
- **404 폴백** (`scripts/spa-404.mjs`): GitHub Pages 는 서버 리라이트가 없어서, 딥링크
  (예: `/<저장소명>/tours/123`) 로 직접 진입하면 알 수 없는 경로로 보고 `404.html` 을 반환합니다.
  빌드 후 `dist/index.html` 을 `dist/404.html` 로 복사해 두면, 404 응답으로 SPA 셸이 그대로
  로드되고 BrowserRouter 가 클라이언트에서 라우트를 처리합니다. 이 복사는 `npm run build` 의
  `postbuild` 단계에서 자동 실행됩니다.

> 공개 클라이언트 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_KAKAO_MAP_APP_KEY)는
> 빌드 시점에 번들에 포함됩니다. REST/TMAP 키 등 서버용 비밀키는 Edge Function 에만 있으며
> 클라이언트에 절대 포함되지 않습니다.

---

## 1단계 — GitHub 저장소 생성 (웹 UI)

1. https://github.com/new 접속
2. **Repository name** 입력 (예: `bread_tour`). 이 이름이 곧 배포 URL 의 `<저장소명>` 이 됩니다.
3. Public / Private 중 선택 (Private 도 GitHub Pages 사용 가능)
4. README, .gitignore, license 는 **추가하지 않음** (이미 로컬에 파일이 있음)
5. **Create repository** 클릭

## 2단계 — 로컬 코드 푸시

프로젝트 루트(`c:\coding\bread_tour`)에서 아래 명령을 실행합니다.
`<사용자명>` 과 `<저장소명>` 은 본인 값으로 바꿔 주세요.

```bash
git init
git add .
git commit -m "chore: initial commit with GitHub Pages deploy workflow"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

> `.env.local`(실제 키 포함)은 `.gitignore` 에 의해 커밋되지 않습니다. 푸시 전
> `git status` 로 `.env.local`, `node_modules/`, `dist/` 가 목록에 없는지 확인하세요.

## 3단계 — 저장소 Variables 등록 (공개 클라이언트 키)

빌드 시 번들에 들어갈 3개의 공개 환경변수를 등록합니다. (비밀키가 아니므로 Secrets 가 아닌 **Variables** 에 넣습니다.)

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. **Variables** 탭 → **New repository variable** 로 아래 3개를 각각 추가:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | 로컬 `.env.local` 의 `VITE_SUPABASE_URL` 값 |
| `VITE_SUPABASE_ANON_KEY` | 로컬 `.env.local` 의 `VITE_SUPABASE_ANON_KEY` 값 |
| `VITE_KAKAO_MAP_APP_KEY` | 로컬 `.env.local` 의 `VITE_KAKAO_MAP_APP_KEY` 값 |

> 값은 모두 `.env.local` 에서 그대로 복사하면 됩니다. 이 세 키는 공개(anon/JS SDK)용이라 노출되어도 안전합니다.

## 4단계 — GitHub Pages 활성화

1. GitHub 저장소 → **Settings** → **Pages**
2. **Build and deployment** → **Source** 를 **GitHub Actions** 로 선택
   (정적 브랜치 방식 아님 — 워크플로가 직접 배포합니다.)

이후 `main` 브랜치로 푸시할 때마다 `.github/workflows/deploy.yml` 이 실행되어 자동 배포됩니다.
수동 실행은 **Actions** 탭 → **Deploy to GitHub Pages** → **Run workflow** 로 가능합니다.

## 5단계 — 첫 배포 후 Kakao 도메인 등록 (필수)

첫 배포가 완료되면 배포 URL 은 다음과 같습니다:

```
https://<사용자명>.github.io/<저장소명>/
```

이 URL(도메인)을 **Kakao JS SDK 사이트 도메인 허용 목록**에 추가해야 지도가 정상 동작합니다.

1. https://developers.kakao.com → 내 애플리케이션 → 해당 앱 선택
2. **앱 설정** → **플랫폼** → **Web** → **사이트 도메인** 에
   `https://<사용자명>.github.io` 추가 후 저장
3. (Kakao 는 도메인 단위로 검증하므로 `https://<사용자명>.github.io` 까지만 등록하면 됩니다.)

> 이 단계를 건너뛰면 지도 SDK 가 도메인 검증에 실패하여 지도가 깨집니다.

## 참고 — Edge Function CORS

Edge Function 의 CORS 는 이미 `*` 로 설정되어 있으므로, GitHub Pages 도메인에서 길찾기 등
크로스 오리진 호출이 그대로 동작합니다. 별도 설정은 필요 없습니다.

---

## 로컬 확인 명령 (선택)

```bash
# 하위 경로 빌드 검증 (CI 와 동일한 base)
BASE_PATH=/<저장소명>/ npm run build
# -> dist/404.html 생성, dist/index.html 의 asset 경로가 /<저장소명>/assets/... 인지 확인

# 기본 빌드 (로컬/루트 배포, base '/')
npm run build

# 개발 서버
npm run dev
```
