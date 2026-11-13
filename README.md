# tw-project-manager

GitHub Pages로 서비스되는 정적 사이트. 서버는 없고, 데이터는 Firebase(Firestore)에 있다.

## 주소

| 앱 | 주소 | 파일 |
|---|---|---|
| TW Project Manager | https://stellapark0201.github.io/tw-project-manager/ | `index.html` |
| Tracker | https://stellapark0201.github.io/tw-project-manager/tracker/ | `tracker/index.html` |

폴더를 요청하면 GitHub Pages가 그 안의 `index.html`을 내어준다. 그래서 주소에 파일
이름이 안 붙는다. 앱을 폴더로 두면 모두 같은 모양의 주소를 갖는다.

## 폴더 구조

```
tw-project-manager/
  index.html          TW Project Manager (한 파일 안에 화면 + 데이터 계층)
  store.js            공용 데이터 계층 — Firestore 읽기/쓰기, 병합, 로컬 캐시
  tracker/
    index.html        Tracker — 화면만. store.js를 가져다 쓴다
  tracker.html        옛 주소 → tracker/ 로 넘겨주는 안내 페이지
  .claude/launch.json 로컬 미리보기 서버 설정
```

`index.html`은 이 구조가 생기기 전에 만들어져서 화면과 데이터 계층이 한 파일에 같이
있다. 새로 만드는 앱은 `tracker/`처럼 화면만 두고 `store.js`를 쓴다.

## 데이터

Firestore 문서 하나가 앱 하나에 대응한다. 프로젝트는 같은 것을 쓰므로 Firebase 콘솔에서
새로 만들 것이 없고, `tw-pm` 컬렉션 안에 두면 기존 보안 규칙이 그대로 적용된다.

| 앱 | 문서 |
|---|---|
| TW Project Manager | `tw-pm/data` (projects, deletedProjects, opProjects, opDeletedProjects) |
| Tracker | `tw-pm/tracker` (rows, tombs) |

Tracker는 `tw-pm/data`를 **읽기만** 한다. 행에 `projectId`만 저장해 두고 이름·BU 같은
값은 그릴 때마다 찾아 쓰므로, 기존 앱에서 고친 내용이 자동으로 따라온다.

## 로컬에서 작업하기

이 폴더가 원본이고, 온라인은 여기를 올린 복사본이다. 고치고 → 확인하고 → 커밋한다.
올리기 전까지 팀원 화면은 그대로다.

```bash
python -m http.server 8765
```

열기: http://localhost:8765/ (기존 앱) · http://localhost:8765/tracker/ (Tracker)

`file://`로 파일을 직접 열어도 되지만, 브라우저가 다른 사이트로 취급해서 localStorage가
온라인과 따로 논다(페이지 제목, 네비 순서, 되돌리기, 테스트 모드). 로컬 서버를 쓰는 편이
안전하다.

### 테스트 모드 — 저장이 실행되는 테스트 전에 반드시

두 앱 모두 로컬에서 열어도 **실제 팀 데이터에 그대로 저장된다.** 값을 넣어보는 테스트를
하기 전에는 먼저 테스트 모드로 바꾼다. 이 상태에서는 `*_test` 로컬 키에만 쌓이고
Firebase에는 전혀 쓰지 않는다.

| 앱 | 켜는 법 |
|---|---|
| TW Project Manager | 콘솔에서 `toggleAdminMode()` — 주황색 "테스트 모드" 배너 확인 |
| Tracker | 오른쪽 위 `테스트` 버튼, 또는 `Store.setTestMode(true)` |

## 앱을 하나 더 만들려면

1. 폴더를 만들고 `tracker/index.html`을 복사해 온다.
2. 그 파일의 `window.STORE_APP_ID`를 새 이름으로 바꾼다. 이 한 값이 Firestore 문서
   (`tw-pm/<이름>`)와 로컬 저장 키를 함께 정한다.
3. 표의 열은 그 파일 안에서만 고친다. 행이 `id`와 `updatedAt`만 갖고 있으면
   `store.js`는 손댈 필요가 없다.
