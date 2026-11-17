/* ──────────────────────────────────────────────────────────────────────────
   board.js — 보드 화면. Weekly Focus 와 Completed Project 가 같이 쓴다.

   페이지마다 다른 것은 이름뿐이라, HTML 쪽은 설정 몇 줄이 전부다. 화면과
   동작이 전부 여기 있으니 한쪽만 고쳐져 둘이 달라지는 일이 없다.

       <script>
         window.STORE_APP_ID = 'completed';     // Firestore 문서 tw-pm/completed
         window.STORE_LOG_FIELDS = ['thisWeek','nextWeek','due'];
         window.BOARD_TITLE = 'Completed Project';
         window.BOARD_LABEL = 'Completed';
       </script>
       <script src="../store.js"></script>
       <script src="../board.js"></script>

   ⚠ 이 파일을 고치면 각 페이지 HTML의 ?v=… 값을 올려야 한다.
     GitHub Pages가 js를 10분 캐시해서, 그냥 올리면 사람들이 예전 화면을 본다.

   보드를 하나 더 만들려면 폴더와 그 설정을 만들고 아래 PAGES에 한 줄만
   추가한다. 그러면 이동하기 메뉴의 가기·옮기기 목록에 바로 나타난다.
   ────────────────────────────────────────────────────────────────────────── */

const BOARD_TITLE = window.BOARD_TITLE || 'Board';
const BOARD_LABEL = window.BOARD_LABEL || BOARD_TITLE;

