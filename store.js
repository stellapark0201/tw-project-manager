/* ──────────────────────────────────────────────────────────────────────────
   store.js — 공용 데이터 계층 (화면과 분리)

   화면(html)은 표만 그리고, 저장·동기화·병합은 전부 이 파일이 맡는다.
   표의 열이 바뀌어도 이 파일은 손댈 일이 거의 없다 — 행은 { id, updatedAt }만
   지키면 나머지 필드는 무엇이든 자유다.

   Firebase는 index.html(TW Project Manager)과 "같은 프로젝트"를 쓴다.
   그래서 Firebase 콘솔에서 새로 만들 것이 없다. 대신 문서 경로가 다르므로
   기존 데이터와는 완전히 분리된다.

       index.html  →  tw-pm/data
       이 파일      →  tw-pm/tracker        ← APP_ID 한 줄만 바꾸면 다른 앱이 된다

   tw-pm 컬렉션 안에 문서를 두는 이유: 보안 규칙이 보통 컬렉션 단위로 걸려 있어
   같은 컬렉션이면 규칙을 손대지 않아도 그대로 읽고 쓸 수 있다.
   ────────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAUGSm4irR1v7WWTUL_5Ln0s28VYrbaFoU",
    authDomain: "twproject-b2226.firebaseapp.com",
    projectId: "twproject-b2226",
    storageBucket: "twproject-b2226.firebasestorage.app",
    messagingSenderId: "488013988358",
    appId: "1:488013988358:web:699a0188672560326cf987"
  };

  /* 앱 이름. 이 한 값이 Firestore 문서 경로와 로컬 저장 키를 함께 정한다.
     이 파일은 여러 앱이 같이 쓰므로, 각 페이지가 자기 이름을 미리 정해 둔다 —
         <script>window.STORE_APP_ID = 'tracker';</script>
         <script src="../store.js"></script>
     새 앱을 하나 더 만들려면 폴더를 만들고 그 이름만 다르게 주면 된다. */
  const APP_ID   = global.STORE_APP_ID || 'tracker';
  const DOC_PATH = 'tw-pm/' + APP_ID;

  const LS_ROWS      = 'tw_' + APP_ID + '_rows';
  const LS_ROWS_TEST = 'tw_' + APP_ID + '_rows_test';
  const LS_TESTMODE  = 'tw_' + APP_ID + '_testmode';
  const TOMBSTONE_DAYS = 90;      // 삭제 기록 보관 기간
  const ECHO_MS = 4000;           // 내가 방금 쓴 것이 되돌아오는 구간은 무시

  let db = null;
  let unsub = null;
  let rows = [];
  let tombs = [];                 // [{ id, deletedAt }]
  let history = [];               // [{ id, at, by, action, detail }] — 팀이 함께 보는 수정 이력
  let testMode = localStorage.getItem(LS_TESTMODE) === '1';
  let lastSaveAt = 0;
  let lastRemoteAt = '';
  let started = false;

  const handlers = { change: [], status: [] };

  /* ── 작은 도구들 ───────────────────────────────────────────────────── */
  const nowISO = () => new Date().toISOString();
  const lsKey  = () => (testMode ? LS_ROWS_TEST : LS_ROWS);
  const lsTomb = () => lsKey() + '_deleted';
  const lsHist = () => lsKey() + '_history';
  const lsUndo = () => lsKey() + '_undo';

  function newId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function emit(name, a, b) {
    (handlers[name] || []).forEach(fn => { try { fn(a, b); } catch (e) { console.warn(e); } });
  }
  function status(text, tone) { emit('status', text, tone || 'muted'); }

  function readLocal() {
    try { rows    = JSON.parse(localStorage.getItem(lsKey()))  || []; } catch { rows  = []; }
    try { tombs   = JSON.parse(localStorage.getItem(lsTomb())) || []; } catch { tombs = []; }
    try { history = JSON.parse(localStorage.getItem(lsHist())) || []; } catch { history = []; }
  }
  function writeLocal() {
    try { localStorage.setItem(lsKey(),  JSON.stringify(rows));    } catch {}
    try { localStorage.setItem(lsTomb(), JSON.stringify(tombs));   } catch {}
    try { localStorage.setItem(lsHist(), JSON.stringify(history)); } catch {}
  }

  /* ── 수정 이력 ──────────────────────────────────────────────────────
     누가 언제 무엇을 바꿨는지 문서에 같이 올려 팀이 함께 본다. 이력 줄도
     이력 칸과 같은 이유로 id 기준 합집합으로 합친다 — 두 사람이 동시에
     뭔가 바꿔도 한쪽 기록만 남는 일이 없도록. */
  const HISTORY_MAX = 300;
  function capHistory(list) { return (list || []).slice(0, HISTORY_MAX); }
  function note(action, detail) {
    if (!action) return;
    history = capHistory([{
      id: 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      at: nowISO(), by: Store.initials(), action: action, detail: detail || ''
    }].concat(history));
  }

  /* ── 삭제 기록 ──────────────────────────────────────────────────────
     삭제한 행이 다른 PC의 오래된 사본 때문에 되살아나지 않게, 삭제 사실을
     따로 들고 다닌다. 같은 id를 나중에 다시 만들면(updatedAt이 더 최신이면)
     그건 새 행으로 보고 살려둔다. */
  function pruneTombs(list) {
    const limit = new Date(Date.now() - TOMBSTONE_DAYS * 864e5).toISOString();
    return (list || []).filter(t => (t.deletedAt || '') > limit);
  }
  function unionTombs(a, b) {
    const m = new Map();
    [...(a || []), ...(b || [])].forEach(t => {
      const prev = m.get(t.id);
      if (!prev || (t.deletedAt || '') > (prev.deletedAt || '')) m.set(t.id, t);
    });
    return pruneTombs([...m.values()]);
  }
  function applyTombs(list, tombList) {
    const m = new Map((tombList || []).map(t => [t.id, t.deletedAt || '']));
    return (list || []).filter(r => !(m.has(r.id) && m.get(r.id) >= (r.updatedAt || '')));
  }

  /* ── 이력 칸 ────────────────────────────────────────────────────────
     계속 쌓이는 칸(This Week / Next Week / Due date처럼)은 "마지막에 저장한
     사람이 이긴다"로 합치면 안 된다. 두 사람이 거의 동시에 한 줄씩 적으면
     한쪽 글이 통째로 사라지기 때문이다. 그래서 이 칸들만은 항목 id 기준으로
     양쪽을 합집합으로 모으고, 지운 항목은 removedLogIds로 따로 기억한다.

     페이지가 자기 이력 칸 이름을 미리 알려준다 —
         window.STORE_LOG_FIELDS = ['thisWeek', 'nextWeek', 'due'];
     한 항목의 모양: { id, text, at, by }  (at = 기입 시각, by = 작성자 이니셜) */
  const LOG_FIELDS = Array.isArray(global.STORE_LOG_FIELDS) ? global.STORE_LOG_FIELDS : [];

  function unionLogs(a, b) {
    const m = new Map();
    [...(a || []), ...(b || [])].forEach(e => {
      if (!e || !e.id) return;
      const prev = m.get(e.id);
      if (!prev || (e.at || '') > (prev.at || '')) m.set(e.id, e);
    });
    // 최신이 위로
    return [...m.values()].sort((x, y) => (y.at || '').localeCompare(x.at || ''));
  }

  /* 같은 행이 양쪽에 있을 때. 보통 칸은 updatedAt이 최신인 쪽을 쓰고,
     이력 칸만 양쪽을 합쳐서 어느 쪽 기록도 잃지 않게 한다. */
  function mergeRow(incoming, local) {
    const base = (incoming.updatedAt || '') >= (local.updatedAt || '') ? incoming : local;
    if (!LOG_FIELDS.length) return base;
    const out = Object.assign({}, base);
    const dead = new Set([...(incoming.removedLogIds || []), ...(local.removedLogIds || [])]);
    out.removedLogIds = [...dead];
    LOG_FIELDS.forEach(k => {
      out[k] = unionLogs(incoming[k], local[k]).filter(e => !dead.has(e.id));
    });
    return out;
  }

  /* ── 병합 ───────────────────────────────────────────────────────────
     같은 id면 updatedAt이 큰 쪽을 남긴다. 순서는 "더 최신인 쪽"을 기준으로
     잡아서, 방금 내가 바꾼 순서가 원격 사본 때문에 되돌아가지 않게 한다. */
  function mergeByUpdatedAt(incoming, local, localNewer) {
    const inMap = new Map((incoming || []).map(r => [r.id, r]));
    const loMap = new Map((local || []).map(r => [r.id, r]));
    const order = localNewer ? [...loMap.keys(), ...inMap.keys()]
                             : [...inMap.keys(), ...loMap.keys()];
    const seen = new Set();
    const out = [];
    order.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);
      const a = inMap.get(id), b = loMap.get(id);
      if (!a) { out.push(b); return; }
      if (!b) { out.push(a); return; }
      out.push(mergeRow(a, b));
    });
    return out;
  }

  const localLatest = () => rows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), '');
  const stamp = d => (d && d.toDate ? d.toDate().toISOString() : (d || ''));

  /* 원격 문서를 로컬에 반영한다. 반영했으면 true.
     두 가지는 반영하지 않는다 —
       · rows 필드가 아예 없는 문서: "비었다"가 아니라 "모른다"로 본다.
       · 원격이 비었는데 로컬에 있는 경우: 빈 쪽이 멀쩡한 쪽을 지우면 안 된다.
     어느 경우든 다음 저장 때 내 목록이 올라가면서 자연히 맞춰진다. */
  function applyRemote(d) {
    if (!d || !Array.isArray(d.rows)) return false;
    if (d.rows.length === 0 && rows.length > 0) return false;
    const mergedTombs = unionTombs(tombs, d.tombs);
    const remoteAt = stamp(d.updatedAt);
    const merged = mergeByUpdatedAt(
      applyTombs(d.rows, mergedTombs),
      applyTombs(rows, mergedTombs),
      localLatest() >= remoteAt
    );
    rows = merged;
    tombs = mergedTombs;
    history = capHistory(unionLogs(history, d.history));   // 이력도 양쪽을 합친다
    writeLocal();
    return true;
  }

  /* ── Firebase ──────────────────────────────────────────────────────── */
  function initFirebase() {
    try {
      if (typeof firebase === 'undefined') return false;
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      return true;
    } catch (e) {
      console.warn('[store] Firebase init 실패:', e);
      return false;
    }
  }

  /* ── 기존 앱 데이터 참조 (읽기 전용) ──────────────────────────────────
     index.html이 쓰는 tw-pm/data 문서를 "보기만" 한다. 이 파일은 그 문서에
     절대 쓰지 않는다 — 쓰기 시작하면 기존 앱의 병합 규칙을 여기도 똑같이
     갖춰야 하고, 한쪽 실수가 실제 프로젝트 데이터를 건드리게 된다.

     Tracker 행에는 projectId만 저장하고, 화면에 보일 이름·BU 같은 값은
     그때그때 이 목록에서 찾아 쓴다. 그래야 기존 앱에서 이름을 고치면
     Tracker에도 자동으로 따라온다. */
  const REF_DOC_PATH = 'tw-pm/data';
  let refs = [];
  let refUnsub = null;
  let refLoaded = false;

  function flattenRefs(d) {
    const out = [];
    const take = (arr, source) => (arr || []).forEach(p => {
      if (!p || !p.id) return;
      out.push({
        id: p.id,
        source,                                  // 'active' = In Active, 'op' = Operational Tasks
        name: p.name || '(이름 없음)',
        bu: String(p.bu || '').trim().toUpperCase(),
        customer: p.customer || '',
        publication: p.publication || '',
        purpose: p.purpose || '',
        targetDate: p.targetDate || '',
        releaseDate: p.releaseDate || ''
      });
    });
    take(d.projects, 'active');
    take(d.opProjects, 'op');
    return out;
  }

  function listenRefs() {
    if (!db || refUnsub) return;
    refUnsub = db.doc(REF_DOC_PATH).onSnapshot(snap => {
      if (!snap.exists) return;
      refs = flattenRefs(snap.data());
      refLoaded = true;
      emit('refchange');
      emit('change');            // 연결된 프로젝트 이름이 바뀌었을 수 있으니 표도 다시 그린다
    }, err => console.warn('[store] 참조 데이터 수신 오류:', err.code, err.message));
  }

  function listen() {
    if (!db || testMode) return;
    if (unsub) unsub();
    unsub = db.doc(DOC_PATH).onSnapshot(snap => {
      if (!snap.exists) return;
      if (Date.now() - lastSaveAt < ECHO_MS) return;     // 내가 방금 쓴 것
      const d = snap.data();
      const at = stamp(d.updatedAt);
      if (at && lastRemoteAt && at <= lastRemoteAt) return;
      if (at) lastRemoteAt = at;
      if (applyRemote(d)) {
        emit('change');
        status('팀원 변경 반영됨', 'ok');
      }
    }, err => {
      console.warn('[store] 수신 오류:', err.code, err.message);
      status('연결 끊김 — 로컬에만 저장됩니다', 'warn');
      setTimeout(() => { if (!testMode) listen(); }, 5000);
    });
  }

  async function push() {
    if (testMode || !db) return;
    lastSaveAt = Date.now();
    try {
      // 쓰기 직전에 원격이 더 최신이면 먼저 합친다 (둘이 동시에 고쳤을 때 덮어쓰기 방지)
      const snap = await db.doc(DOC_PATH).get();
      if (snap.exists) {
        const d = snap.data();
        const at = stamp(d.updatedAt);
        const remoteChanged = !!at && (lastRemoteAt ? at > lastRemoteAt : at > localLatest());
        if (at) lastRemoteAt = at;
        if (remoteChanged && applyRemote(d)) {
          emit('change');
          status('팀원 최신 내용과 합쳐서 저장', 'warn');
        }
      }
      lastSaveAt = Date.now();
      await db.doc(DOC_PATH).set({
        rows, tombs, history,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      status('저장됨', 'ok');
    } catch (e) {
      console.warn('[store] 저장 실패:', e);
      status('저장 실패 — 로컬에는 남아 있습니다', 'err');
    }
  }

  /* ── 되돌리기 ───────────────────────────────────────────────────────
     바꾸기 "직전"의 행 목록을 쌓아둔다. 이 브라우저에만 두는 보조 장치라
     (팀 공유 아님) 여기서 뭐가 잘못되더라도 저장 자체는 막지 않는다. */
  const UNDO_MAX = 20;
  let undoing = false;
  const snapshotRows = () => JSON.parse(JSON.stringify(rows));
  // 이력 문구에 쓸 행 이름표. 연결된 프로젝트 이름처럼 페이지만 아는 것이 있어 늦게 받는다.
  let rowLabel = r => (r && r.name) || '(이름 없음)';
  function readUndo()  { try { return JSON.parse(localStorage.getItem(lsUndo())) || []; } catch { return []; } }
  function writeUndo(st) { try { localStorage.setItem(lsUndo(), JSON.stringify(st.slice(0, UNDO_MAX))); } catch {} }

  function commit(action, detail, before) {
    if (action && !undoing) {
      if (before) {
        try { writeUndo([{ at: nowISO(), action: action, detail: detail || '', rows: before }].concat(readUndo())); }
        catch (e) { console.warn('[store] 되돌리기 스냅샷 실패 (저장은 계속):', e); }
      }
      note(action, detail);
    }
    writeLocal();
    emit('change');
    if (testMode) { status('테스트 모드 — 이 브라우저에만 저장', 'warn'); return Promise.resolve(); }
    status('저장 중...', 'warn');
    return push();
  }

  /* ── 공개 API ──────────────────────────────────────────────────────── */
  const Store = {
    APP_ID, DOC_PATH,

    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return Store; },

    async init() {
      if (started) return Store;
      started = true;
      readLocal();
      emit('change');                       // 로컬로 먼저 그린다 (네트워크를 기다리지 않음)
      const fbOk = initFirebase();
      if (fbOk) listenRefs();               // 참조는 읽기 전용이라 테스트 모드에서도 켜 둔다
      if (testMode) { status('테스트 모드 — Firebase 저장 차단', 'warn'); return Store; }
      if (!fbOk) { status('오프라인 — 로컬 데이터로 실행 중', 'warn'); return Store; }
      try {
        const snap = await db.doc(DOC_PATH).get();
        if (snap.exists) {
          lastRemoteAt = stamp(snap.data().updatedAt);
          if (applyRemote(snap.data())) emit('change');
          status('불러옴', 'ok');
        } else {
          status('새 문서 — 첫 저장 때 만들어집니다', 'muted');
        }
      } catch (e) {
        console.warn('[store] 불러오기 실패:', e);
        status('오프라인 — 로컬 데이터로 실행 중', 'warn');
      }
      listen();
      return Store;
    },

    all() { return rows.slice(); },
    get(id) { return rows.find(r => r.id === id) || null; },
    count() { return rows.length; },

    /* 기존 앱(tw-pm/data)의 프로젝트 목록 — 읽기 전용.
       Tracker 행의 projectId가 가리키는 대상이고, 선택 드롭다운의 재료다. */
    refs() { return refs.slice(); },
    ref(projectId) { return projectId ? (refs.find(r => r.id === projectId) || null) : null; },
    refsLoaded() { return refLoaded; },
    // 행에 연결된 프로젝트. 연결이 없거나 원본이 지워졌으면 null.
    linked(row) { return row && row.projectId ? Store.ref(row.projectId) : null; },

    // 새 행. 기본값을 넘기면 그대로 들어간다.
    add(fields) {
      const before = snapshotRows();
      const row = Object.assign({ id: newId(), createdAt: nowISO() }, fields || {});
      row.updatedAt = nowISO();
      rows.unshift(row);
      commit('행 추가', rowLabel(row), before);
      return row;
    },

    // 한 필드만 고칠 때. 값이 그대로면 아무 일도 하지 않는다.
    setField(id, field, value) {
      const r = Store.get(id);
      if (!r) return null;
      const v = typeof value === 'string' ? value.trim() : value;
      if (r[field] === v) return r;
      const before = snapshotRows();
      r[field] = v;
      r.updatedAt = nowISO();
      commit('수정', rowLabel(r) + ' › ' + field, before);
      return r;
    },

    // 여러 필드를 한 번에
    update(id, fields) {
      const r = Store.get(id);
      if (!r) return null;
      const before = snapshotRows();
      Object.assign(r, fields || {});
      r.updatedAt = nowISO();
      commit('수정', rowLabel(r), before);
      return r;
    },

    /* ── 이력 칸 ──────────────────────────────────────────────────────
       한 줄 적을 때마다 기입 시각과 작성자 이니셜이 같이 남는다.
       최신이 배열 앞(위)에 오고, 지운 항목은 removedLogIds에 남겨서
       다른 PC의 옛 사본 때문에 되살아나지 않게 한다. */
    addLog(rowId, field, text) {
      const r = Store.get(rowId);
      const t = String(text == null ? '' : text).trim();
      if (!r || !t) return null;
      const entry = {
        id: 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        text: t, at: nowISO(), by: Store.initials()
      };
      const before = snapshotRows();
      r[field] = [entry].concat(r[field] || []);
      r.updatedAt = nowISO();
      commit('기록 추가', rowLabel(r) + ' › ' + field + ': ' + t, before);
      return entry;
    },
    removeLog(rowId, field, entryId) {
      const r = Store.get(rowId);
      if (!r) return false;
      const before = snapshotRows();
      const gone = (r[field] || []).filter(e => e.id === entryId)[0];
      r[field] = (r[field] || []).filter(e => e.id !== entryId);
      r.removedLogIds = [...new Set([...(r.removedLogIds || []), entryId])];
      r.updatedAt = nowISO();
      commit('기록 삭제', rowLabel(r) + ' › ' + field + (gone ? ': ' + gone.text : ''), before);
      return true;
    },
    // 칸에 보여줄 가장 최근 한 줄
    latestLog(row, field) { return (row && (row[field] || [])[0]) || null; },
    logCount(row, field) { return ((row && row[field]) || []).length; },

    /* 작성자 이니셜 — 기존 앱(index.html)과 같은 키를 쓴다.
       같은 사이트라 한 번 정해두면 두 앱에서 그대로 이어진다. */
    initials() { return (localStorage.getItem('tw_pm_user_initials') || '').trim().toUpperCase(); },
    setInitials(v) {
      const s = String(v || '').trim().toUpperCase().slice(0, 4);
      if (s) localStorage.setItem('tw_pm_user_initials', s);
      return s;
    },

    remove(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      const set = new Set(list);
      const at = nowISO();
      const before = snapshotRows();
      const names = list.map(id => rowLabel(Store.get(id))).join(', ');
      list.forEach(id => tombs.unshift({ id, deletedAt: at }));
      tombs = pruneTombs(tombs);
      rows = rows.filter(r => !set.has(r.id));
      commit('삭제', names, before);
      return list.length;
    },

    // 드래그 등으로 순서를 바꿨을 때. 순서도 최신이 이기도록 updatedAt을 올린다.
    reorder(idsInOrder) {
      const m = new Map(rows.map(r => [r.id, r]));
      const next = [];
      idsInOrder.forEach(id => { if (m.has(id)) { next.push(m.get(id)); m.delete(id); } });
      m.forEach(r => next.push(r));
      const at = nowISO();
      const before = snapshotRows();
      next.forEach(r => { r.updatedAt = at; });
      rows = next;
      commit('순서 변경', '', before);
    },

    /* ── 수정 이력 / 되돌리기 ─────────────────────────
       이력은 문서에 올라가 팀이 함께 보고, 되돌리기 스택은 이 브라우저에만 남는다
       (내가 한 일을 되돌리는 것이므로). 되돌린 결과는 다시 팀에 공유된다. */
    history() { return history.slice(); },
    setRowLabel(fn) { if (typeof fn === 'function') rowLabel = fn; return Store; },

    undoTop() { return readUndo()[0] || null; },
    canUndo() { return readUndo().length > 0; },
    undo() {
      const stack = readUndo();
      const top = stack[0];
      if (!top || !Array.isArray(top.rows)) return null;
      undoing = true;
      try {
        rows = top.rows;
        note('되돌리기', top.action + (top.detail ? ': ' + top.detail : '') + ' 취소');
        commit();
      } finally { undoing = false; }
      stack.shift();
      writeUndo(stack);
      emit('change');
      return top;
    },

    /* ── 곯다리 문서 ──────────────────────────────────────
       행 목록과 따로 굴러가는 작은 공유 상태(예: 업데이트 요청)를 넣는 곣.
       경로는 tw-pm/<앱이름>_<이름> — 본 문서와 섞이지 않고, 기존 앱 문서도 건들지 않는다. */
    auxWatch(name, cb) {
      if (!db || typeof cb !== 'function') return () => {};
      return db.doc(DOC_PATH + '_' + name).onSnapshot(
        snap => cb(snap.exists ? (snap.data() || {}) : {}),
        err => console.warn('[store] ' + name + ' 수신 오류:', err.code));
    },
    async auxSave(name, obj) {
      if (testMode) { status('테스트 모드 — 저장하지 않음', 'warn'); return false; }
      if (!db) { status('오프라인 — 저장 실패', 'err'); return false; }
      try {
        await db.doc(DOC_PATH + '_' + name).set(Object.assign({}, obj, {
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }));
        status('저장됨', 'ok');
        return true;
      } catch (e) {
        console.warn('[store] ' + name + ' 저장 실패:', e);
        status('저장 실패', 'err');
        return false;
      }
    },

    isTestMode() { return testMode; },
    setTestMode(on) {
      if (testMode === !!on) return;
      const carry = rows.slice(), carryT = tombs.slice();
      if (on) {                       // 리얼 → 테스트: 지금 내용을 테스트 칸으로 복사
        testMode = true;
        localStorage.setItem(LS_TESTMODE, '1');
        rows = carry; tombs = carryT;
        writeLocal();
        if (unsub) { unsub(); unsub = null; }
        status('테스트 모드 — Firebase 저장 차단', 'warn');
        emit('change');
      } else {                        // 테스트 → 리얼: 리얼 칸을 다시 읽고 서버와 맞춘다
        testMode = false;
        localStorage.setItem(LS_TESTMODE, '0');
        readLocal();
        emit('change');
        if (!db) initFirebase();
        if (db) {
          listenRefs();
          db.doc(DOC_PATH).get().then(snap => {
            if (snap.exists) {
              lastRemoteAt = stamp(snap.data().updatedAt);
              if (applyRemote(snap.data())) emit('change');
            }
            listen();
            status('리얼 모드 — 팀과 공유됩니다', 'ok');
          }).catch(() => status('리얼 모드 — 서버 연결 실패', 'err'));
        }
      }
    },

    // 백업/점검용
    exportJSON() { return JSON.stringify({ app: APP_ID, rows, tombs, exportedAt: nowISO() }, null, 2); },
    importJSON(text) {
      const d = JSON.parse(text);
      if (!Array.isArray(d.rows)) throw new Error('rows 배열이 없습니다');
      rows = d.rows;
      tombs = pruneTombs(d.tombs || []);
      commit();
      return rows.length;
    }
  };

  global.Store = Store;
})(window);
