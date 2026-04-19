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

// LIFF 專用路徑（不需要 Basic Auth）
app.get('/liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Mimi Sender running on port ${PORT}`));