/* 스타일과 마크업도 이 파일이 들고 있다 (HTML은 껍데기만) */
(function injectBoard() {
  const style = document.createElement('style');
  style.textContent = `
  :root {
    --bg: #f4f4f4; --surface: #ffffff; --surface-2: #f8f8f8;
    --border: #e0e0e0; --border-subtle: #ebebeb;
    --text-primary: #161616; --text-secondary: #6f6f6f; --text-muted: #a8a8a8;
    --accent: #0f62fe; --accent-light: #edf3ff;
    --header-bg: #161616; --navy: #1f3864; --crimson: #c00000;
    --green: #198038; --amber: #b45309; --red: #da1e28; --red-light: #fff1f1;
    --shadow-lg: 0 8px 28px rgba(0,0,0,0.14);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text-primary);
    font-family: 'Segoe UI', 'Malgun Gothic', system-ui, sans-serif; font-size: 13px;
  }

  header {
    background: var(--header-bg); color: #fff; padding: 0 20px; height: 46px;
    display: flex; align-items: center; gap: 12px;
  }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; letter-spacing: 0.2px; }
  header .doc { font-size: 11px; color: rgba(255,255,255,0.45); }
  header .spacer { flex: 1; }
  #syncStatus { font-size: 11.5px; color: rgba(255,255,255,0.75); }
  #syncStatus.ok { color: #6ee7a8; } #syncStatus.warn { color: #fbbf24; } #syncStatus.err { color: #fca5a5; }
  #meBadge {
    width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
    font-family: inherit; font-size: 11px; font-weight: 700; color: #fff; background: #8b5cf6;
  }
  #meBadge.unset { background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); }
  .mode-btn {
    font-family: inherit; font-size: 11px; cursor: pointer; background: transparent;
    color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.25);
    border-radius: 11px; padding: 3px 10px;
  }
  .mode-btn.on { background: #f59e0b; border-color: #f59e0b; color: #161616; font-weight: 600; }

  /* ── 보드 탭 (기존 앱의 Active Projects / Operational Tasks 와 같은 자리) ── */
  .board-nav {
    background: var(--header-bg); display: flex; align-items: stretch;
    padding: 0 20px; gap: 2px; border-top: 1px solid rgba(255,255,255,0.08);
  }
  .board-nav a {
    display: inline-flex; align-items: center; gap: 7px; padding: 0 16px; height: 38px;
    font-size: 13px; color: rgba(255,255,255,0.45); text-decoration: none;
    border-bottom: 2px solid transparent; transition: color 0.12s;
  }
  .board-nav a:hover { color: rgba(255,255,255,0.8); }
  .board-nav a.on { color: #fff; font-weight: 600; border-bottom-color: var(--accent); }

  .container { max-width: 1340px; margin: 0 auto; padding: 18px 20px 40px; }

  /* ── 제목 줄 + 페이지 네비 ── */
  .title-row { display: flex; align-items: center; gap: 16px; margin: 0 0 14px; position: relative; }
  .title-row h2 { font-size: 23px; font-weight: 500; margin: 0; letter-spacing: -0.3px; }
  .page-nav { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); display: flex; align-items: center; gap: 4px; }
  .page-nav-arrow, .nav-home {
    font-family: inherit; font-size: 13px; cursor: pointer; background: var(--surface);
    border: 1px solid var(--border); border-radius: 5px; color: var(--text-secondary);
    width: 30px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
  }
  .page-nav-arrow:hover, .nav-home:hover { border-color: var(--accent); color: var(--accent); }
  .page-nav-dots { display: flex; gap: 3px; }
  .nav-dot {
    min-width: 26px; height: 26px; padding: 0 7px; font-size: 11.5px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
    border: 1px solid var(--border); border-radius: 5px;
    background: var(--surface); color: var(--text-muted);
  }
  .nav-dot:hover { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
  .nav-dot.active { background: var(--accent); border-color: var(--accent); color: #fff; }

  /* ── 아이콘 줄 ── */
  .tool-row { display: flex; align-items: center; gap: 10px; margin: 0 0 12px 2px; }
  .tool-row .label { font-size: 18px; font-weight: 600; color: var(--text-secondary); margin: 0; letter-spacing: -0.2px; }
  .icon-btn {
    background: none; border: none; cursor: pointer; color: var(--text-muted);
    padding: 4px 6px; border-radius: 6px; display: flex; align-items: center; gap: 3px;
    transition: all 0.13s; font-family: inherit;
  }
  .icon-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text-secondary); }
  .icon-btn:disabled { opacity: 0.35; cursor: default; }
  .icon-btn .n { font-size: 12px; font-weight: 600; }
  .icon-btn.del { color: var(--red); }
  .icon-btn.del:hover:not(:disabled) { background: var(--red-light); color: var(--red); }

  /* ── 필터 칩 줄 ── */
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip {
    font-family: inherit; font-size: 11.5px; cursor: pointer; padding: 5px 13px;
    border-radius: 13px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text-muted);
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }

  /* ── 표 ── */
  .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th {
    background: var(--navy); color: #fff; font-size: 12px; font-weight: 600;
    padding: 9px 10px; text-align: center; border-right: 1px solid rgba(255,255,255,0.15);
  }
  thead th:last-child { border-right: none; }
  tbody td {
    border-bottom: 1px solid var(--border-subtle); border-right: 1px solid var(--border-subtle);
    padding: 0; vertical-align: middle;
  }
  tbody td:last-child { border-right: none; }
  tbody tr:hover { background: var(--surface-2); }
  tbody tr.sel { background: var(--accent-light); }
  tbody tr.hot td, tbody tr.hot .cell-input { color: var(--crimson); font-weight: 600; }
  /* ON HOLD / deprioritized — 기존 앱처럼 행을 흐리게 하고 맨 아래로 내린다 */
  tbody tr.row-dimmed .cell-input, tbody tr.row-dimmed .task-cell .nm,
  tbody tr.row-dimmed .log-cell .txt { color: var(--text-muted); }
  .badge-hold {
    display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: .5px;
    color: #ef4444; flex-shrink: 0; white-space: nowrap;
  }
  .badge-deprioritized {
    display: inline-block; font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive;
    font-size: 12px; font-style: italic; font-weight: 600; letter-spacing: .2px;
    color: var(--text-muted); flex-shrink: 0; white-space: nowrap;
  }
  tbody tr.dragging { opacity: 0.4; }
  tbody tr.drop-above td { box-shadow: inset 0 2px 0 0 var(--accent); }
  tbody tr.drop-below td { box-shadow: inset 0 -2px 0 0 var(--accent); }

  /* 행 앞 아이콘 묶음 — ⠿ 드래그 / 체크 / 상세 / 메모 */
  .lead { display: flex; align-items: center; justify-content: center; gap: 3px; padding: 5px 4px; }
  .lead input[type=checkbox] { width: 14px; height: 14px; accent-color: var(--accent); cursor: pointer; margin: 0; }
  .drag-handle {
    cursor: grab; color: var(--border); font-size: 13px; line-height: 1;
    user-select: none; padding: 0 1px;
  }
  .drag-handle:hover { color: var(--accent); }
  .drag-handle:active { cursor: grabbing; }
  .btn-icon {
    background: none; border: none; cursor: pointer; color: var(--accent);
    padding: 2px; border-radius: 4px; line-height: 0;
  }
  .btn-icon:hover { background: var(--accent-light); }
  .btn-icon.muted { color: var(--text-muted); }
  .btn-icon.muted:hover { color: var(--accent); }
  .btn-icon.has-memo { color: #f59e0b; }

  .cell-input {
    font-family: inherit; font-size: 12.5px; color: inherit; width: 100%;
    border: 1px solid transparent; border-radius: 4px; padding: 8px 7px; background: transparent;
  }
  .cell-input:hover { border-color: var(--border); }
  .cell-input:focus { outline: none; border-color: var(--accent); background: #fff; }
  .cell-owner { text-align: center; font-weight: 600; }

  .task-cell { display: flex; align-items: center; gap: 6px; padding: 0 6px; }
  .task-cell .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .task-cell .nm.none { color: var(--text-muted); }
  .task-cell .bu, .task-cell .new {
    font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 8px;
    background: var(--accent-light); color: var(--accent); flex-shrink: 0;
  }
  .task-cell .new { background: #fee2e2; color: var(--crimson); }

  .log-cell {
    display: flex; align-items: center; gap: 6px; cursor: pointer;
    padding: 8px; min-height: 36px; border: 1px solid transparent; border-radius: 4px;
  }
  .log-cell:hover { border-color: var(--accent); background: #fff; }
  .log-cell .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log-cell .txt.none { color: var(--text-muted); font-weight: 400; }
  .log-cell .cnt {
    font-size: 10px; font-weight: 600; color: var(--text-muted);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 0 5px; flex-shrink: 0;
  }

  /* 표 맨 아래 ＋ 한 줄 */
  .add-row td { text-align: left; padding: 0; }
  .btn-add-row {
    background: none; border: none; cursor: pointer; color: var(--accent);
    font-size: 17px; line-height: 1; padding: 7px 0 7px 26px; font-family: inherit;
    display: block; min-width: 112px; text-align: left;
  }
  .btn-add-row:hover { background: var(--accent-light); }

  .empty { padding: 36px; text-align: center; color: var(--text-muted); }
  .count { font-size: 11.5px; color: var(--text-muted); margin: 9px 2px 0; }

  /* ── 연결된 프로젝트의 체크리스트 ── */
  .cl-stage { margin-bottom: 10px; }
  .cl-stage-head { font-size: 11px; font-weight: 600; color: var(--text-muted); margin: 0 0 4px; }
  .cl-item {
    display: flex; align-items: center; gap: 7px; padding: 5px 7px; font-size: 12.5px;
    border: 1px solid var(--border-subtle); border-radius: 5px; margin-bottom: 3px; cursor: pointer;
  }
  .cl-item:hover { border-color: var(--accent); }
  .cl-item input { width: auto; margin: 0; accent-color: var(--accent); }
  .cl-item span { flex: 1; min-width: 0; }
  .cl-item.done span { color: var(--text-muted); text-decoration: line-through; }
  .cl-item.pb { background: #fffbeb; border-color: #fcd34d; }
  .cl-item em { font-style: normal; font-size: 10px; font-weight: 700; color: var(--amber); }

  /* ── Request 패널 ── */
  #requestPanel {
    position: fixed; top: 72px; right: 24px; z-index: 900; width: 310px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    box-shadow: var(--shadow-lg); padding: 16px;
  }
  .req-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .req-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
  #requestPanel .field { margin-bottom: 12px; }
  #requestPanel label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
  #requestPanel input, #requestPanel textarea {
    width: 100%; font-family: inherit; font-size: 13px; padding: 7px 10px;
    border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
  }
  #requestPanel input:focus, #requestPanel textarea:focus { outline: none; border-color: var(--accent); }
  #requestPanel textarea { resize: vertical; }
  .req-label { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
  .req-meta { font-size: 11px; color: var(--text-muted); min-height: 16px; margin-bottom: 8px; }
  .req-checks { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; }
  .req-person {
    display: flex; align-items: center; gap: 10px; padding: 11px 13px;
    border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2);
    font-size: 12.5px; color: var(--text-muted);
  }
  .req-person.mine { border-color: var(--accent); background: var(--surface); cursor: pointer; color: var(--text-primary); }
  .req-person.mine:hover { background: var(--accent-light); }
  .req-person.done { color: var(--green); }
  .req-person .av {
    width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; background: var(--border); color: var(--surface);
  }
  .req-person .av.me { background: var(--accent); color: #fff; }
  .req-person .av.on { background: var(--green); color: #fff; }
  .req-person .txt { flex: 1; min-width: 0; }
  .req-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
  .req-row .done { color: var(--green); font-size: 11px; }
  .req-row button {
    margin-left: auto; font-family: inherit; font-size: 11px; cursor: pointer;
    border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
    border-radius: 11px; padding: 2px 9px;
  }
  .req-row button:hover { border-color: var(--accent); color: var(--accent); }

  /* ── 이동하기 메뉴 ── */
  #movePop {
    position: absolute; z-index: 1300; min-width: 256px; max-width: 330px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: var(--shadow-lg); padding: 10px 11px 9px; font-size: 13px;
  }
  .move-head {
    font-size: 12px; font-weight: 600; padding-bottom: 7px; margin-bottom: 7px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .move-label { font-size: 11px; color: var(--text-muted); margin: 0 0 5px; }
  .move-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 9px; }
  .move-chip {
    font-family: inherit; font-size: 12px; cursor: pointer; padding: 3px 9px; border-radius: 11px;
    border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
  }
  .move-chip:hover:not(:disabled) { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
  .move-chip.is-current { opacity: 0.4; cursor: default; }
  .move-item {
    display: block; width: 100%; text-align: left; font-family: inherit; font-size: 12.5px;
    cursor: pointer; padding: 7px 9px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text-secondary); margin-bottom: 4px;
  }
  .move-item:hover { background: var(--accent-light); border-color: var(--accent); color: var(--accent); }
  .move-note { font-size: 10.5px; line-height: 1.5; color: var(--text-muted); margin-top: 8px; }
  .move-sep { border-top: 1px solid var(--border-subtle); margin: 9px -11px 8px; }

  /* ── Deleted Tasks ── */
  .deleted-section { margin-top: 26px; }
  .deleted-head {
    display: flex; align-items: center; gap: 9px; cursor: pointer;
    padding: 8px 2px; border-bottom: 1px solid var(--border); margin-bottom: 10px;
  }
  .deleted-head h3 { font-size: 15px; font-weight: 600; color: var(--text-secondary); margin: 0; }
  .chev {
    background: none; border: none; cursor: pointer; color: var(--text-muted);
    font-size: 11px; padding: 0 2px; transition: transform 0.15s;
  }
  .chev.closed { transform: rotate(-90deg); }
  .del-count { display: inline-flex; align-items: center; gap: 3px; color: var(--red); font-size: 12px; font-weight: 600; }
  .del-count svg { width: 16px; height: 16px; }
  .deleted-section .btn { font-size: 11.5px; padding: 4px 11px; color: var(--text-muted); }
  .deleted-section .btn:hover { border-color: var(--accent); color: var(--accent); }
  .deleted-section .btn.danger { color: var(--red); }
  .deleted-section .btn.danger:hover { border-color: var(--red); background: var(--red-light); }
  .del-row {
    display: flex; align-items: center; gap: 9px; padding: 8px 10px; font-size: 12.5px;
    border: 1px solid var(--border-subtle); border-radius: 6px; margin-bottom: 4px;
    background: var(--surface); color: var(--text-secondary);
  }
  .del-row .nm2 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .del-row .when { font-size: 10.5px; color: var(--text-muted); white-space: nowrap; }
  .del-lead { gap: 4px; }
  .del-lead .btn { font-size: 10.5px; padding: 3px 7px; }
  .cell-ro { padding: 8px 7px; font-size: 12.5px; }
  .cell-ro .cnt {
    font-size: 10px; font-weight: 600; color: var(--text-muted);
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 0 5px;
  }
  .task-cell .when { font-size: 10.5px; color: var(--text-muted); white-space: nowrap; }
  .trash-note {
    background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412;
    border-radius: 6px; padding: 8px 10px; font-size: 11.5px; margin-bottom: 14px;
  }
  .del-empty { color: var(--text-muted); font-size: 12.5px; padding: 10px 2px; }

  /* ── 이력 팝업 ── */
  #logPop {
    position: absolute; z-index: 60; width: 380px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow-lg); padding: 12px;
  }
  #logPop h3 { margin: 0 0 2px; font-size: 13px; font-weight: 600; }
  #logPop .sub { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }
  .log-add { display: flex; gap: 6px; margin-bottom: 10px; }
  .log-add input {
    flex: 1; font-family: inherit; font-size: 12.5px; padding: 7px 9px;
    border: 1px solid var(--border); border-radius: 5px;
  }
  .log-add input:focus { outline: none; border-color: var(--accent); }
  .log-list { max-height: 260px; overflow-y: auto; }
  .log-item {
    display: flex; align-items: flex-start; gap: 8px; padding: 7px 2px;
    border-top: 1px solid var(--border-subtle); font-size: 12.5px;
  }
  .log-item:first-child { border-top: none; }
  .log-item.newest .t { font-weight: 600; }
  .log-item .t { flex: 1; min-width: 0; word-break: break-word; }
  .log-item .meta { font-size: 10.5px; color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
  .log-item .del {
    background: none; border: none; cursor: pointer; color: var(--text-muted);
    font-size: 14px; line-height: 1; padding: 0 2px; flex-shrink: 0;
  }
  .log-item .del:hover { color: var(--red); }
  .log-empty { color: var(--text-muted); font-size: 12px; padding: 10px 2px; }

  /* ── 오른쪽 패널 (상세 / 수정 이력 공용) ── */
  .side {
    position: fixed; top: 0; right: 0; width: 390px; height: 100%; background: var(--surface);
    border-left: 1px solid var(--border); box-shadow: var(--shadow-lg); padding: 20px;
    overflow-y: auto; transform: translateX(100%); transition: transform 0.18s ease; z-index: 50;
  }
  .side.open { transform: translateX(0); }
  .side h2 { font-size: 15px; margin: 0 0 2px; font-weight: 600; }
  .side .sub { font-size: 11px; color: var(--text-muted); margin-bottom: 18px; }
  .side label { display: block; font-size: 11px; color: var(--text-muted); margin: 0 0 4px; }
  .side .field { margin-bottom: 14px; }
  .side input, .side select, .side textarea {
    font-family: inherit; font-size: 13px; width: 100%;
    border: 1px solid var(--border); border-radius: 5px; padding: 7px 9px; background: var(--surface);
  }
  .side input:focus, .side select:focus, .side textarea:focus { outline: none; border-color: var(--accent); }
  .side textarea { resize: vertical; min-height: 90px; }
  .panel-head { display: flex; align-items: flex-start; gap: 8px; }
  .panel-close {
    background: none; border: none; cursor: pointer; color: var(--text-muted);
    font-size: 20px; line-height: 1; padding: 0 2px; margin-left: auto;
  }
  .ref-info {
    margin-top: 7px; padding: 9px 11px; background: var(--surface-2);
    border: 1px solid var(--border-subtle); border-radius: 5px;
    font-size: 11.5px; color: var(--text-secondary); line-height: 1.7;
  }
  .ref-info dt { display: inline-block; width: 68px; color: var(--text-muted); }
  .ref-info .note { color: var(--text-muted); font-size: 11px; }
  .panel-foot { border-top: 1px solid var(--border-subtle); padding-top: 14px; }
  .row-toggle { display: flex; align-items: center; gap: 7px; font-size: 12.5px; margin-bottom: 9px; }
  .row-toggle input { width: auto; }
  .row-toggle label { margin: 0 !important; }
  .btn {
    font-family: inherit; font-size: 12.5px; cursor: pointer; background: var(--surface);
    color: var(--text-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px;
  }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.danger { color: var(--red); }
  .btn.danger:hover { background: var(--red-light); border-color: var(--red); }

  /* 수정 이력 목록 */
  .hist-item { padding: 9px 2px; border-top: 1px solid var(--border-subtle); font-size: 12.5px; }
  .hist-item:first-child { border-top: none; }
  .hist-item .a { font-weight: 600; }
  .hist-item .d { color: var(--text-secondary); word-break: break-word; }
  .hist-item .m { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; }
  .who {
    display: inline-flex; align-items: center; justify-content: center;
    width: 17px; height: 17px; border-radius: 50%; background: var(--accent);
    color: #fff; font-size: 9.5px; font-weight: 700; margin-right: 5px; vertical-align: -3px;
  }
`;
  document.head.appendChild(style);
  document.title = BOARD_TITLE;

  const holder = document.createElement('div');
  holder.innerHTML = `

<header>
  <h1>__TITLE__</h1>
  <span class="doc" id="docPath"></span>
  <span class="spacer"></span>
  <span id="syncStatus">연결 중...</span>
  <button id="meBadge" onclick="askInitials()">?</button>
  <button class="mode-btn" id="modeBtn" onclick="toggleMode()" title="테스트 모드에서는 Firebase에 저장되지 않습니다">테스트</button>
</header>

<nav class="board-nav" id="boardNav"></nav>

<div class="container">
  <!-- 제목 + 페이지 네비 (기존 앱과 같은 배치) -->
  <div class="title-row">
    <h2 id="pageTitle">Total</h2>
    <div class="page-nav">
      <button class="nav-home" onclick="gotoPage('')" title="Total 보기">⌂</button>
      <button class="page-nav-arrow" onclick="stepPage(-1)" title="이전">&#8592;</button>
      <div class="page-nav-dots" id="navDots"></div>
      <button class="page-nav-arrow" onclick="stepPage(1)" title="다음">&#8594;</button>
    </div>
  </div>

  <!-- 아이콘 줄 -->
  <div class="tool-row">
    <p class="label">__LABEL__</p>
    <button class="icon-btn" onclick="openHistory()" title="수정 이력">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
    </button>
    <button class="icon-btn" id="reqBtn" onclick="toggleRequest()" title="Request — 업데이트 요청"><span id="reqIcon"></span></button>
    <button class="icon-btn" id="capBtn" onclick="captureTable()" title="표를 PNG 이미지로 저장"><span id="capIcon"></span></button>
    <button class="icon-btn del" id="delBtn" onclick="deleteSelected()" disabled title="선택 일괄 삭제">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      <span class="n" id="delCount">0</span>
    </button>
    <button class="icon-btn" id="moveBtn" onclick="openMoveMenu(event)" title="이동하기"><span id="moveIcon"></span><span class="n" id="moveCount">0</span></button>
    <button class="icon-btn" id="undoBtn" onclick="doUndo()" disabled>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
    </button>
    <input id="search" class="cell-input" style="width:180px;border-color:var(--border);background:var(--surface);"
           type="search" placeholder="검색" oninput="render()" />
  </div>

  <!-- 주담당 필터 -->
  <div class="chips" id="ownerChips"></div>

  <div class="table-wrap">
    <table>
      <colgroup>
        <col style="width:112px" /><col style="width:24%" /><col style="width:62px" />
        <col /><col /><col style="width:128px" />
      </colgroup>
      <thead>
        <tr>
          <th><div class="lead" id="headLead"></div></th>
          <th>Task</th><th>주담당</th><th>This Week</th><th>Next Week</th><th>Due date</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div class="empty" id="emptyMsg" style="display:none;">아직 항목이 없습니다. 아래 ＋ 를 눌러 시작하세요.</div>
  </div>
  <div class="count" id="countMsg"></div>

  <!-- 기존 앱 In Active 하단의 삭제 목록과 같은 자리 -->
  <div class="deleted-section" id="deletedSection">
    <div class="deleted-head" onclick="toggleDeleted()">
      <button class="chev" id="delChev" title="접기/펼치기">▾</button>
      <h3>Deleted Tasks</h3>
      <span class="del-count"><span id="trashIcon"></span><span id="trashCount">0</span></span>
      <span style="flex:1"></span>
      <span id="trashSelBtns" style="display:none;">
        <button class="btn" id="trashSelRestore" onclick="event.stopPropagation();restoreSelectedTrash()">선택 복원</button>
        <button class="btn danger" id="trashSelPurge" onclick="event.stopPropagation();purgeSelectedTrash()">선택 영구 삭제</button>
      </span>
      <button class="btn" onclick="event.stopPropagation();restoreAllDeleted()">전체 복원</button>
      <button class="btn danger" onclick="event.stopPropagation();purgeAllDeleted()">전체 영구 삭제</button>
    </div>
    <div id="deletedBody"></div>
  </div>
</div>

<div id="logPop" style="display:none;">
  <h3 id="logTitle"></h3>
  <div class="sub" id="logSub"></div>
  <div class="log-add">
    <input id="logInput" placeholder="한 줄 입력 후 Enter"
           onkeydown="if(event.key==='Enter')submitLog(); if(event.key==='Escape')closeLog();" />
    <button class="btn primary" onclick="submitLog()">추가</button>
  </div>
  <div class="log-list" id="logList"></div>
</div>

<div id="panel" class="side">
  <div class="panel-head">
    <div><h2 id="pTitle">Task</h2><div class="sub" id="pMeta"></div></div>
    <button class="panel-close" onclick="closePanel()" title="닫기">×</button>
  </div>
  <div class="field">
    <label>연결된 프로젝트 (기존 앱에서 가져옴)</label>
    <select id="pProject"></select>
    <div class="ref-info" id="pRefInfo"></div>
  </div>
  <div class="field"><label>Task 이름 (연결을 안 했을 때 쓰입니다)</label><input id="pName" /></div>
  <div class="field"><label>주담당</label><input id="pOwner" maxlength="4" /></div>
  <div class="field">
    <div class="row-toggle"><input type="checkbox" id="pHot" /><label for="pHot" style="color:var(--crimson);font-weight:600;">강조 (빨간 줄)</label></div>
    <div class="row-toggle"><input type="checkbox" id="pNew" /><label for="pNew">NEW 표시</label></div>
  </div>
  <div class="field"><label>메모</label><textarea id="pMemo" placeholder="자유롭게 입력하세요"></textarea></div>
  <div class="panel-foot"><button class="btn danger" onclick="deleteCurrent()">이 Task 삭제</button></div>
</div>

<!-- Request — 기존 앱과 같은 모양의 떠 있는 패널 -->
<div id="requestPanel" style="display:none;">
  <div class="req-head">
    <span class="req-title"><span id="reqHeadIcon"></span> Request</span>
    <button class="panel-close" onclick="closeRequest()" title="닫기">×</button>
  </div>
  <div class="field"><label>업데이트 요청 마감일</label><input type="date" id="reqDeadline" /></div>
  <div class="field"><label>추가 메모</label><textarea id="reqNote" rows="3" placeholder="자유롭게 입력하세요…"></textarea></div>
  <div class="req-label">담당자 확인</div>
  <div id="reqMeta" class="req-meta"></div>
  <div id="reqCheckList" class="req-checks"></div>
  <button class="btn primary" style="width:100%;" onclick="saveRequest()">Save</button>
</div>

<!-- 이동하기 메뉴 -->
<div id="movePop" style="display:none;"></div>

<div id="rowLogPanel" class="side">
  <div class="panel-head">
    <div><h2 id="rlTitle">기록</h2><div class="sub" id="rlSub"></div></div>
    <button class="panel-close" onclick="closeRowLogs()" title="닫기">×</button>
  </div>
  <div id="rlBody"></div>
</div>

<div id="histPanel" class="side">
  <div class="panel-head">
    <div><h2>수정 이력</h2><div class="sub">누가 언제 무엇을 바꿨는지 — 팀이 함께 봅니다</div></div>
    <button class="panel-close" onclick="closeHistory()" title="닫기">×</button>
  </div>
  <div id="histList"></div>
</div>

`.replace(/__TITLE__/g, BOARD_TITLE).replace(/__LABEL__/g, BOARD_LABEL);
  while (holder.firstChild) document.body.appendChild(holder.firstChild);
})();

