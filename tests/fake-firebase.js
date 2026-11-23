// 시험 전용 가짜 Firebase 8 (app · database · messaging)
// 실제 서버에 접속하지 않고, 브라우저 메모리 안의 가짜 데이터만 읽고 씁니다.
(function () {
  'use strict';
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const split = (p) => String(p || '').split('/').filter(Boolean);

  let root = clone(window.__FAKE_DB__ || {}) || {};
  const stats = { reads: {}, writes: [], listeners: 0 };
  window.__fakeStats = stats;
  window.__fakeDump = () => clone(root);

  function getAt(parts) {
    let cur = root;
    for (const k of parts) {
      if (cur === null || typeof cur !== 'object' || !(k in cur)) return null;
      cur = cur[k];
    }
    return cur === undefined ? null : cur;
  }
  function prune(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    for (const k of Object.keys(obj)) {
      obj[k] = prune(obj[k]);
      if (obj[k] === null || obj[k] === undefined ||
          (typeof obj[k] === 'object' && Object.keys(obj[k]).length === 0)) delete obj[k];
    }
    return obj;
  }
  function setAt(parts, value) {
    value = prune(clone(value));
    if (parts.length === 0) { root = value || {}; return; }
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete cur[last]; else cur[last] = value;
    prune(root);
  }

  let pushCounter = 0;
  function pushKey() {
    pushCounter++;
    return '-K' + String(Date.now()).padStart(15, '0') + String(pushCounter).padStart(6, '0');
  }

  function sortedKeys(obj) {
    return Object.keys(obj).sort();
  }

  function Snapshot(key, value) { this.key = key; this._v = value === undefined ? null : value; }
  Snapshot.prototype.exists = function () { return this._v !== null; };
  Snapshot.prototype.val = function () { return clone(this._v); };
  Snapshot.prototype.forEach = function (cb) {
    if (this._v === null || typeof this._v !== 'object') return false;
    for (const k of sortedKeys(this._v)) { if (cb(new Snapshot(k, this._v[k])) === true) return true; }
    return false;
  };
  Snapshot.prototype.child = function (p) { const parts = split(p); let v = this._v; for (const k of parts) v = (v && typeof v === 'object') ? (v[k] ?? null) : null; return new Snapshot(parts[parts.length - 1], v); };
  Snapshot.prototype.numChildren = function () { return this._v && typeof this._v === 'object' ? Object.keys(this._v).length : 0; };

  const listeners = []; // {path, limit, cb, last}

  function queryValue(parts, limit) {
    let v = getAt(parts);
    if (limit && v && typeof v === 'object') {
      const keys = sortedKeys(v).slice(-limit);
      const out = {}; keys.forEach((k) => (out[k] = v[k])); v = out;
    }
    return v;
  }
  function countRead(parts, kind) {
    const key = kind + ':' + (parts[0] || '/') + (parts.length > 1 ? '/*' : '');
    stats.reads[key] = (stats.reads[key] || 0) + 1;
  }
  function notify(changedParts) {
    const changed = changedParts.join('/');
    setTimeout(() => {
      for (const l of listeners.slice()) {
        if (!listeners.includes(l)) continue;
        const lp = l.parts.join('/');
        const related = lp === '' || changed === '' || changed === lp || changed.startsWith(lp + '/') || lp.startsWith(changed + '/');
        if (!related) continue;
        const v = queryValue(l.parts, l.limit);
        const json = JSON.stringify(v);
        if (json === l.last) continue;
        l.last = json;
        countRead(l.parts, 'on-fire');
        try { l.cb(new Snapshot(l.parts[l.parts.length - 1] || null, clone(v))); } catch (e) { console.error(e); }
      }
    }, 0);
  }

  function Query(parts, limit) { this._parts = parts; this._limit = limit || 0; this.key = parts.length ? parts[parts.length - 1] : null; }
  Query.prototype.limitToLast = function (n) { return new Query(this._parts, n); };
  Query.prototype.orderByChild = function () { return this; };
  Query.prototype.orderByKey = function () { return this; };
  Query.prototype.once = function (event, cb) {
    countRead(this._parts, 'once');
    const snap = new Snapshot(this.key, clone(queryValue(this._parts, this._limit)));
    return new Promise((resolve) => setTimeout(() => { if (typeof cb === 'function') cb(snap); resolve(snap); }, 0));
  };
  Query.prototype.on = function (event, cb) {
    const l = { parts: this._parts, limit: this._limit, cb, last: undefined };
    listeners.push(l);
    stats.listeners = listeners.length;
    setTimeout(() => {
      if (!listeners.includes(l)) return;
      const v = queryValue(l.parts, l.limit);
      l.last = JSON.stringify(v);
      countRead(l.parts, 'on-first');
      try { cb(new Snapshot(this.key, clone(v))); } catch (e) { console.error(e); }
    }, 0);
    return cb;
  };
  Query.prototype.off = function (event, cb) {
    const p = this._parts.join('/');
    for (let i = listeners.length - 1; i >= 0; i--) {
      const l = listeners[i];
      if (l.parts.join('/') !== p) continue;
      if (cb && l.cb !== cb) continue;
      listeners.splice(i, 1);
    }
    stats.listeners = listeners.length;
  };

  function Reference(parts) { Query.call(this, parts, 0); }
  Reference.prototype = Object.create(Query.prototype);
  Reference.prototype.child = function (p) { return new Reference(this._parts.concat(split(p))); };
  Reference.prototype.set = function (value) {
    stats.writes.push({ op: 'set', path: this._parts.join('/') });
    setAt(this._parts, value); notify(this._parts); return Promise.resolve();
  };
  Reference.prototype.update = function (obj) {
    stats.writes.push({ op: 'update', path: this._parts.join('/') });
    for (const k of Object.keys(obj || {})) {
      const parts = this._parts.concat(split(k));
      setAt(parts, obj[k]);
      notify(parts);
    }
    return Promise.resolve();
  };
  Reference.prototype.remove = function () { return this.set(null); };
  Reference.prototype.push = function (value) {
    const ref = new Reference(this._parts.concat([pushKey()]));
    if (value === undefined) return ref;
    const p = ref.set(value);
    const plain = new Reference(ref._parts); // 진짜처럼, 기다린 결과는 then이 없는 보통 참조
    ref.then = (a, b) => p.then(() => plain).then(a, b);
    return ref;
  };

  const database = { ref: (p) => new Reference(split(p)) };
  const onMessageHandlers = [];
  window.__fakeOnMessageCount = () => onMessageHandlers.length;
  const messaging = {
    getToken: () => Promise.resolve('fake-token-for-test'),
    onMessage: (cb) => { onMessageHandlers.push(cb); },
    onBackgroundMessage: () => {},
  };

  const apps = [];
  window.firebase = {
    apps,
    initializeApp: (cfg) => { apps.push({ options: cfg }); return apps[0]; },
    database: () => database,
    messaging: () => messaging,
  };
})();
