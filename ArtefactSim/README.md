# Artefact Sim

WRO 2026 RoboMission Junior(Heritage Heroes)용 브라우저 시뮬레이터입니다. 설치 없이 링크만 열면 쓸 수 있습니다.

이 프로그램은 **정적 웹 앱**입니다. 서버 코드나 로그인이 없고, 로봇·프로그램은 각 브라우저의 저장소에만 남습니다.

## 다른 사람에게 쓰는 방법

1. **웹으로 공유 (추천)**  
   GitHub에 올린 뒤 GitHub Pages를 켜면 `https://<계정>.github.io/<저장소>/` 주소로 누구나 접속합니다. 아래 [GitHub Pages](#github-pages)를 보세요.
2. **폴더로 공유**  
   이 폴더 전체를 압축해 보내면, Windows는 `start.bat`, macOS/Linux는 `start.sh`를 실행합니다. Python 3가 필요합니다. 주소는 `http://127.0.0.1:8765/index.html` 입니다.  
   `index.html`을 파일로 더블클릭하면 모듈 로딩이 막히므로, 반드시 로컬 서버(`start.bat` / `start.sh`)로 여세요.

## 화면 구성

- **제작**: 차체·집게·그리퍼
- **프로그램**: 블록/텍스트 (미션·시뮬레이션이 같은 코드를 씀)
- **미션**: 한 배치 실행, 배속 1–200×
- **시뮬레이션**: 같은 프로그램을 120가지 발굴 배치에 대해 실행
- **AI**: 규칙이 붙은 프롬프트 복사

예제 프로그램은 `four_carry.txt`, `collect_all.txt`를 프로그램 탭(텍스트가 원본)에 붙여 넣으면 됩니다.

## GitHub Pages

저장소 루트에 `index.html`이 있으므로 Pages 소스를 브랜치 `main` / 폴더 `/` 로 두거나, 포함된 GitHub Actions(`Deploy GitHub Pages`)를 쓰면 됩니다.

1. GitHub에서 New repository (Public)
2. 이 폴더에서:

```bash
git init -b main
git add -A
git commit -m "Publish Artefact Sim"
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

3. 저장소 **Settings → Pages**
   - Source: **GitHub Actions** (이 저장소의 워크플로 사용)
   - 또는 Deploy from a branch: `main` / `/ (root)`
4. 첫 배포 후 주소: `https://<계정>.github.io/<저장소>/`

Actions를 쓰려면 저장소 Settings → Actions → General에서 워크플로를 허용해야 할 수 있습니다.

## 로컬 실행

Windows: `start.bat`  
macOS / Linux: `chmod +x start.sh && ./start.sh`

포트 8765가 이미 쓰이면 그 창을 닫거나 `start.bat`의 `PORT`를 바꾸세요.