/* 화면만 담당한다. 저장·동기화·이력·되돌리기는 전부 store.js가 한다. */

const LOGS = [
  { key: 'thisWeek', label: 'This Week' },
  { key: 'nextWeek', label: 'Next Week' },
  { key: 'due',      label: 'Due date'  }
];
const SVG_GLASS  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const SVG_TRASH  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
const SVG_MAIL   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>';
const SVG_MOVE   = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
const SVG_CAM    = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const SVG_DETAIL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
const SVG_MEMO   = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';

let page = '';                 // '' = Total, 아니면 BU 이름
let ownerFilter = '';
let openId = null;
let logCtx = null;
let dragId = null;
const selected = new Set();

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortTs = iso => String(iso || '').slice(5, 16).replace('T', ' ').replace('-', '/');

function taskName(r) { const ref = Store.linked(r); return (ref && ref.name) || (r && r.name) || ''; }
function buOf(r) { const ref = Store.linked(r); return (ref && ref.bu) || ''; }

/* ── 페이지(BU) ────────────────────────────────────────────────────── */
function pagesPresent() {
  const set = {};
  Store.all().forEach(r => { const b = buOf(r); if (b) set[b] = 1; });
  return Object.keys(set).sort();
}
function renderNav() {
  const list = pagesPresent();
  const dots = [['', 'T', 'Total']].concat(list.map(b => [b, b.charAt(0), b]));
  // 첫 글자가 겹치면 그 항목들만 전체 이름으로 (기존 앱과 같은 규칙)
  const firsts = dots.map(d => d[1]);
  $('navDots').innerHTML = dots.map((d, i) => {
    const label = firsts.filter(x => x === d[1]).length > 1 ? d[2] : d[1];
    return '<div class="nav-dot' + (page === d[0] ? ' active' : '') + '" onclick="gotoPage(\'' +
      esc(d[0]) + '\')" title="' + esc(d[2]) + '">' + esc(label) + '</div>';
  }).join('');
  $('pageTitle').textContent = page || 'Total';
}
function gotoPage(p) { page = p; render(); }
function stepPage(delta) {
  const order = [''].concat(pagesPresent());
  const i = order.indexOf(page);
  page = order[((i === -1 ? 0 : i) + delta + order.length) % order.length];
  render();
}

