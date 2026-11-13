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

  // ★ 새 앱을 하나 더 만들 때는 이 값만 바꾼다 (문서 경로와 로컬 저장 키가 함께 따라간다)
  const APP_ID   = 'tracker';
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
  let testMode = localStorage.getItem(LS_TESTMODE) === '1';
  let lastSaveAt = 0;
  let lastRemoteAt = '';
  let started = false;

  const handlers = { change: [], status: [] };

  /* ── 작은 도구들 ───────────────────────────────────────────────────── */
  const nowISO = () => new Date().toISOString();
  const lsKey  = () => (testMode ? LS_ROWS_TEST : LS_ROWS);
  const lsTomb = () => lsKey() + '_deleted';

  function newId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function emit(name, a, b) {
    (handlers[name] || []).forEach(fn => { try { fn(a, b); } catch (e) { console.warn(e); } });
  }
  function status(text, tone) { emit('status', text, tone || 'muted'); }

  function readLocal() {
    try { rows  = JSON.parse(localStorage.getItem(lsKey()))  || []; } catch { rows  = []; }
    try { tombs = JSON.parse(localStorage.getItem(lsTomb())) || []; } catch { tombs = []; }
  }
  function writeLocal() {
    try { localStorage.setItem(lsKey(),  JSON.stringify(rows));  } catch {}
    try { localStorage.setItem(lsTomb(), JSON.stringify(tombs)); } catch {}
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
      out.push((a.updatedAt || '') >= (b.updatedAt || '') ? a : b);
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
        rows, tombs,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      status('저장됨', 'ok');
    } catch (e) {
      console.warn('[store] 저장 실패:', e);
      status('저장 실패 — 로컬에는 남아 있습니다', 'err');
    }
  }

  function commit() {
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
      if (testMode) { status('테스트 모드 — Firebase 저장 차단', 'warn'); return Store; }
      if (!initFirebase()) { status('오프라인 — 로컬 데이터로 실행 중', 'warn'); return Store; }
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

    // 새 행. 기본값을 넘기면 그대로 들어간다.
    add(fields) {
      const row = Object.assign({ id: newId(), createdAt: nowISO() }, fields || {});
      row.updatedAt = nowISO();
      rows.unshift(row);
      commit();
      return row;
    },

    // 한 필드만 고칠 때. 값이 그대로면 아무 일도 하지 않는다.
    setField(id, field, value) {
      const r = Store.get(id);
      if (!r) return null;
      const v = typeof value === 'string' ? value.trim() : value;
      if (r[field] === v) return r;
      r[field] = v;
      r.updatedAt = nowISO();
      commit();
      return r;
    },

    // 여러 필드를 한 번에
    update(id, fields) {
      const r = Store.get(id);
      if (!r) return null;
      Object.assign(r, fields || {});
      r.updatedAt = nowISO();
      commit();
      return r;
    },

    remove(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      const set = new Set(list);
      const at = nowISO();
      list.forEach(id => tombs.unshift({ id, deletedAt: at }));
      tombs = pruneTombs(tombs);
      rows = rows.filter(r => !set.has(r.id));
      commit();
      return list.length;
    },

    // 드래그 등으로 순서를 바꿨을 때. 순서도 최신이 이기도록 updatedAt을 올린다.
    reorder(idsInOrder) {
      const m = new Map(rows.map(r => [r.id, r]));
      const next = [];
      idsInOrder.forEach(id => { if (m.has(id)) { next.push(m.get(id)); m.delete(id); } });
      m.forEach(r => next.push(r));
      const at = nowISO();
      next.forEach(r => { r.updatedAt = at; });
      rows = next;
      commit();
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
