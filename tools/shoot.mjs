#!/usr/bin/env node
// Screenshots pages in headless Chrome over the DevTools protocol (no npm
// dependencies: Node 22's built-in WebSocket). Used to check the interface and
// to capture figures for the paper.
//
//   node tools/shoot.mjs --base http://127.0.0.1:8080 --out shots \
//        --pages "/=home,/shop/women=women" --width 1440 --height 900 [--full]
//        [--customer demo@gmail.com:password1234] [--admin demo@gmail.com:password1234]
//        [--before "document.querySelector('button').click()"] [--wait 1200]
//
// Prints console errors and failed requests seen on each page.

import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const BASE = String(args.base || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = String(args.out || 'shots');
const WIDTH = Number(args.width || 1440);
const HEIGHT = Number(args.height || 900);
const WAIT = Number(args.wait || 1200);
// "/path?x=1=name": the name is whatever follows the last "=", unless that part looks like a path or query.
const pages = String(args.pages || '/=home').split(',').map((p) => {
  const i = p.lastIndexOf('=');
  const tail = i > 0 ? p.slice(i + 1) : '';
  const named = tail && !/[/?&]/.test(tail) && p.slice(0, i).length > 0;
  const path = named ? p.slice(0, i) : p;
  return { path, name: named ? tail : path.replace(/\W+/g, '-') || 'home' };
});
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'me-shoot-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', '--lang=en-US', 'about:blank'], { stdio: 'ignore' });

let port;
for (let i = 0; i < 300 && !port; i++) { // up to 30 s: a first start can be slow
  await sleep(100);
  const f = join(profile, 'DevToolsActivePort');
  if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0];
}
if (!port) { console.error('Chrome did not start'); process.exit(1); }
const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) {
    for (const l of listeners) l(msg);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable');
await s('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 640 });

let problems = [];
listeners.push((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) problems.push(`http ${m.params.response.status}: ${m.params.response.url.replace(BASE, '')}`);
});

const evaluate = async (expression) => {
  const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const navigate = async (url) => {
  const loaded = new Promise((r) => { const l = (m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); r(); } }; listeners.push(l); });
  await s('Page.navigate', { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(WAIT);
};

const login = async (kind, cred) => {
  const [email, password] = String(cred).split(':');
  await navigate(BASE + '/');
  const path = kind === 'admin' ? '/api/admin/auth/login' : '/api/auth/login';
  const res = await evaluate(`(async () => {
    const base = (window.__ME__ && window.__ME__.base) || '';
    const s = await (await fetch(base + '/api/session')).json();
    const r = await fetch(base + '${path}', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.data.csrfToken },
      body: JSON.stringify(${JSON.stringify({ email, password })}) });
    return r.status;
  })()`);
  console.log(`${kind} sign-in: ${res}`);
};

try {
  if (args.customer) await login('customer', args.customer);
  if (args.admin) await login('admin', args.admin);
  for (const p of pages) {
    problems = [];
    await navigate(BASE + p.path);
    if (args.before) { await evaluate(`(async () => { ${args.before} })()`); await sleep(WAIT); }
    if (args.eval) console.log(`${p.name} eval:`, JSON.stringify(await evaluate(`(async () => { ${args.eval} })()`)));
    if (args.scroll) {
      // Viewport-sized frames at successive scroll positions (accurate for sticky and vh layouts).
      const total = await evaluate('document.documentElement.scrollHeight');
      const step = Number(args.scroll) > 1 ? Number(args.scroll) : HEIGHT;
      let n = 0;
      for (let y = 0; y < total && n < 30; y += step, n++) {
        await evaluate(`window.scrollTo(0, ${y})`);
        await sleep(700);
        const frame = await s('Page.captureScreenshot', { format: 'png' });
        const f = join(OUT, `${p.name}-${WIDTH}-${String(n).padStart(2, '0')}.png`);
        writeFileSync(f, Buffer.from(frame.data, 'base64'));
      }
      console.log(`${p.name}: ${n} frames${problems.length ? '  ⚠ ' + [...new Set(problems)].join(' | ') : ''}`);
      continue;
    }
    let clip;
    if (args.full) {
      const h = await evaluate('Math.min(document.documentElement.scrollHeight, 12000)');
      await s('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: h, deviceScaleFactor: 1, mobile: WIDTH < 640 });
      await sleep(400);
      clip = { x: 0, y: 0, width: WIDTH, height: h, scale: 1 };
    }
    const shot = await s('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    const file = join(OUT, `${p.name}-${WIDTH}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    if (args.full) await s('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 640 });
    console.log(`${file}${problems.length ? '  ⚠ ' + [...new Set(problems)].join(' | ') : ''}`);
  }
} finally {
  ws.close();
  chrome.kill();
  // Recent Chrome versions sometimes ignore SIGTERM, and Node waits for a child to exit.
  for (let i = 0; i < 20 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(100);
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  chrome.unref();
  await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still closing */ }
}