/* ── 목록 ──────────────────────────────────────────────────────────── */
function visibleRows() {
  const q = $('search').value.trim().toLowerCase();
  return Store.all().filter(r => {
    if (page && buOf(r) !== page) return false;
    if (ownerFilter === '–' ? (r.owner || '').trim() !== '' : (ownerFilter && (r.owner || '') !== ownerFilter)) return false;
    if (!q) return true;
    const ref = Store.linked(r);
    let hay = [taskName(r), r.owner, r.memo].concat(ref ? [ref.bu, ref.customer] : []);
    LOGS.forEach(l => { (r[l.key] || []).forEach(e => hay.push(e.text)); });
    return hay.some(v => String(v || '').toLowerCase().includes(q));
  })
  // 기존 앱처럼 흐린 행(ON HOLD / deprioritized)은 표 맨 아래로 모은다.
  // sort는 안정 정렬이라 같은 무리 안에서는 드래그로 맞춘 순서가 그대로 남는다.
  // filter()가 새 배열을 주므로 저장된 순서 자체는 건드리지 않는다.
  .sort((a, b) => (isDimmed(a) ? 1 : 0) - (isDimmed(b) ? 1 : 0));
}

function leadHTML(r) {
  const refForMemo = Store.linked(r);
  const hasMemo = ((refForMemo ? refForMemo.checklistNotes : r.memo) || '').trim() !== '';
  return '<div class="lead">' +
    '<span class="drag-handle" draggable="true" title="드래그해서 순서 변경"' +
      ' ondragstart="dragStart(event,\'' + r.id + '\')" ondragend="dragEnd()">⠿</span>' +
    '<input type="checkbox" ' + (selected.has(r.id) ? 'checked' : '') +
      ' onchange="toggleSelect(\'' + r.id + '\', this.checked)" />' +
    '<button class="btn-icon muted" title="이 Task의 모든 기록 보기" onclick="openRowLogs(\'' + r.id + '\')">' + SVG_GLASS + '</button>' +
    '<button class="btn-icon" title="상세 / 프로젝트 연결" onclick="openPanel(\'' + r.id + '\')">' + SVG_DETAIL + '</button>' +
    '<button class="btn-icon muted' + (hasMemo ? ' has-memo' : '') + '" title="메모" onclick="openPanel(\'' + r.id + '\',true)">' + SVG_MEMO + '</button>' +
    '</div>';
}
// 기존 앱과 같은 순환: 기본 → NEW → NEW+ON HOLD → ON HOLD → deprioritized → 기본
function badgesHTML(r) {
  if (r.isNew && r.onHold) return '<span class="badge-hold">NEW</span><span class="badge-hold">ON HOLD</span>';
  if (r.isNew) return '<span class="new">NEW</span>';
  if (r.onHold) return '<span class="badge-hold">ON HOLD</span>';
  if (r.deprioritized) return '<span class="badge-deprioritized">deprioritized</span>';
  return '';
}
function isDimmed(r) { return !!(r && (r.onHold || r.deprioritized)); }

function taskCellHTML(r) {
  const ref = Store.linked(r);
  const nm = taskName(r);
  return '<div class="task-cell" oncontextmenu="cycleBadge(event,\'' + r.id + '\')" title="오른쪽 클릭 — NEW / ON HOLD / deprioritized">' +
    '<span class="nm' + (nm ? '' : ' none') + '">' + (nm ? esc(nm) : '(이름 없음)') + '</span>' +
    badgesHTML(r) +
    (ref && ref.bu ? '<span class="bu">' + esc(ref.bu) + '</span>' : '') + '</div>';
}
function logCellHTML(r, field) {
  const top = Store.latestLog(r, field);
  const n = Store.logCount(r, field);
  return '<div class="log-cell" onclick="openLog(event,\'' + r.id + '\',\'' + field + '\')">' +
    '<span class="txt' + (top ? '' : ' none') + '">' + (top ? esc(top.text) : '+ 입력') + '</span>' +
    (n > 1 ? '<span class="cnt">' + n + '</span>' : '') + '</div>';
}

function render() {
  const list = visibleRows();
  const rowsHTML = list.map(r =>
    '<tr data-id="' + r.id + '" class="' + (selected.has(r.id) ? 'sel ' : '') +
      (r.hot ? 'hot ' : '') + (isDimmed(r) ? 'row-dimmed' : '') + '"' +
    ' ondragover="dragOver(event,\'' + r.id + '\')" ondragleave="dragLeave(event)" ondrop="dropOn(event,\'' + r.id + '\')">' +
    '<td>' + leadHTML(r) + '</td>' +
    '<td>' + taskCellHTML(r) + '</td>' +
    '<td><input class="cell-input cell-owner" value="' + esc(r.owner) + '" maxlength="4"' +
      ' onblur="Store.setField(\'' + r.id + '\',\'owner\',this.value); render();"' +
      ' onkeydown="if(event.key===\'Enter\')this.blur()" /></td>' +
    '<td>' + logCellHTML(r, 'thisWeek') + '</td>' +
    '<td>' + logCellHTML(r, 'nextWeek') + '</td>' +
    '<td>' + logCellHTML(r, 'due') + '</td></tr>').join('');
  // 기존 앱처럼 표 맨 아래에 ＋ 한 줄
  $('tbody').innerHTML = rowsHTML +
    '<tr class="add-row"><td colspan="6"><button class="btn-add-row" onclick="addRow()" title="새 줄 추가">＋</button></td></tr>';

  $('emptyMsg').style.display = list.length ? 'none' : '';
  const total = Store.count();
  $('countMsg').textContent = list.length === total ? total + '개' : list.length + '개 표시 / 전체 ' + total + '개';

  $('delBtn').disabled = selected.size === 0;
  $('delCount').textContent = selected.size;
  $('moveCount').textContent = selected.size;
  const all = list.length > 0 && list.every(r => selected.has(r.id));
  $('chkAll').checked = all;
  $('chkAll').indeterminate = !all && list.some(r => selected.has(r.id));

  const top = Store.undoTop();
  $('undoBtn').disabled = !top;
  $('undoBtn').title = top
    ? '되돌리기 — ' + top.action + (top.detail ? ': ' + top.detail : '')
    : '되돌릴 작업이 없습니다';

  renderNav();
  renderOwnerChips();
  renderDeleted();
  if (logCtx) fillLog();
  if ($('histPanel').classList.contains('open')) fillHistory();
  if (rowLogId) { if (Store.get(rowLogId)) fillRowLogs(); else closeRowLogs(); }
  if (openId && !Store.get(openId)) closePanel();
  else if (openId) fillPanel(Store.get(openId));
}

