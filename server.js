const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// ── Sheet 設定 ──
const SHEET_CONFIGS = [
  { id: '1AKt-FH2EgFnHqIbdaNFM4uzBnL1J-nw1Kks_aC_PUiE', sheets: ['C0000','H0001','E0000-2025'] },
  { id: '1I6rcLTilZju1VdheCoT1tDHmEngewbHXk0WZeLOoUJY', sheets: ['K0001','A0001-2025','D0001-2025','P0001'] },
];
const COL = { cat:0, barcode:1, name:4, sizes:5, price:13, imageUrl:29 };

app.use(express.json({ limit: '10mb' }));

// ── 帳號密碼設定 ──
const AUTH_USER = process.env.AUTH_USER || 'mimi';
const AUTH_PASS = process.env.AUTH_PASS || 'hellomimi2024';
const LINE_TOKEN = process.env.LINE_TOKEN || '';
const ORDER_SHEET_ID = '1-FmCKLXnneSdEf5Q9-JQZ80Y1FBt0WXOU6C2fXUycH4';
const NOTIFY_LINE_ID = 'chami_1031';

// Basic Auth 驗證（只對控制台，不對訂購表單和 LIFF）
function checkAuth(req, res, next) {
  // 以下路徑不需要驗證
  if (req.path === '/order.html' || req.path === '/api/order') return next();
  if (req.path.startsWith('/liff')) return next();
  if (req.path.startsWith('/api/schedule')) return next();
  if (req.path.startsWith('/api/product')) return next();   // 涵蓋 /api/product 和 /api/products
  if (req.path.startsWith('/api/imgproxy')) return next();
  // 🆕 購物網站相關（公開）
  if (req.path === '/shop' || req.path.startsWith('/shop/')) return next();
  if (req.path === '/cart' || req.path === '/checkout') return next();
  if (req.path === '/api/orders') return next();

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

// ── 動態 OGP（order.html 商品預覽卡）──────────────
app.get('/order.html', async (req, res) => {
  const code = (req.query.code || '').trim();
  let name = '哈摟米米童著';
  let price = '';
  let imageUrl = 'https://mimi-sender.zeabur.app/icon.png';
  let description = '點我立即訂購';

  if (code) {
    try {
      for (const config of SHEET_CONFIGS) {
        for (const sheetName of config.sheets) {
          const url = `https://docs.google.com/spreadsheets/d/${config.id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
          const r = await fetch(url);
          const text = await r.text();
          const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
          for (const row of json.table.rows) {
            const getVal = (i) => row.c && row.c[i] && row.c[i].v != null ? String(row.c[i].v).trim() : '';
            if (getVal(COL.barcode) !== code) continue;
            name = getVal(COL.name) || name;
            const priceRaw = getVal(COL.price);
            price = priceRaw ? (priceRaw.startsWith('$') ? priceRaw : `$${priceRaw}`) : '';
            imageUrl = getVal(COL.imageUrl) || imageUrl;
            description = `${price ? price + ' | ' : ''}現貨供應，點我立即訂購`;
            break;
          }
          if (name !== '哈摟米米童著') break;
        }
        if (name !== '哈摟米米童著') break;
      }
    } catch(e) { console.warn('OGP查詢失敗:', e.message); }
  }

  const pageUrl = `https://mimi-sender.zeabur.app/order.html?code=${encodeURIComponent(code)}`;
  const html = fs.readFileSync(path.join(__dirname, 'order.html'), 'utf8');
  const ogpTags = `
    <meta property="og:title" content="${name}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="哈摟米米童著" />
    <meta name="twitter:card" content="summary_large_image" />`;
  const result = html.replace('</head>', `${ogpTags}\n</head>`);
  res.send(result);
});
// ──────────────────────────────────────────────────

// 🆕 ═══════════════════════════════════════════════
// 購物網站前台路由（公開）
// ═══════════════════════════════════════════════════

// /shop → 商品列表頁
app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'shop.html'));
});

// /shop/:code → 單一商品頁（含動態 OGP）
app.get('/shop/:code', async (req, res) => {
  const code = req.params.code;
  let name = '哈摟米米童著';
  let price = '';
  let imageUrl = 'https://mimi-sender.zeabur.app/icon.png';
  let description = '台中北屯童裝專賣';

  // 查商品資料（沿用 OGP 邏輯）
  if (code) {
    try {
      for (const config of SHEET_CONFIGS) {
        let found = false;
        for (const sheetName of config.sheets) {
          const url = `https://docs.google.com/spreadsheets/d/${config.id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
          const r = await fetch(url);
          const text = await r.text();
          const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
          for (const row of json.table.rows) {
            const getVal = (i) => row.c && row.c[i] && row.c[i].v != null ? String(row.c[i].v).trim() : '';
            if (getVal(COL.barcode) !== code) continue;
            name = getVal(COL.name) || name;
            const priceRaw = getVal(COL.price);
            price = priceRaw ? (priceRaw.startsWith('$') ? priceRaw : `$${priceRaw}`) : '';
            imageUrl = getVal(COL.imageUrl) || imageUrl;
            description = `${price ? price + ' ｜ ' : ''}哈摟米米童著・台中北屯`;
            found = true;
            break;
          }
          if (found) break;
        }
        if (found) break;
      }
    } catch(e) { console.warn('商品頁 OGP 查詢失敗:', e.message); }
  }

  const pageUrl = `https://mimi-sender.zeabur.app/shop/${encodeURIComponent(code)}`;
  const html = fs.readFileSync(path.join(__dirname, 'product.html'), 'utf8');
  const ogpTags = `
    <meta property="og:title" content="${escapeHtml(name)} ｜ 哈摟米米童著" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="哈摟米米童著" />
    <meta name="twitter:card" content="summary_large_image" />`;
  const result = html.replace('<!-- OGP tags 由 server.js 動態注入 -->', ogpTags);
  res.send(result);
});

// /cart → 購物車頁
app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'cart.html'));
});

// /checkout → 結帳頁
app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'checkout.html'));
});

