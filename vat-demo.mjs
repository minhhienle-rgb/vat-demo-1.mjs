import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const requests = new Map();
const port = Number(process.env.PORT ?? 4173);

const page = String.raw`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Yêu cầu xuất hóa đơn VAT</title>
  <style>
    * { box-sizing: border-box }
    body { margin: 0; background: #f1f6f4; color: #132d27; font: 1rem/1.5 system-ui, sans-serif }
    main { max-width: 44rem; margin: auto; padding: clamp(1rem, 5vw, 3rem) 1rem }
    h1 { margin: 0; font-size: clamp(1.75rem, 6vw, 2.7rem); line-height: 1.15; letter-spacing: -.035em }
    h2, h3 { margin: 0; font-size: 1.125rem }
    p { margin: .6rem 0 }
    form, article { background: white; border: 1px solid #cdded7; border-radius: 1rem; padding: clamp(1rem, 4vw, 1.5rem); margin-top: 1rem }
    label { display: block; font-weight: 650 }
    input { display: block; width: 100%; padding: .65rem .8rem; border: 1px solid #759389; border-radius: .5rem; margin: .3rem 0 1rem; font: inherit }
    button { min-height: 44px; padding: .55rem .95rem; background: #075644; color: white; border: 0; border-radius: .5rem; font: inherit; font-weight: 650; cursor: pointer }
    button:disabled { opacity: .65; cursor: wait }
    :focus-visible { outline: 3px solid #257c65; outline-offset: 3px }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #eaf3ef; padding: .8rem; border-radius: .5rem; margin: .4rem 0 0; font-size: .875rem }
    .response { margin-top: 1rem }
    .request-id { overflow-wrap: anywhere; font-family: monospace }
  </style>
</head>
<body>
<main>
  <h1>Yêu cầu xuất hóa đơn VAT</h1>
  <p>Dùng dữ liệu mẫu. Kết quả sẽ mất khi server khởi động lại.</p>
  <form id="request-form" novalidate>
    <label for="partner">Tên đối tác</label>
    <input id="partner" name="partnerName" value="Công ty Minh An">
    <label for="amount">Số tiền (VNĐ)</label>
    <input id="amount" name="amount" type="number" inputmode="numeric" value="1500000">
    <button id="submit" type="submit">Gửi request</button>
  </form>
  <section id="latest" class="response" aria-live="polite" aria-label="Phản hồi gửi gần nhất"></section>
  <section id="history" class="response" aria-label="Yêu cầu đã xử lý" hidden>
    <h2>Yêu cầu đã xử lý</h2>
  </section>
</main>
<script>
  const form = document.querySelector('#request-form');
  const submit = document.querySelector('#submit');
  const latest = document.querySelector('#latest');
  const history = document.querySelector('#history');

  function showResponse(container, response, body) {
    const status = document.createElement('strong');
    status.textContent = 'HTTP ' + response.status;
    const output = document.createElement('pre');
    output.textContent = body;
    container.replaceChildren(status, output);
  }

  async function readResponse(response, container) {
    const body = await response.text();
    let data;
    let display = body;
    try {
      data = JSON.parse(body);
      display = JSON.stringify(data, null, 2);
    } catch {
      // Keep the original response body when the host returns non-JSON.
    }
    showResponse(container, response, display);
    return data;
  }

  function addResult(response, data) {
    const article = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = 'Yêu cầu ' + data.requestId;
    heading.className = 'request-id';
    const saved = document.createElement('div');
    saved.className = 'response';
    showResponse(saved, response, JSON.stringify(data, null, 2));
    const result = document.createElement('div');
    result.className = 'response';
    result.setAttribute('aria-live', 'polite');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Lấy lại kết quả';
    button.addEventListener('click', async () => {
      button.disabled = true;
      result.textContent = 'Đang xử lý';
      try {
        const lookup = await fetch('/api/requests/' + encodeURIComponent(data.requestId));
        await readResponse(lookup, result);
      } catch {
        result.textContent = 'Không đọc được phản hồi từ máy chủ. Hãy thử lại.';
      } finally {
        button.disabled = false;
      }
    });
    article.append(heading, saved, result, button);
    history.append(article);
    history.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    latest.textContent = 'Đang xử lý';
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerName: document.querySelector('#partner').value,
          amount: document.querySelector('#amount').valueAsNumber
        })
      });
      const data = await readResponse(response, latest);
      if (response.status === 201 && data?.requestId) addResult(response, data);
    } catch {
      latest.textContent = 'Không đọc được phản hồi từ máy chủ. Hãy thử lại.';
    } finally {
      submit.disabled = false;
    }
  });
</script>
</body>
</html>`;

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(data));
}

async function createRequest(request, response) {
  const chunks = [];
  let bytes = 0;
  const maxBytes = 16 * 1024;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= maxBytes) chunks.push(chunk);
  }
  if (bytes > maxBytes) {
    return sendJson(response, 422, { error: 'Dữ liệu gửi lên vượt quá 16 KiB.' });
  }

  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return sendJson(response, 422, { error: 'Nội dung gửi lên phải là JSON hợp lệ.' });
  }

  const partnerName = typeof data?.partnerName === 'string' ? data.partnerName.trim() : '';
  const amount = data?.amount;
  if (!partnerName) {
    return sendJson(response, 422, { error: 'Tên đối tác không được để trống.' });
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return sendJson(response, 422, {
      error: 'Số tiền (VNĐ) phải là số nguyên dương, tối đa 9.007.199.254.740.991.'
    });
  }

  let requestId;
  do {
    requestId = randomUUID();
  } while (requests.has(requestId));
  const result = { requestId, partnerName, amount, status: 'processed', processedAt: new Date().toISOString() };
  requests.set(requestId, result);
  sendJson(response, 201, result);
}

const server = createServer(async (request, response) => {
  const [path] = request.url.split('?');
  try {
    if (request.method === 'GET' && path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(page);
    }
    if (request.method === 'POST' && path === '/api/requests') {
      return await createRequest(request, response);
    }
    const lookup = /^\/api\/requests\/([^/]+)$/.exec(path);
    if (request.method === 'GET' && lookup) {
      const result = requests.get(lookup[1]);
      if (result) return sendJson(response, 200, result);
      return sendJson(response, 404, { error: 'Không tìm thấy mã yêu cầu.' });
    }
    sendJson(response, 404, { error: 'Không tìm thấy đường dẫn.' });
  } catch (error) {
    console.error(error);
    if (!response.headersSent && !response.destroyed) {
      sendJson(response, 500, { error: 'Máy chủ gặp lỗi khi xử lý yêu cầu.' });
    }
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log('VAT demo: http://localhost:' + server.address().port);
});