function renderOwnerChips() {
  const counts = {}; let blank = 0;
  Store.all().forEach(r => {
    if (page && buOf(r) !== page) return;
    const o = (r.owner || '').trim();
    if (o) counts[o] = (counts[o] || 0) + 1; else blank++;
  });
  const scope = Store.all().filter(r => !page || buOf(r) === page).length;
  let rows = [['', 'All', scope]].concat(Object.keys(counts).sort().map(o => [o, o, counts[o]]));
  if (blank) rows.push(['–', '–', blank]);
  $('ownerChips').innerHTML = rows.map(x =>
    '<button class="chip ' + (ownerFilter === x[0] ? 'on' : '') + '" onclick="setOwnerFilter(\'' +
    esc(x[0]) + '\')">' + esc(x[1]) + ' ' + x[2] + '</button>').join('');
}
function setOwnerFilter(v) { ownerFilter = (ownerFilter === v ? '' : v); render(); }

/* ── 순서 드래그 ───────────────────────────────────────────────────── */
function dragStart(ev, id) {
  dragId = id;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', id); } catch (e) {}
  const tr = ev.target.closest('tr');
  if (tr) tr.classList.add('dragging');
}
function dragEnd() {
  dragId = null;
  document.querySelectorAll('#tbody tr').forEach(tr =>
    tr.classList.remove('dragging', 'drop-above', 'drop-below'));
}
function dragOver(ev, id) {
  if (!dragId || dragId === id) return;
  ev.preventDefault();
  const tr = ev.currentTarget;
  const r = tr.getBoundingClientRect();
  const below = (ev.clientY - r.top) > r.height / 2;
  tr.classList.toggle('drop-below', below);
  tr.classList.toggle('drop-above', !below);
}
function dragLeave(ev) { ev.currentTarget.classList.remove('drop-above', 'drop-below'); }
function dropOn(ev, targetId) {
  ev.preventDefault();
  const src = dragId;
  dragEnd();
  if (!src || src === targetId) return;
  const r = ev.currentTarget.getBoundingClientRect();
  const below = (ev.clientY - r.top) > r.height / 2;
  const ids = Store.all().map(x => x.id);
  const from = ids.indexOf(src);
  if (from === -1) return;
  ids.splice(from, 1);
  let to = ids.indexOf(targetId);
  if (to === -1) return;
  ids.splice(below ? to + 1 : to, 0, src);
  Store.reorder(ids);
  render();
}

/* ── 이력 칸 팝업 ──────────────────────────────────────────────────── */
function openLog(ev, rowId, field) {
  ev.stopPropagation();
  logCtx = { rowId: rowId, field: field };
  fillLog();
  const pop = $('logPop');
  pop.style.display = '';
  const r = ev.currentTarget.getBoundingClientRect();
  const left = Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - pop.offsetWidth - 14);
  pop.style.left = Math.max(window.scrollX + 8, left) + 'px';
  pop.style.top = (r.bottom + window.scrollY + 5) + 'px';
  setTimeout(() => { $('logInput').focus(); document.addEventListener('mousedown', outsideLog, true); }, 0);
}
function outsideLog(e) { if (!$('logPop').contains(e.target)) closeLog(); }
function closeLog() {
  $('logPop').style.display = 'none';
  logCtx = null;
  document.removeEventListener('mousedown', outsideLog, true);
}
function fillLog() {
  if (!logCtx) return;
  const r = Store.get(logCtx.rowId);
  if (!r) { closeLog(); return; }
  const meta = LOGS.filter(l => l.key === logCtx.field)[0];
  $('logTitle').textContent = (taskName(r) || '(이름 없음)') + ' — ' + meta.label;
  $('logSub').textContent = '최신이 맨 위에 쌓입니다. 표에는 맨 위 한 줄만 보입니다.';
  const list = r[logCtx.field] || [];
  $('logList').innerHTML = list.length ? list.map((e, i) =>
    '<div class="log-item ' + (i === 0 ? 'newest' : '') + '">' +
    '<span class="t">' + esc(e.text) + '</span>' +
    '<span class="meta">' + shortTs(e.at).slice(0, 5) + (e.by ? ' · ' + esc(e.by) : '') + '</span>' +
    '<button class="del" title="이 줄 삭제" onclick="delLog(\'' + e.id + '\')">×</button></div>').join('')
    : '<div class="log-empty">아직 기록이 없습니다.</div>';
}
function submitLog() {
  if (!logCtx) return;
  const el = $('logInput');
  if (!el.value.trim()) return;
  if (!Store.initials() && !askInitials()) return;
  Store.addLog(logCtx.rowId, logCtx.field, el.value);
  el.value = '';
  render();
  el.focus();
}
function delLog(entryId) {
  if (!logCtx) return;
  Store.removeLog(logCtx.rowId, logCtx.field, entryId);
  render();
}

/* ── NEW / ON HOLD / deprioritized 순환 ───────────────────────────
   Task 이름 칸에서 오른쪽 클릭하면 기존 앱과 같은 차례로 돈다.
   흐려지는 상태(ON HOLD, deprioritized)가 되면 체크를 풀고 맨 아래로 내려간다. */
function cycleBadge(ev, id) {
  ev.preventDefault();
  const r = Store.get(id);
  if (!r) return;
  const next = { isNew: !!r.isNew, onHold: !!r.onHold, deprioritized: !!r.deprioritized };
  if (!next.isNew && !next.onHold && !next.deprioritized) next.isNew = true;
  else if (next.isNew && !next.onHold) next.onHold = true;
  else if (next.isNew && next.onHold) next.isNew = false;
  else if (next.onHold) { next.onHold = false; next.deprioritized = true; }
  else next.deprioritized = false;
  if (next.onHold || next.deprioritized) selected.delete(id);   // 흐린 행은 체크 해제
  Store.update(id, next);
  render();
}

/* ── 행 ────────────────────────────────────────────────────────────── */
function addRow() {
  const r = Store.add({ projectId: '', name: '', owner: '', memo: '', hot: false, isNew: true,
                        thisWeek: [], nextWeek: [], due: [], removedLogIds: [] });
  render();
  openPanel(r.id);
  setTimeout(() => $('pProject').focus(), 220);
}
function toggleSelect(id, on) { if (on) selected.add(id); else selected.delete(id); render(); }
// 기존 앱처럼: 일부만 선택된 상태(–)에서 누르면 전체 선택, 전체에서 누르면 해제
function headerCheck(el) {
  const list = visibleRows();
  const all = list.length > 0 && list.every(r => selected.has(r.id));
  toggleAll(!all);
}
function toggleAll(on) { visibleRows().forEach(r => { if (on) selected.add(r.id); else selected.delete(r.id); }); render(); }
function deleteSelected() {
  const ids = Array.from(selected);
  if (!ids.length) return;
  const names = ids.map(id => taskName(Store.get(id)) || '(이름 없음)').join(', ');
  if (!confirm(ids.length + '개를 삭제합니다 — ' + names)) return;
  Store.remove(ids);
  selected.clear();
  if (openId && ids.indexOf(openId) !== -1) closePanel();
  render();
}
function doUndo() {
  const top = Store.undoTop();
  if (!top) return;
  if (!confirm('직전 작업을 되돌립니다 — ' + top.action + (top.detail ? ': ' + top.detail : ''))) return;
  Store.undo();
  render();
}