// HTML 轉義工具
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ═══════════════════════════════════════════════════

app.use(express.static(__dirname));

// ── 訂單 API（單品，order.html 用）──
app.post('/api/order', async (req, res) => {
  const { time, code, name, size, customerName, customerId, price } = req.body;

  try {
    const sheetUrl = process.env.SHEET_WEBAPP_URL;
    if (sheetUrl) {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time, code, name, size, customerName, customerId, price })
      });
    }

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

// 🆕 ═══════════════════════════════════════════════
// 多商品訂單 API（購物網站用）
// ═══════════════════════════════════════════════════
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ success: false, error: '訂單為空' });
    }

    // 產生訂單編號：線上-20260429-001
    const now = new Date();
    const dateStr = now.toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '');
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    const orderId = `線上-${dateStr}-${seq}`;
    const ts = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    // 寫入 Google Sheet（透過 Apps Script Web App）
    const sheetUrl = process.env.SHEET_WEBAPP_URL;
    console.log(`[訂單 ${orderId}] 開始處理`);
    console.log(`[訂單 ${orderId}] SHEET_WEBAPP_URL 設定狀態:`, sheetUrl ? '已設定' : '❌ 未設定');

    if (sheetUrl) {
      try {
        const sheetPayload = {
          action: 'createOrder',
          orderId,
          timestamp: ts,
          buyer: orderData.buyer,
          shipping: orderData.shipping,
          items: orderData.items,
          subtotal: orderData.subtotal,
          shipFee: orderData.shipFee,
          total: orderData.total
        };
        console.log(`[訂單 ${orderId}] 準備送出 payload:`, JSON.stringify(sheetPayload).slice(0, 200));

        const sheetRes = await fetch(sheetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sheetPayload),
          redirect: 'follow'  // 🆕 處理 Apps Script 的 302 重定向
        });

        console.log(`[訂單 ${orderId}] Apps Script 回應狀態:`, sheetRes.status);
        const sheetText = await sheetRes.text();
        console.log(`[訂單 ${orderId}] Apps Script 回應內容:`, sheetText.slice(0, 300));
      } catch(e) {
        console.error(`[訂單 ${orderId}] 寫入 Sheet 失敗:`, e.message);
        console.error('完整錯誤:', e);
      }
    }

    // 推播 LINE 通知米米
    const token = process.env.LINE_TOKEN_HELLOMIMI;
    const notifyUserId = process.env.NOTIFY_USER_ID;

    if (token && notifyUserId) {
      const itemsText = orderData.items.map(i =>
        `・${i.name} ${i.size} ×${i.qty}`
      ).join('\n');
      const buyer = orderData.buyer || {};
      const notifyText =
        `🛒 新訂單 ${orderId}\n` +
        `━━━━━━━━━━━\n` +
        `${itemsText}\n` +
        `━━━━━━━━━━━\n` +
        `小計：NT$ ${orderData.subtotal}\n` +
        `運費：${orderData.shipFee === 0 ? '免運' : 'NT$ ' + orderData.shipFee}\n` +
        `合計：NT$ ${orderData.total}\n` +
        `運送：${orderData.shipping.methodName}\n` +
        `\n👤 ${buyer.name}\n` +
        `📱 ${buyer.phone}\n` +
        `💬 LINE：${buyer.lineId}` +
        (buyer.address ? `\n📍 ${buyer.address}` : '') +
        (buyer.note ? `\n📝 ${buyer.note}` : '');

      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to: notifyUserId,
          messages: [{ type: 'text', text: notifyText }]
        })
      }).catch(e => console.error('LINE 推播失敗:', e.message));
    }

    res.json({ success: true, orderId });
  } catch(e) {
    console.error('多商品訂單錯誤:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
// ═══════════════════════════════════════════════════

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

// 商品查詢 API（用 code 查詢單一商品）
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
          // 🆕 為了讓購物網站好用，回傳的 success 包一層 product
          const product = {
            code: barcode,
            barcode: barcode,
            name: getVal(COL.name),
            sizes: getVal(COL.sizes),
            price: priceRaw ? priceRaw.replace(/^\$/, '') : '',  // 🆕 去掉 $ 符號方便計算
            imageUrl: getVal(COL.imageUrl),
            cat: getVal(COL.cat) || sheetName,
          };
          return res.json({ success: true, product, ...product });  // 同時兼容新舊呼叫
        }
      }
    }
    res.status(404).json({ success: false, error: '找不到商品' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 🆕 ═══════════════════════════════════════════════
// 商品列表 API（購物網站用，一次回傳全部商品）
// ═══════════════════════════════════════════════════
let productsCache = null;
let productsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分鐘快取

app.get('/api/products', async (req, res) => {
  // 用快取避免每次都打 Google Sheet
  const now = Date.now();
  if (productsCache && (now - productsCacheTime) < CACHE_TTL) {
    return res.json({ success: true, products: productsCache, cached: true });
  }

  try {
    const allProducts = [];
    for (const config of SHEET_CONFIGS) {
      for (const sheetName of config.sheets) {
        try {
          const url = `https://docs.google.com/spreadsheets/d/${config.id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
          const r = await fetch(url);
          const text = await r.text();
          const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
          for (const row of json.table.rows) {
            const getVal = (i) => row.c && row.c[i] && row.c[i].v != null ? String(row.c[i].v).trim() : '';
            const barcode = getVal(COL.barcode);
            const name = getVal(COL.name);
            if (!barcode || !name) continue;  // 跳過空行
            const priceRaw = getVal(COL.price);
            allProducts.push({
              barcode,
              name,
              sizes: getVal(COL.sizes),
              price: priceRaw ? priceRaw.replace(/^\$/, '') : '',
              imageUrl: getVal(COL.imageUrl),
              cat: getVal(COL.cat) || sheetName,
              sheet: sheetName,
            });
          }
        } catch(e) {
          console.warn(`讀取 ${sheetName} 失敗:`, e.message);
        }
      }
    }
    productsCache = allProducts;
    productsCacheTime = now;
    res.json({ success: true, products: allProducts, cached: false });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 手動清快取（萬一商品更新需要立即生效）
app.get('/api/products/refresh', (req, res) => {
  productsCache = null;
  productsCacheTime = 0;
  res.json({ success: true, message: '快取已清除' });
});
// ═══════════════════════════════════════════════════

// ── 排程系統 ──────────────────────────────────────
const schedules = [];

setInterval(() => {
  const now = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
  const token = process.env.LINE_TOKEN_HELLOMIMI;
  const notifyUserId = process.env.NOTIFY_USER_ID;
  if (!token || !notifyUserId) return;

  schedules.forEach(async (s, idx) => {
    if (s.time === now && !s.fired) {
      s.fired = true;
      const itemList = s.items.map(p => `・${p.name}（${p.code}）`).join('\n');
      const codes = s.items.map(p => p.code).join(',');
      const liffUrl = `https://liff.line.me/1657385678-5T9F9nca?codes=${encodeURIComponent(codes)}`;
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

app.post('/api/schedule', (req, res) => {
  const { time, label, items } = req.body;
  if (!time || !items || items.length === 0) return res.status(400).json({ error: '缺少參數' });
  const id = Date.now().toString();
  schedules.push({ id, time, label: label || '', items, fired: false, createdAt: new Date().toISOString() });
  res.json({ success: true, id });
});

app.get('/api/schedule', (req, res) => {
  res.json(schedules.filter(s => !s.fired));
});

app.delete('/api/schedule/:id', (req, res) => {
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '找不到排程' });
  schedules.splice(idx, 1);
  res.json({ success: true });
});
// ──────────────────────────────────────────────────

// 圖片代理
app.get('/api/imgproxy', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('https://lh3.googleusercontent.com')) {
    return res.status(400).send('invalid url');
  }
  try {
    const r = await fetch(url);
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || 'image/jpeg';
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch(e) {
    res.status(500).send('error');
  }
});

// LIFF 專用路徑
app.get('/liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Mimi Sender running on port ${PORT}`));
