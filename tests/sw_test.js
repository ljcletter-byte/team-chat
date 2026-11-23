// 서비스 워커(firebase-messaging-sw.js) 시험: 가짜 환경에서 실행합니다.
// 실행: node tests/sw_test.js firebase-messaging-sw.js
'use strict';
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(process.argv[2], 'utf8');

function makeEnv() {
  const listeners = {};
  const env = { opened: [], focused: [], shown: [], bgHandler: null, windows: [] };
  const self = {
    location: { origin: 'https://app.test', href: 'https://app.test/team-chat/firebase-messaging-sw.js' },
    registration: {
      scope: 'https://app.test/team-chat/',
      showNotification: (title, opts) => { env.shown.push({ title, opts }); return Promise.resolve(); },
    },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const clients = {
    matchAll: () => Promise.resolve(env.windows),
    openWindow: (url) => { env.opened.push(url); return Promise.resolve(null); },
  };
  const firebase = {
    initializeApp: () => ({}),
    messaging: () => ({ onBackgroundMessage: (fn) => { env.bgHandler = fn; } }),
  };
  const ctx = { self, clients, firebase, console: { log() {}, warn() {}, error() {} }, URL,
    importScripts: () => {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  env.fire = async (type, event) => {
    let p = null;
    event.waitUntil = (x) => { p = x; };
    for (const fn of listeners[type] || []) fn(event);
    if (p) await p;
  };
  return env;
}

(async () => {
  const report = (name, ok) => console.log(`${name} ${ok ? 'OK' : 'FAIL'}`);

  // 1) data 없이 띄운 알림을 눌러도 오류 없이 앱이 열림
  {
    const env = makeEnv();
    let closed = false;
    let err = null;
    try {
      await env.fire('notificationclick', { notification: { data: null, close: () => { closed = true; } } });
    } catch (e) { err = e; }
    report('data가 없는 알림을 눌러도 앱이 열림', !err && closed && env.opened.length === 1);
  }

  // 2) 앱이 이미 열려 있으면 그 창을 앞으로 가져옴
  {
    const env = makeEnv();
    env.windows.push({ url: 'https://app.test/team-chat/index.html', focus() { env.focused.push(1); return Promise.resolve(this); } });
    await env.fire('notificationclick', { notification: { data: null, close() {} } });
    report('앱 창이 열려 있으면 그 창을 보여 줌', env.focused.length === 1 && env.opened.length === 0);
  }

  // 3) 백그라운드 알림에 열 주소가 들어감
  {
    const env = makeEnv();
    if (env.bgHandler) env.bgHandler({ notification: { title: 't', body: 'b' } });
    const shown = env.shown[0];
    report('백그라운드 알림에 앱 주소가 담김', !!(shown && shown.opts && shown.opts.data && shown.opts.data.url));
  }
})().catch((e) => { console.error(e); process.exit(1); });