/* ── 상세 패널 ─────────────────────────────────────────────────────── */
function openPanel(id, focusMemo) {
  const r = Store.get(id);
  if (!r) return;
  openId = id;
  fillPanel(r);
  $('panel').classList.add('open');
  if (focusMemo) setTimeout(() => $('pMemo').focus(), 200);
}
function fillPanel(r) {
  if (!r) return;
  const focused = document.activeElement;
  const set = (el, v) => { if (el !== focused) el.value = v || ''; };
  const ref = Store.linked(r);
  $('pTitle').textContent = taskName(r) || '(이름 없음)';
  $('pMeta').textContent = '수정 ' + String(r.updatedAt || '').replace('T', ' ').slice(0, 16);
  fillProjectOptions(r.projectId);
  set($('pProject'), r.projectId);
  set($('pName'), r.name); set($('pOwner'), r.owner);
  // 연결된 행의 메모는 기존 앱의 메모(checklistNotes)를 그대로 쓴다
  set($('pMemo'), ref ? (ref.checklistNotes || '') : r.memo);
  const memoLabel = $('pMemo').parentElement.querySelector('label');
  if (memoLabel) memoLabel.textContent = ref ? '메모 — 기존 앱과 같은 메모입니다' : '메모';
  if ($('pHot') !== focused) $('pHot').checked = !!r.hot;
  if ($('pNew') !== focused) $('pNew').checked = !!r.isNew;
  $('pRefInfo').innerHTML = refInfoHTML(r, ref);
}
function fillProjectOptions(current) {
  const sel = $('pProject');
  const list = Store.refs();
  const sig = list.length + ':' + (current || '');
  if (sel.dataset.sig === sig) return;
  sel.dataset.sig = sig;
  const group = (label, src) => {
    const items = list.filter(r => r.source === src);
    if (!items.length) return '';
    return '<optgroup label="' + label + '">' + items.map(r =>
      '<option value="' + esc(r.id) + '">' + esc(r.name) + (r.bu ? ' — ' + esc(r.bu) : '') + '</option>').join('') + '</optgroup>';
  };
  let html = '<option value="">(연결 없음 — 아래 이름을 씁니다)</option>' +
             group('Active Projects', 'active') + group('Operational Tasks', 'op');
  if (current && !list.some(r => r.id === current)) {
    html += '<option value="' + esc(current) + '">(찾을 수 없는 프로젝트) ' + esc(current) + '</option>';
  }
  sel.innerHTML = html;
}
function refInfoHTML(r, ref) {
  if (!r.projectId) return '<span class="note">연결하면 기존 앱에서 이름을 고쳤을 때 여기 Task 이름도 자동으로 따라옵니다. BU가 정해지면 위쪽 페이지 탭에도 그 BU로 들어갑니다.</span>';
  if (!ref) return Store.refsLoaded()
    ? '<span class="note" style="color:var(--red)">원본을 찾을 수 없습니다. 기존 앱에서 지워졌을 수 있습니다.</span>'
    : '<span class="note">기존 앱 데이터를 불러오는 중...</span>';
  const row = (k, v) => v ? '<div><dt>' + k + '</dt>' + esc(v) + '</div>' : '';
  return row('표', ref.source === 'op' ? 'Operational Tasks' : 'In Active') +
         row('BU', ref.bu) + row('고객', ref.customer) +
         row('Publication', ref.publication) + row('Target', ref.targetDate);
}
function closePanel() { openId = null; $('panel').classList.remove('open'); }
function deleteCurrent() {
  if (!openId) return;
  if (!confirm('삭제합니다 — ' + (taskName(Store.get(openId)) || '(이름 없음)'))) return;
  Store.remove(openId);
  selected.delete(openId);
  closePanel();
  render();
}
function bindPanelFields() {
  [['pProject', 'projectId'], ['pName', 'name'], ['pOwner', 'owner']].forEach(pair => {
    const el = $(pair[0]);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'blur', () => {
      if (openId) { Store.setField(openId, pair[1], el.value); render(); }
    });
  });
  // 메모 — 연결돼 있으면 기존 앱 쪽에, 아니면 이 보드의 행에 저장한다
  $('pMemo').addEventListener('blur', async () => {
    if (!openId) return;
    const r = Store.get(openId);
    const ref = Store.linked(r);
    const val = $('pMemo').value;
    if (ref) {
      if ((ref.checklistNotes || '') !== val) await Store.editRef(ref.id, p => { p.checklistNotes = val; });
    } else {
      Store.setField(openId, 'memo', val);
    }
    render();
  });
  [['pHot', 'hot'], ['pNew', 'isNew']].forEach(pair => {
    $(pair[0]).addEventListener('change', () => {
      if (openId) { Store.setField(openId, pair[1], $(pair[0]).checked); render(); }
    });
  });
}

/* ── 페이지 등록부 ─────────────────────────────────────────────────
   페이지(앱)를 하나 더 만들면 여기에 한 줄만 추가한다. 그러면 "이동하기"의
   가기 목록과 옮기기 목록에 자동으로 나타난다. id는 그 페이지의
   window.STORE_APP_ID 와 같아야 한다 (Firestore 문서 tw-pm/<id>). */
const PAGES = [
  { id: 'tracker',   tab: 'Tasks in Active', label: 'Weekly Focus',      href: '../tracker/' },
  { id: 'completed', tab: 'Completed',       label: 'Completed Project', href: '../completed/' }
];
const MAIN_APP = { label: 'TW Project Manager (In Active)', href: '../' };

/* ── Deleted Tasks ─────────────────────────────────────
   기존 앱 In Active 하단의 삭제 목록과 같다. 지운 행은 여기 남아 복원할 수 있고,
   영구 삭제하면 내용이 사라진다 (다른 PC가 다시 살리지 못하도록 기록은 남는다). */
let deletedOpen = true;
function toggleDeleted() {
  deletedOpen = !deletedOpen;
  renderDeleted();
}
/* 머리글 체크박스를 행의 체크박스와 같은 세로줄에 세운다.
   폭을 눈대중으로 맞추면 아이콘이 하나만 늘어도 어긋나므로, 행과 똑같은 묶음을
   만들어 두고 체크박스만 남기고 가린다. */
function headLeadHTML(hideAll) {
  const ghost = s => '<span style="visibility:hidden;pointer-events:none;">' + s + '</span>';
  return '<div class="lead"' + (hideAll ? ' style="visibility:hidden"' : '') + '>' +
    ghost('<span class="drag-handle">⠱</span>') +
    '<input type="checkbox" id="' + (hideAll ? 'chkAllGhost' : 'chkAll') + '"' +
      (hideAll ? ' disabled' : ' onclick="headerCheck(this)" title="보이는 행 전체 선택/해제"') + ' />' +
    ghost('<button class="btn-icon">' + SVG_GLASS + '</button>') +
    ghost('<button class="btn-icon">' + SVG_DETAIL + '</button>') +
    ghost('<button class="btn-icon">' + SVG_MEMO + '</button>') + '</div>';
}

/* 삭제 표의 선택 — 여러 개를 한 번에 복원하거나 영구 삭제하려고 둔다.
   머리글 체크박스는 행 체크박스와 같은 세로줄에 서야 하므로 같은 묶음을 쓴다. */
const trashSelected = new Set();
function trashHeadLeadHTML() {
  const ghost = x => '<span style="visibility:hidden;pointer-events:none;">' + x + '</span>';
  return '<div class="lead del-lead">' +
    '<input type="checkbox" id="trashChkAll" onclick="trashHeaderCheck(this)" title="지운 항목 전체 선택/해제" />' +
    ghost('<button class="btn-icon">' + SVG_GLASS + '</button>') +
    ghost('<button class="btn">복원</button>') +
    ghost('<button class="btn">영구</button>') + '</div>';
}
function toggleTrashSelect(id, on) {
  if (on) trashSelected.add(id); else trashSelected.delete(id);
  renderDeleted();
}
function trashHeaderCheck() {
  const ids = Store.trash().map(t => t.id);
  const all = ids.length > 0 && ids.every(id => trashSelected.has(id));
  trashSelected.clear();
  if (!all) ids.forEach(id => trashSelected.add(id));
  renderDeleted();
}
function restoreSelectedTrash() {
  const ids = [...trashSelected];
  if (!ids.length) return;
  if (!confirm(ids.length + '개를 복원합니다.')) return;
  Store.restore(ids);
  trashSelected.clear();
  render();
}
function purgeSelectedTrash() {
  const ids = [...trashSelected];
  if (!ids.length) return;
  if (!confirm(ids.length + '개를 영구 삭제합니다. 되돌릴 수 없습니다.')) return;
  Store.purge(ids);
  trashSelected.clear();
  render();
}

