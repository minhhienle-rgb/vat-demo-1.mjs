// vat-demo.mjs — Demo luồng trình duyệt -> HTTP -> backend -> trình duyệt (yêu cầu xuất hóa đơn VAT)
// Chạy: node vat-demo.mjs  (mặc định http://localhost:4173, hosting cấp cổng qua PORT)
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT) || 4173;
const store = new Map(); // Lưu trong bộ nhớ: mất khi server khởi động lại

const PAGE = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yêu cầu xuất hóa đơn VAT</title>
<style>
:root{--bg:#f3f6f4;--card:#fff;--ink:#14231c;--mute:#5b6b63;--line:#d3ddd7;--brand:#0f6b4f;--brand-ink:#fff;--ok:#0f6b4f;--err:#b3261e;--code:#eaf0ec}
@media (prefers-color-scheme:dark){:root{--bg:#0f1713;--card:#17211b;--ink:#e6efe9;--mute:#93a49a;--line:#2b3a31;--brand:#4cc79a;--brand-ink:#08130e;--ok:#4cc79a;--err:#ff8a80;--code:#0d1511}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.5rem;margin:0 0 4px}
p.sub{margin:0 0 20px;color:var(--mute)}
form,.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
label{display:block;font-weight:600;margin:0 0 4px}
input{width:100%;padding:10px 12px;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;margin-bottom:14px}
input:focus-visible,button:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
button{font:inherit;font-weight:600;padding:10px 16px;border-radius:6px;border:1px solid var(--brand);background:var(--brand);color:var(--brand-ink);cursor:pointer}
button.ghost{background:transparent;color:var(--brand)}
button:disabled{opacity:.6;cursor:wait}
.status{font-weight:700;margin:0 0 6px}
.status.ok{color:var(--ok)}.status.err{color:var(--err)}
pre{margin:0;padding:12px;background:var(--code);border-radius:6px;overflow-x:auto;font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
section{margin-top:16px}
h2{font-size:1.05rem;margin:24px 0 0}
.card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.card-head code{font-size:.85rem;color:var(--mute);word-break:break-all}
.sub-result{margin-top:12px}
</style>
</head>
<body>
<main>
<h1>Yêu cầu xuất hóa đơn VAT</h1>
<p class="sub">Trình duyệt gửi request thật tới backend; mã và kết quả do server tạo.</p>

<form id="form" novalidate>
  <label for="partner">Tên đối tác</label>
  <input id="partner" name="partner" value="Công ty Minh An" autocomplete="off">
  <label for="amount">Số tiền (VNĐ)</label>
  <input id="amount" name="amount" value="1500000" inputmode="numeric" autocomplete="off">
  <button id="send" type="submit">Gửi request</button>
</form>

<section aria-live="polite">
  <h2>Phản hồi của lần gửi gần nhất</h2>
  <div class="box" id="latest"><p class="status">Chưa gửi request nào.</p></div>
</section>

<h2>Các yêu cầu đã gửi thành công</h2>
<div id="cards"></div>
</main>

<script>
const $ = (id) => document.getElementById(id);

async function call(url, options) {
  const res = await fetch(url, options);
  let body;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { code: res.status, body };
}

function render(target, r) {
  target.innerHTML = '';
  const s = document.createElement('p');
  s.className = 'status ' + (r.code >= 200 && r.code < 300 ? 'ok' : 'err');
  s.textContent = 'HTTP ' + r.code;
  const pre = document.createElement('pre');
  pre.textContent = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
  target.append(s, pre);
}

function addCard(id) {
  const card = document.createElement('div');
  card.className = 'box';
  card.style.marginTop = '12px';
  card.innerHTML = '<div class="card-head"><code></code><button type="button" class="ghost">Lấy lại kết quả</button></div><div class="sub-result"></div>';
  card.querySelector('code').textContent = id;
  const btn = card.querySelector('button');
  const out = card.querySelector('.sub-result');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    out.innerHTML = '<p class="status">Đang xử lý…</p>';
    try {
      render(out, await call('/api/requests/' + encodeURIComponent(id)));
    } catch (e) {
      out.innerHTML = '<p class="status err">Không kết nối được tới server.</p>';
    } finally { btn.disabled = false; }
  });
  $('cards').prepend(card);
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('send');
  const raw = $('amount').value.trim();
  const payload = { partnerName: $('partner').value, amount: /^-?\\d+$/.test(raw) ? Number(raw) : raw };
  btn.disabled = true;
  $('latest').innerHTML = '<p class="status">Đang xử lý…</p>';
  try {
    const r = await call('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    render($('latest'), r);
    if (r.code === 201 && r.body && r.body.requestId) addCard(r.body.requestId);
  } catch (e) {
    $('latest').innerHTML = '<p class="status err">Không kết nối được tới server.</p>';
  } finally { btn.disabled = false; }
});
</script>
</body>
</html>`;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10_000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pathname === '/') return send(res, 200, PAGE, 'text/html; charset=utf-8');

  if (pathname === '/api/requests') {
    if (req.method !== 'POST') return send(res, 405, { error: 'Chỉ hỗ trợ POST.' });
    let body;
    try { body = await readJson(req); }
    catch { return send(res, 422, { error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' }); }

    const reasons = [];
    const name = typeof body?.partnerName === 'string' ? body.partnerName.trim() : '';
    if (!name) reasons.push('Tên đối tác không được để trống.');
    const amount = body?.amount;
    if (!Number.isInteger(amount) || amount <= 0) reasons.push('Số tiền phải là số nguyên dương.');
    if (reasons.length) return send(res, 422, { error: 'Dữ liệu không hợp lệ.', reasons });

    const record = {
      requestId: 'VAT-' + randomUUID(),
      received: { partnerName: name, amount },
      status: 'processed',
      processedAt: new Date().toISOString()
    };
    store.set(record.requestId, record);
    return send(res, 201, record);
  }

  const m = pathname.match(/^\/api\/requests\/([^/]+)$/);
  if (m) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Chỉ hỗ trợ GET.' });
    const rec = store.get(decodeURIComponent(m[1]));
    return rec ? send(res, 200, rec) : send(res, 404, { error: 'Không tìm thấy requestId này.' });
  }

  send(res, 404, { error: 'Không tìm thấy đường dẫn.' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`VAT demo đang chạy tại http://localhost:${PORT}`));
