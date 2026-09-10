// A tiny dependency-free server for a single-use birthday link.
// Run `node server.js --create-link` once, then `node server.js`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || `http://localhost:${PORT}`).replace(/\/$/, '');
// Set DATA_DIR to a persistent disk location when deploying (for example /data).
const STORE_DIR = process.env.DATA_DIR || path.join(__dirname, '.data');
const STORE_FILE = path.join(STORE_DIR, 'tokens.json');
const PAGE_FILE = path.join(__dirname, 'index.html');
const sessions = new Map();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

function readTokens() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch { return []; }
}
function saveTokens(tokens) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function equals(a, b) {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function createToken(hours) {
  const secret = crypto.randomBytes(32).toString('base64url');
  const tokens = readTokens();
  tokens.push({ hash: hash(secret), expiresAt: Date.now() + hours * 3600_000, redeemedAt: null });
  saveTokens(tokens);
  return `${PUBLIC_ORIGIN}/?token=${secret}`;
}
function cookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('='); return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}
function send(response, status, text, type = 'text/html; charset=utf-8', headers = {}) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  response.end(text);
}
function closed(response) {
  send(response, 410, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Surprise already opened</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#ffd2e5,#d9d0ff);font:18px system-ui;color:#54253f;text-align:center;padding:24px}.card{max-width:430px;background:#ffffffc9;padding:36px;border-radius:28px;box-shadow:0 14px 38px #7f40664a}h1{font-size:2rem}</style><main class="card"><div style="font-size:4rem">💌</div><h1>This surprise has already been opened.</h1><p>It was made for one small, special moment. ♡</p></main>`);
}
function landing(response, token) {
  const tokenField = JSON.stringify(token || '');
  send(response, 200, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>A surprise is waiting</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 20% 15%,#fff5a8,transparent 27%),linear-gradient(135deg,#ffc7df,#d6d0ff);font:18px system-ui;color:#54253f;text-align:center;padding:24px}.card{max-width:440px;background:#ffffffc7;padding:36px 28px;border-radius:28px;box-shadow:0 14px 38px #7f40664a}button{border:0;border-radius:999px;padding:15px 25px;background:linear-gradient(135deg,#ff478c,#a64de6);color:white;font-weight:700;font-size:1rem;cursor:pointer}</style><main class="card"><div style="font-size:4rem">🎁</div><h1>A little surprise is waiting for you</h1><p>This link can be opened only once. Ready?</p><button id="open">Open my surprise ♡</button><p id="status" aria-live="polite"></p></main><script>const token=${tokenField};document.querySelector('#open').onclick=async()=>{const b=document.querySelector('#open'),s=document.querySelector('#status');b.disabled=true;b.textContent='Opening…';try{const r=await fetch('/api/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});if(r.ok)location='/surprise';else{s.textContent='This surprise is no longer available.';b.hidden=true}}catch(e){s.textContent='Could not open the surprise. Please try again.';b.disabled=false;b.textContent='Open my surprise ♡'}}</script></main>`);
}
function admin(response) {
  send(response, 200, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Create a birthday link</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#ffd2e5,#d9d0ff);font:17px system-ui;color:#54253f;padding:24px}.card{width:min(440px,100%);background:#ffffffd0;padding:30px;border-radius:24px}input,button{box-sizing:border-box;width:100%;padding:13px;margin:7px 0;border-radius:12px;border:1px solid #d8a2bc;font:inherit}button{border:0;background:#e94b8a;color:#fff;font-weight:700;cursor:pointer}#result{overflow-wrap:anywhere;font-weight:600}</style><main class="card"><h1>Create a one-time link</h1><p>Only you should know this page’s admin password.</p><input id="password" type="password" placeholder="Admin password"><input id="hours" type="number" min="1" value="24" aria-label="Hours before expiry"><button id="create">Create private link</button><p id="result"></p></main><script>document.querySelector('#create').onclick=async()=>{const r=document.querySelector('#result'),b=document.querySelector('#create');b.disabled=true;r.textContent='Creating…';try{const x=await fetch('/api/admin/create-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({adminSecret:password.value,hours:Number(hours.value)})});const d=await x.json();r.innerHTML=x.ok?'Copy and send this link:<br><a href="'+d.link+'">'+d.link+'</a>':'Could not create a link. Check the password.'}catch(e){r.textContent='Could not create the link.'}b.disabled=false}</script></main>`);
}

if (process.argv.includes('--create-link')) {
  const hoursIndex = process.argv.indexOf('--expires-hours');
  const hours = hoursIndex >= 0 ? Number(process.argv[hoursIndex + 1]) : 72;
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Use a positive number after --expires-hours.');
  console.log(`\nSingle-use link (expires in ${hours} hour${hours === 1 ? '' : 's'}):\n${createToken(hours)}\n`);
  process.exit(0);
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/') return landing(response, url.searchParams.get('token'));
  if (request.method === 'GET' && url.pathname === '/admin') return ADMIN_SECRET ? admin(response) : send(response, 404, 'Not found', 'text/plain; charset=utf-8');
  if (request.method === 'POST' && url.pathname === '/api/admin/create-link') {
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 4096) request.destroy(); });
    request.on('end', () => {
      let details; try { details = JSON.parse(body); } catch { return send(response, 400, '{"error":"invalid request"}', 'application/json; charset=utf-8'); }
      const hours = Number(details.hours);
      if (!equals(details.adminSecret, ADMIN_SECRET) || !Number.isFinite(hours) || hours <= 0 || hours > 720) return send(response, 403, '{"error":"not allowed"}', 'application/json; charset=utf-8');
      return send(response, 200, JSON.stringify({ link: createToken(hours) }), 'application/json; charset=utf-8');
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/redeem') {
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 4096) request.destroy(); });
    request.on('end', () => {
      let token; try { token = JSON.parse(body).token; } catch { return closed(response); }
      if (typeof token !== 'string' || token.length > 200) return closed(response);
      const tokens = readTokens();
      const record = tokens.find(item => item.hash === hash(token));
      if (!record || record.redeemedAt || record.expiresAt < Date.now()) return closed(response);
      record.redeemedAt = Date.now();
      saveTokens(tokens); // Claim is persisted before issuing the page session.
      const session = crypto.randomBytes(32).toString('base64url');
      sessions.set(session, { served: false, expiresAt: Date.now() + 10 * 60_000 });
      return send(response, 200, '{"ok":true}', 'application/json; charset=utf-8', { 'Set-Cookie': `birthday_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600` });
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/surprise') {
    const session = sessions.get(cookies(request).birthday_session);
    if (!session || session.served || session.expiresAt < Date.now()) return closed(response);
    session.served = true;
    try { return send(response, 200, fs.readFileSync(PAGE_FILE), 'text/html; charset=utf-8'); }
    catch { return send(response, 500, 'Birthday page is missing.', 'text/plain; charset=utf-8'); }
  }
  return send(response, 404, 'Not found', 'text/plain; charset=utf-8');
}).listen(PORT, () => console.log(`Birthday link service is running at ${PUBLIC_ORIGIN}`));