function renderDeleted() {
  const list = Store.trash();
  const cnt = document.getElementById('trashCount');
  if (cnt) cnt.textContent = list.length;
  const chev = document.getElementById('delChev');
  if (chev) chev.classList.toggle('closed', !deletedOpen);
  const bodyEl = document.getElementById('deletedBody');
  if (!bodyEl) return;
  if (!deletedOpen) { bodyEl.innerHTML = ''; return; }
  // 휴지통에서 사라진 id 는 선택에서도 지운다
  const liveIds = new Set(list.map(t => t.id));
  [...trashSelected].forEach(id => { if (!liveIds.has(id)) trashSelected.delete(id); });
  const selBtns = document.getElementById('trashSelBtns');
  if (selBtns) {
    selBtns.style.display = trashSelected.size ? '' : 'none';
    const a = document.getElementById('trashSelRestore');
    const b = document.getElementById('trashSelPurge');
    if (a) a.textContent = '선택 복원 (' + trashSelected.size + ')';
    if (b) b.textContent = '선택 영구 삭제 (' + trashSelected.size + ')';
  }
  if (!list.length) { bodyEl.innerHTML = '<div class="del-empty">지운 항목이 없습니다.</div>'; return; }

  // 위 표와 같은 형식 — 같은 칸 너비, 같은 머리글. 내용은 지울 당시 그대로 보여주고
  // 고치지는 않는다 (복원한 뒤에 고치면 된다).
  const lastOf = (row, field) => {
    const e = (row && row[field] || [])[0];
    const n = (row && row[field] || []).length;
    return e ? esc(e.text) + (n > 1 ? ' <span class="cnt">' + n + '</span>' : '') : '';
  };
  bodyEl.innerHTML =
    '<div class="table-wrap"><table>' +
    '<colgroup><col style="width:150px" /><col style="width:24%" /><col style="width:62px" />' +
    '<col /><col /><col style="width:128px" /></colgroup>' +
    '<thead><tr><th>' + trashHeadLeadHTML() + '</th><th>Task</th><th>주담당</th><th>This Week</th><th>Next Week</th><th>Due date</th></tr></thead>' +
    '<tbody>' + list.map(function (t) {
      const r = t.row || {};
      return '<tr class="row-dimmed">' +
        '<td><div class="lead del-lead">' +
          '<input type="checkbox" ' + (trashSelected.has(t.id) ? 'checked' : '') +
            ' onchange="toggleTrashSelect(\'' + t.id + '\', this.checked)" />' +
          '<button class="btn-icon muted" title="내용 확인" onclick="openRowLogs(\'' + t.id + '\')">' + SVG_GLASS + '</button>' +
          '<button class="btn" title="복원" onclick="restoreDeleted(\'' + t.id + '\')">복원</button>' +
          '<button class="btn danger" title="영구 삭제" onclick="purgeDeleted(\'' + t.id + '\')">영구</button>' +
        '</div></td>' +
        '<td><div class="task-cell"><span class="nm">' + esc(rowTitleOf(r)) + '</span>' +
          '<span class="when">' + shortTs(t.deletedAt) + ' 삭제</span></div></td>' +
        '<td><div class="cell-ro cell-owner">' + esc(r.owner || '') + '</div></td>' +
        '<td><div class="cell-ro">' + lastOf(r, 'thisWeek') + '</div></td>' +
        '<td><div class="cell-ro">' + lastOf(r, 'nextWeek') + '</div></td>' +
        '<td><div class="cell-ro">' + lastOf(r, 'due') + '</div></td></tr>';
    }).join('') + '</tbody></table></div>';

  const hc = document.getElementById('trashChkAll');
  if (hc) {
    const ids = list.map(t => t.id);
    const all = ids.length > 0 && ids.every(id => trashSelected.has(id));
    hc.checked = all;
    hc.indeterminate = !all && ids.some(id => trashSelected.has(id));
  }
}
// 휴지통 안의 행은 Store에 없으므로 이름을 직접 만들어 쓴다
function rowTitleOf(row) {
  if (!row) return '(지워짐)';
  const ref = row.projectId ? Store.ref(row.projectId) : null;
  return (ref && ref.name) || row.name || '(이름 없음)';
}
function restoreDeleted(id) { Store.restore([id]); render(); }
function purgeDeleted(id) {
  const t = Store.trash().filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  if (!confirm('영구 삭제합니다 — ' + rowTitleOf(t.row) + '. 되돌릴 수 없습니다.')) return;
  Store.purge([id]); render();
}
function restoreAllDeleted() {
  const ids = Store.trash().map(function (t) { return t.id; });
  if (!ids.length) return;
  if (!confirm(ids.length + '개를 모두 복원합니다.')) return;
  Store.restore(ids); render();
}
function purgeAllDeleted() {
  const ids = Store.trash().map(function (t) { return t.id; });
  if (!ids.length) return;
  if (!confirm(ids.length + '개를 모두 영구 삭제합니다. 되돌릴 수 없습니다.')) return;
  Store.purge(ids); render();
}

/* ── 보드 탭 ──────────────────────────────────────────
   기존 앱의 Active Projects / Operational Tasks 와 같은 자리의 탭.
   PAGES 에 한 줄 더하면 탭도 같이 늘어난다. */
const HOME_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
function renderBoardNav() {
  const nav = document.getElementById('boardNav');
  if (!nav) return;
  nav.innerHTML = PAGES.map((p, i) =>
    '<a href="' + p.href + '" class="' + (p.id === Store.APP_ID ? 'on' : '') + '">' +
    (i === 0 ? HOME_SVG : '') + esc(p.tab || p.label) + '</a>').join('');
}

/* ── 이동하기 ──────────────────────────────────────────────────────
   기존 앱과 같은 자리의 같은 메뉴. 지금은 "페이지로 가기"가 실제로 동작하고,
   "다른 표로 옮기기"는 옮겨 갈 페이지가 생기면 그때 목록에 나타난다. */
function openMoveMenu(ev) {
  ev.stopPropagation();
  closeMoveMenu();
  const n = selected.size;
  const others = PAGES.filter(p => p.id !== Store.APP_ID);
  const pageChips = [['', 'Total']].concat(pagesPresent().map(b => [b, b])).map(x =>
    '<button class="move-chip' + (page === x[0] ? ' is-current' : '') + '"' +
    (page === x[0] ? ' disabled' : '') + ' onclick="moveGoPage(\'' + esc(x[0]) + '\')">' + esc(x[1]) + '</button>').join('');

  const movePart = n
    ? '<div class="move-label">체크한 ' + n + '개를 다른 표로 옮기기</div>' +
      (others.length
        ? others.map(p => '<button class="move-item" onclick="moveRowsTo(\'' + p.id + '\')">' +
            esc(p.label) + ' 로 옮기기</button>').join('')
        : '<div class="move-note">옮겨 갈 페이지가 아직 없습니다. 페이지를 추가하고 이 파일의 PAGES에 한 줄 넣으면 여기에 나타납니다.</div>') +
      '<div class="move-sep"></div>'
    : '';

  const pop = document.createElement('div');
  pop.id = 'movePop';
  pop.innerHTML =
    '<div class="move-head">이동하기' + (n ? ' — 체크한 ' + n + '개' : ' — 체크한 행 없음 (화면 이동만)') + '</div>' +
    movePart +
    '<div class="move-label">페이지로 가기</div>' +
    '<div class="move-chips">' + pageChips + '</div>' +
    '<div class="move-label">다른 메뉴로 가기</div>' +
    '<button class="move-item" onclick="location.href=\'' + MAIN_APP.href + '\'">' + esc(MAIN_APP.label) + '</button>';
  document.body.appendChild(pop);

  const r = ev.currentTarget.getBoundingClientRect();
  const left = Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - pop.offsetWidth - 14);
  pop.style.left = Math.max(window.scrollX + 8, left) + 'px';
  pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
  setTimeout(() => document.addEventListener('mousedown', outsideMove, true), 0);
}
function outsideMove(e) {
  const pop = document.getElementById('movePop');
  if (pop && !pop.contains(e.target)) closeMoveMenu();
}
function closeMoveMenu() {
  const pop = document.getElementById('movePop');
  if (pop) pop.remove();
  document.removeEventListener('mousedown', outsideMove, true);
}
function moveGoPage(p) { closeMoveMenu(); gotoPage(p); }
async function moveRowsTo(appId) {
  closeMoveMenu();
  const ids = Array.from(selected);
  const target = PAGES.filter(p => p.id === appId)[0];
  if (!ids.length || !target) return;
  const names = ids.map(id => taskName(Store.get(id)) || '(이름 없음)').join(', ');
  if (!confirm('체크한 ' + ids.length + '개를 ' + target.label + ' 로 옮깁니다.\n\n' + names + '\n\n쌓인 기록도 함께 넘어갑니다. 되돌리기로 취소할 수 있습니다.')) return;
  const n = await Store.moveTo(appId, ids);
  if (n) {
    selected.clear();
    if (openId && ids.indexOf(openId) !== -1) closePanel();
    render();
    if (confirm(n + '개를 옮겼습니다. ' + target.label + ' 로 가볼까요?')) location.href = target.href;
  }
}

/* ── Request ───────────────────────────────────────────────────────
   기존 앱과 같은 패널. 다만 문서는 이 앱 전용(tw-pm/tracker_request)이라
   기존 앱의 Request와 섞이지 않는다. */
let reqDoc = { deadline: '', note: '', createdBy: '', checks: {} };
function toggleRequest() {
  const el = $('requestPanel');
  if (el.style.display === 'none') { fillRequest(); el.style.display = ''; }
  else el.style.display = 'none';
}
function closeRequest() { $('requestPanel').style.display = 'none'; }
function fillRequest() {
  const focused = document.activeElement;
  if ($('reqDeadline') !== focused) $('reqDeadline').value = reqDoc.deadline || '';
  if ($('reqNote') !== focused) $('reqNote').value = reqDoc.note || '';
  $('reqMeta').textContent = reqDoc.createdBy
    ? reqDoc.createdBy + ' 가 올린 요청' + (reqDoc.deadline ? ' · 마감 ' + reqDoc.deadline : '')
    : '아직 올라온 요청이 없습니다.';
  // 담당자 목록은 표의 주담당에서 뽑는다
  const owners = {};
  Store.all().forEach(r => { const o = (r.owner || '').trim(); if (o) owners[o] = 1; });
  const me = Store.initials();
  if (me) owners[me] = 1;
  const list = Object.keys(owners).sort();
  $('reqCheckList').innerHTML = list.length ? list.map(o => {
    const done = reqDoc.checks && reqDoc.checks[o];
    const mine = o === me;
    return '<div class="req-person' + (mine ? ' mine' : '') + (done ? ' done' : '') + '"' +
      (mine ? ' onclick="markRequestDone()" title="누르면 완료/취소"' : '') + '>' +
      '<span class="av' + (done ? ' on' : (mine ? ' me' : '')) + '">' + esc(o.slice(0, 2)) + '</span>' +
      '<span class="txt">' + (done ? '완료 · ' + esc(done)
                                   : (mine ? '← 클릭하여 완료 처리' : '미완료')) + '</span>' +
      '</div>';
  }).join('') : '<div class="move-note">주담당이 지정된 행이 없습니다.</div>';
}
async function saveRequest() {
  if (!Store.initials() && !askInitials()) return;
  reqDoc = {
    deadline: $('reqDeadline').value || '',
    note: $('reqNote').value || '',
    createdBy: Store.initials(),
    checks: reqDoc.checks || {}
  };
  await Store.auxSave('request', reqDoc);
  fillRequest();
}
async function markRequestDone() {
  const me = Store.initials();
  if (!me) { askInitials(); return; }
  reqDoc.checks = reqDoc.checks || {};
  if (reqDoc.checks[me]) delete reqDoc.checks[me];
  else reqDoc.checks[me] = new Date().toISOString().slice(0, 10);
  await Store.auxSave('request', reqDoc);
  fillRequest();
}

