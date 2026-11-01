# Aon 웹사이트

GitHub Pages에 공개하는 Aon 문서형 위키입니다. PC에서 실행하는 Node.js API와 SQLite에 문서·CSS·이미지 정보를 저장하고, 관리자 화면에서 GitHub에 게시하면 GitHub Pages가 공개 사이트를 갱신합니다.

## 실행 (Windows)

`run.bat`을 더블클릭하면 아래 작업을 자동으로 수행합니다.

- Node.js 22.13 이상이 없으면 `winget`으로 Node.js LTS 설치를 시도합니다. SQLite는 Node.js 내장 기능을 사용해 Visual Studio C++ 도구 설치가 필요 없습니다. 설치 완료 후 이 창에서 Node를 찾을 수 없다는 메시지가 나오면 창을 닫고 `run.bat`을 한 번 더 클릭하세요.
- `.env`가 아직 없으면 편집 키와 세션 비밀값을 자동 생성합니다. 이때 표시되는 편집 키를 저장해 두세요.
- 필요한 npm 패키지를 설치하고 서버를 시작한 뒤 브라우저에서 사이트를 엽니다. 기존 설치가 실패했더라도 다시 클릭하면 패키지 설치를 재시도합니다. 서버 로그가 표시되는 `Aon server` 창은 사이트를 사용하는 동안 열어 두세요.

직접 설정하고 실행하려면 Node.js 22.13 이상을 설치하고, 프로젝트 폴더에서 `npm install` 후 `npm start`를 실행하면 됩니다. `.env.example`을 복사해 `.env`를 만들고 비밀값을 설정할 수도 있습니다.

`.env`에서:
   - `SITE_EDIT_KEY`: 관리자용 편집 키. `.env`에만 저장하며 공개하지 마세요.
   - `SESSION_SECRET`: 32자 이상의 무작위 문자열. 예: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
   - 사용자가 지정한 `akdhs323=gayok?` 키를 쓰려면 `SITE_EDIT_KEY` 값으로 설정합니다. 공개 사이트에서는 추측하기 쉬운 키 대신 더 긴 비밀 키를 권장합니다.

사이트는 `http://localhost:3000`, 편집 화면은 `http://localhost:3000/admin.html`입니다. 편집 키는 편집 화면에서 입력합니다. 편집 API는 GitHub 토큰 보호를 위해 이 PC에서만 접속할 수 있도록 `127.0.0.1`에 바인딩됩니다.

## GitHub에 게시하기

GitHub Pages는 Node.js API나 SQLite를 실행하지 않습니다. 따라서 SQLite 데이터베이스 파일 자체를 GitHub에 올리는 대신, 관리자 화면에서 게시할 때 문서·CSS·이미지 목록을 `public/site-data.json`과 이미지 파일로 변환해 저장소에 커밋합니다. SQLite 데이터베이스와 원본 이미지는 PC의 `data/` 및 `public/uploads/`에 남습니다. GitHub Actions가 커밋을 받아 Pages 사이트를 배포합니다.

게시 기능을 켜려면:

1. GitHub에서 `aon694461` 저장소만 접근 가능한 Fine-grained personal access token을 만듭니다. `Contents: Read and write` 권한만 부여하세요.
2. PC 프로젝트의 `.env` 맨 아래에 아래 값을 추가합니다. 토큰은 채팅, 브라우저 코드, 저장소에 올리지 마세요.
   - `GITHUB_OWNER=aonhaka77-cyber`
   - `GITHUB_REPO=aon694461`
   - `GITHUB_BRANCH=main`
   - `GITHUB_TOKEN=` 뒤에 발급받은 토큰
3. `run.bat`으로 서버를 실행하고 `http://localhost:3000/admin.html`에서 로그인합니다.
4. 문서와 CSS를 각각 저장하고, 필요한 이미지를 올린 다음 **GitHub에 게시**를 누릅니다. 이미지 최대 100개, 한 번 게시하는 전체 이미지 용량은 50MB입니다.

GitHub 게시가 완료되어도 외부 사이트 반영에는 GitHub Actions 배포 시간이 추가로 필요합니다. PC API는 PC에서 실행할 때만 편집 기능을 제공합니다. 공개 페이지의 데이터는 Pages에 배포된 정적 파일을 사용하므로 PC 서버를 외부에 포트포워딩할 필요는 없습니다.

## GitHub Pages 배포

`main` 브랜치의 `public/` 파일 변경은 GitHub Actions가 GitHub Pages에 자동 배포합니다. 도메인 `aon69446.p-e.kr`은 저장소의 `CNAME` 파일에 설정되어 있습니다. 이 하위 도메인의 DNS는 A 레코드 대신 GitHub Pages의 CNAME 대상을 사용해야 합니다. 자세한 내용은 아래 DNS 절차를 따르세요.

GitHub Pages는 정적 호스팅이므로 공개 Aon 문서는 표시되지만 Node.js/SQLite API는 실행되지 않습니다. 편집은 PC에서 `run.bat`으로 실행한 서버를 통해 하고, 변경 후 GitHub에 게시합니다.

SQLite 데이터베이스는 `data/aon.sqlite`에 생성되고 이미지 파일은 `public/uploads/`에 저장됩니다. 두 위치를 정기적으로 백업하세요. `.env`의 GitHub 토큰은 비밀값이므로 외부에 공유하지 말고 저장소에 커밋하지 마세요.

## 외부 공개 및 유동 IP

현재 `aon69446.p-e.kr`은 GitHub Pages를 가리키도록 전환 중입니다. 집 서버의 공인 IP나 Deco 포트포워딩은 GitHub Pages 공개 사이트에 더 이상 사용하지 않습니다.

`aon69446.p-e.kr`은 `p-e.kr` 아래의 하위 도메인이므로, `내도메인.한국` DNS 편집 화면에서:

1. 기존 이름(호스트) 칸은 비워 둡니다.
2. 해당 이름에 체크된 A 레코드를 해제/삭제합니다. 같은 이름에는 A와 CNAME을 함께 둘 수 없습니다.
3. CNAME 레코드를 체크하고 대상 값에 `aonhaka77-cyber.github.io`를 입력합니다.
4. 다른 이름의 레코드는 건드리지 말고 저장합니다.

GitHub Pages는 DNS에서 잘못된 A 레코드가 남아 있으면 인증서를 발급하지 못할 수 있습니다. 확인 명령은 `nslookup -type=CNAME aon69446.p-e.kr`이며, 결과가 `aonhaka77-cyber.github.io`여야 합니다. DNS 변경 전파 및 GitHub HTTPS 인증서 발급에는 시간이 걸릴 수 있습니다. HTTPS가 브라우저에서 정상 확인되기 전에는 편집 키나 다른 비밀 정보를 입력하지 마세요.

이 웹사이트는 `.github/workflows/pages.yml`을 통해 `main` 브랜치의 `public/`을 자동으로 게시합니다. `public/site-data.json`과 `public/uploads/`는 게시 시 로컬 SQLite 데이터 및 이미지에서 생성·갱신됩니다.
