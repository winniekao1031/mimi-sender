const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));

// ── 帳號密碼設定 ──
const AUTH_USER = process.env.AUTH_USER || 'mimi';
const AUTH_PASS = process.env.AUTH_PASS || 'hellomimi2024';

// Basic Auth 驗證
function checkAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="哈摟米米控制台"');
    return res.status(401).send('請輸入帳號密碼');
  }
  const base64 = authHeader.slice(6);
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
  if (user === AUTH_USER && pass === AUTH_PASS) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="哈摟米米控制台"');
  return res.status(401).send('帳號或密碼錯誤');
}

// 所有請求都需要驗證
app.use(checkAuth);
app.use(express.static(__dirname));

// LINE API Proxy
app.post('/api/line/push', async (req, res) => {
  try {
    const { token, groupId, messages } = req.body;
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ to: groupId, messages })
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/line/broadcast', async (req, res) => {
  try {
    const { token, messages } = req.body;
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ messages })
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Mimi Sender running on port ${PORT}`);
});