/* ── 행별 전체 기록 (돋보기) ────────────────────────
   표에는 칸마다 맨 위 한 줄만 보이므로, 세 칸의 쌓인 기록을 한번에 보는 자리. */
let rowLogId = null;
// 살아 있는 행이면 그것을, 아니면 휴지통에 보관된 행을 돌려준다.
// 지운 행도 열어볼 수 있어야 영구 삭제 전에 내용을 확인할 수 있다.
function rowAnywhere(id) {
  const live = Store.get(id);
  if (live) return { row: live, deleted: false, at: '' };
  const t = Store.trash().filter(x => x.id === id)[0];
  return t ? { row: t.row, deleted: true, at: t.deletedAt } : null;
}
function openRowLogs(id) {
  if (!rowAnywhere(id)) return;
  rowLogId = id;
  fillRowLogs();
  $('rowLogPanel').classList.add('open');
}
function closeRowLogs() { rowLogId = null; $('rowLogPanel').classList.remove('open'); }
function fillRowLogs() {
  const found = rowAnywhere(rowLogId);
  if (!found) { closeRowLogs(); return; }
  const r = found.row;
  const ref = Store.linked(r);
  $('rlTitle').textContent = taskName(r) || '(이름 없음)';
  $('rlSub').textContent = found.deleted
    ? shortTs(found.at) + ' 에 지운 항목입니다. 영구 삭제하기 전에 내용을 확인하세요.'
    : (ref ? '기존 앱의 체크리스트와 같은 내용입니다. 여기서 체크하면 기존 앱에도 반영됩니다.'
           : '세 칸에 쌓인 기록 전체 — 칸을 눌러 추가하고 여기서 한번에 봅니다');
  const head = found.deleted
    ? '<div class="trash-note">지운 항목 — 보기 전용입니다. 되살리려면 복원을 누르세요.</div>' +
      '<div class="field"><label>주담당</label><div class="cell-ro">' + (esc(r.owner || '') || '—') + '</div></div>' +
      (String(r.memo || '').trim()
        ? '<div class="field"><label>메모</label><div class="cell-ro">' + esc(r.memo) + '</div></div>' : '')
    : '';
  $('rlBody').innerHTML = head + checklistHTML(ref, found.deleted) + LOGS.map(l => {
    const list = r[l.key] || [];
    return '<div class="field"><label>' + l.label + ' (' + list.length + ')</label>' +
      (list.length ? list.map((e, i) =>
        '<div class="log-item ' + (i === 0 ? 'newest' : '') + '">' +
        '<span class="t">' + esc(e.text) + '</span>' +
        '<span class="meta">' + shortTs(e.at).slice(0, 5) + (e.by ? ' · ' + esc(e.by) : '') + '</span></div>').join('')
        : '<div class="log-empty">기록 없음</div>') + '</div>';
  }).join('');
}

/* ── 연결된 프로젝트의 체크리스트 ──────────────────────────────────
   기존 앱(TW Project Manager)의 돋보기와 같은 내용을 같은 단계 구성으로
   보여주고, 여기서 체크한 것이 그대로 기존 앱 데이터에 반영된다.
   쓰기는 store.js의 editRef 한 곳만 거친다 (트랜잭션). */
function checklistHTML(ref, readOnly) {
  if (!ref) return '';
  const stages = Store.checklistOf(ref);
  const c = Store.checklistCount(ref);
  const body = stages.map(st =>
    '<div class="cl-stage"><div class="cl-stage-head">' + st.num + '. ' + esc(st.label) + '</div>' +
    st.items.map(it =>
      '<label class="cl-item' + (it.state === true ? ' done' : (it.state === 'pb' ? ' pb' : '')) + '">' +
      '<input type="checkbox" ' + (it.state === true ? 'checked ' : '') + (readOnly ? 'disabled ' : '') +
      ' onchange="toggleRefCheck(\'' + esc(ref.id) + '\',\'' + it.key + '\',this.checked)" />' +
      '<span>' + esc(it.title) + '</span>' +
      (it.state === 'pb' ? '<em>보류</em>' : '') + '</label>').join('') + '</div>').join('');
  return '<div class="field"><label>체크리스트 — 기존 앱과 같은 내용 ' +
         '<b style="color:var(--accent)">' + c.done + '/' + c.total + '</b></label>' +
    body +
    '<div class="move-note">기존 앱에서 체크해도 여기에 바로 반영됩니다.</div></div>';
}
async function toggleRefCheck(projectId, key, on) {
  const ok = await Store.editRef(projectId, p => {
    p.checks = p.checks || {};
    p.checks[key] = on ? true : false;
  });
  if (!ok) render();          // 실패하면 화면을 원래대로 되돌린다
}

/* ── 표를 이미지로 저장 (기존 앱의 카메라와 같은 html2canvas) ──── */
async function captureTable() {
  const el = document.querySelector('.table-wrap');
  if (!el || typeof html2canvas === 'undefined') {
    alert('캡처 기능을 불러올 수 없습니다. 네트워크 연결을 확인하세요.');
    return;
  }
  const btn = $('capBtn');
  btn.disabled = true;
  try {
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
    const a = document.createElement('a');
    a.download = 'weekly-focus_' + new Date().toISOString().slice(0, 10) + (page ? '_' + page : '') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  } catch (e) {
    console.warn('[capture]', e);
    alert('캐처에 실패했습니다: ' + e.message);
  } finally { btn.disabled = false; }
}

/* ── 수정 이력 패널 ────────────────────────────────────────────────── */
function openHistory() { fillHistory(); $('histPanel').classList.add('open'); }
function closeHistory() { $('histPanel').classList.remove('open'); }
function fillHistory() {
  const list = Store.history();
  $('histList').innerHTML = list.length ? list.map(h =>
    '<div class="hist-item">' +
      '<div><span class="who">' + esc((h.by || '?').slice(0, 2)) + '</span>' +
      '<span class="a">' + esc(h.action) + '</span>' + (h.detail ? ' <span class="d">— ' + esc(h.detail) + '</span>' : '') + '</div>' +
      '<div class="m">' + shortTs(h.at) + '</div></div>').join('')
    : '<div class="log-empty">아직 기록이 없습니다.</div>';
}

/* ── 기입자 이니셜 (기존 앱과 같은 값) ─────────────────────────────── */
function askInitials() {
  const v = prompt('기록에 남길 이니셜을 입력하세요 (예: SP, K, MJ)', Store.initials());
  if (v === null) return false;
  const saved = Store.setInitials(v);
  paintMe();
  return !!saved;
}
function paintMe() {
  const me = Store.initials();
  const b = $('meBadge');
  b.textContent = me || '?';
  b.classList.toggle('unset', !me);
  b.title = me ? '기입자 ' + me + ' — 누르면 바꿉니다' : '기입자 이니셜을 지정하세요';
}

/* ── 테스트 모드 ───────────────────────────────────────────────────── */
function toggleMode() {
  const on = !Store.isTestMode();
  if (on && !confirm('테스트 모드로 바꿉니다. 이 브라우저에만 저장되고 팀에는 올라가지 않습니다.')) return;
  Store.setTestMode(on);
  paintMode();
}
function paintMode() {
  const on = Store.isTestMode();
  $('modeBtn').classList.toggle('on', on);
  $('modeBtn').textContent = on ? '테스트 모드' : '테스트';
}

/* ── 시작 ──────────────────────────────────────────────────────────── */
Store.on('change', render);
Store.on('status', (text, tone) => { const el = $('syncStatus'); el.textContent = text; el.className = tone; });

window.addEventListener('DOMContentLoaded', () => {
  $('docPath').textContent = Store.DOC_PATH;
  $('capIcon').innerHTML = SVG_CAM;
  $('reqIcon').innerHTML = SVG_MAIL;
  $('reqHeadIcon').innerHTML = SVG_MAIL;
  $('moveIcon').innerHTML = SVG_MOVE;
  // 요청 문서는 행 목록과 따로 구독한다 (팀원이 바꾸면 바로 보인다)
  setTimeout(() => Store.auxWatch('request', d => {
    reqDoc = { deadline: d.deadline || '', note: d.note || '', createdBy: d.createdBy || '', checks: d.checks || {} };
    if ($('requestPanel').style.display !== 'none') fillRequest();
  }), 1200);
  Store.setRowLabel(r => taskName(r) || '(이름 없음)');   // 이력 문구에 연결된 이름이 나오도록
  const hl = document.getElementById('headLead');
  if (hl && !hl.firstChild) hl.outerHTML = headLeadHTML(false);
  renderBoardNav();
  $('trashIcon').innerHTML = SVG_TRASH;
  bindPanelFields();
  paintMe();
  paintMode();
  Store.init();
});
