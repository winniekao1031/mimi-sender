const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));

// ── 帳號密碼設定 ──
const AUTH_USER = process.env.AUTH_USER || 'mimi';
const AUTH_PASS = process.env.AUTH_PASS || 'hellomimi2024';
const LINE_TOKEN = process.env.LINE_TOKEN || '';
const ORDER_SHEET_ID = '1-FmCKLXnneSdEf5Q9-JQZ80Y1FBt0WXOU6C2fXUycH4';
const NOTIFY_LINE_ID = 'chami_1031'; // 通知對象的 user ID（需要用 webhook 取得）

// Basic Auth 驗證（只對控制台，不對訂購表單和 LIFF）
function checkAuth(req, res, next) {
  // 以下路徑不需要驗證
  if (req.path === '/order.html' || req.path === '/api/order') return next();
  if (req.path.startsWith('/liff')) return next();
  if (req.path.startsWith('/api/schedule')) return next();
  if (req.path.startsWith('/api/product')) return next();
  
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Mimi Control Panel"');
    return res.status(401).send('請輸入帳號密碼');
  }
  const base64 = authHeader.slice(6);
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
  if (user === AUTH_USER && pass === AUTH_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Mimi Control Panel"');
  return res.status(401).send('帳號或密碼錯誤');
}

app.use(checkAuth);
app.use(express.static(__dirname));

// ── 訂單 API ──
app.post('/api/order', async (req, res) => {
  const { time, code, name, size, customerName, customerId, price } = req.body;

  try {
    // 1. 寫入 Google Sheet（透過 Google Apps Script Web App）
    const sheetUrl = process.env.SHEET_WEBAPP_URL;
    if (sheetUrl) {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time, code, name, size, customerName, customerId, price })
      });
    }

    // 2. LINE 推播通知
    const token = process.env.LINE_TOKEN_HELLOMIMI;
    const notifyUserId = process.env.NOTIFY_USER_ID;
    
    if (token && notifyUserId) {
      const msg = `🛍 新訂單！\n\n商品：${code} ${name}\n尺寸：${size}\n價格：${price}\n\n客人姓名：${customerName}\nLINE ID：${customerId || '未填寫'}\n備註：${req.body.note || '無'}\n\n時間：${time}`;
      
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to: notifyUserId,
          messages: [{ type: 'text', text: msg }]
        })
      });
    }

    res.json({ success: true });
  } catch(e) {
    console.error('訂單錯誤:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// LINE API Proxy
app.post('/api/line/push', async (req, res) => {
  try {
    const { token, groupId, messages } = req.body;
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ to: groupId, messages })
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/line/broadcast', async (req, res) => {
  try {
    const { token, messages } = req.body;
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ messages })
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
});

// 商品查詢 API（用 code 查詢商品資料）
const SHEET_CONFIGS = [
  { id: '1AKt-FH2EgFnHqIbdaNFM4uzBnL1J-nw1Kks_aC_PUiE', sheets: ['C0000','H0001','E0000-2025'] },
  { id: '1I6rcLTilZju1VdheCoT1tDHmEngewbHXk0WZeLOoUJY', sheets: ['K0001','A0001-2025','D0001-2025','P0001'] },
];
const COL = { cat:0, barcode:1, name:4, sizes:5, price:13, imageUrl:29 };

app.get('/api/product', async (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    for (const config of SHEET_CONFIGS) {
      for (const sheetName of config.sheets) {
        const url = `https://docs.google.com/spreadsheets/d/${config.id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
        const r = await fetch(url);
        const text = await r.text();
        const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
        const rows = json.table.rows;
        for (const row of rows) {
          const getVal = (i) => row.c && row.c[i] && row.c[i].v != null ? String(row.c[i].v).trim() : '';
          const barcode = getVal(COL.barcode);
          if (barcode !== code) continue;
          const priceRaw = getVal(COL.price);
          return res.json({
            code: barcode,
            name: getVal(COL.name),
            sizes: getVal(COL.sizes),
            price: priceRaw ? (priceRaw.startsWith('$') ? priceRaw : `$${priceRaw}`) : '',
            imageUrl: getVal(COL.imageUrl),
            cat: getVal(COL.cat) || sheetName,
          });
        }
      }
    }
    res.status(404).json({ error: '找不到商品' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 排程系統 ──────────────────────────────────────
const schedules = []; // { id, time: 'HH:MM', label, items, createdAt }

// 每分鐘檢查排程
setInterval(() => {
  const now = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
  const token = process.env.LINE_TOKEN_HELLOMIMI;
  const notifyUserId = process.env.NOTIFY_USER_ID;
  if (!token || !notifyUserId) return;

  schedules.forEach(async (s, idx) => {
    if (s.time === now && !s.fired) {
      s.fired = true;
      const itemList = s.items.map(p => `・${p.name}（${p.code}）`).join('\n');
      const liffUrl = 'https://liff.line.me/1657385678-5T9F9nca';
      const msg = `⏰ 排程提醒！\n\n${s.label ? s.label + '\n' : ''}共 ${s.items.length} 件商品：\n${itemList}\n\n👉 點此開啟發送：${liffUrl}`;
      try {
        await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ to: notifyUserId, messages: [{ type: 'text', text: msg }] })
        });
      } catch(e) { console.error('排程推播失敗:', e.message); }
    }
  });
}, 60000);

// 新增排程
app.post('/api/schedule', (req, res) => {
  const { time, label, items } = req.body;
  if (!time || !items || items.length === 0) return res.status(400).json({ error: '缺少參數' });
  const id = Date.now().toString();
  schedules.push({ id, time, label: label || '', items, fired: false, createdAt: new Date().toISOString() });
  res.json({ success: true, id });
});

// 取得排程清單
app.get('/api/schedule', (req, res) => {
  res.json(schedules.filter(s => !s.fired));
});

// 刪除排程
app.delete('/api/schedule/:id', (req, res) => {
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '找不到排程' });
  schedules.splice(idx, 1);
  res.json({ success: true });
});
// ──────────────────────────────────────────────────

// LIFF 專用路徑（不需要 Basic Auth）
app.get('/liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Mimi Sender running on port ${PORT}`));
