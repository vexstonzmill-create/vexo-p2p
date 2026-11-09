require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 chars in .env');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    return {
      users: [], ads: [], orders: [], messages: [], reviews: [],
      counters: { user: 0, ad: 0, order: 0, message: 0, review: 0 }
    };
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } 
  catch { console.error('❌ db.json corrupted'); process.exit(1); }
}

let DB = loadDB();
function saveDB() { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2), 'utf8'); }
function nextId(kind) { DB.counters[kind] = (DB.counters[kind] || 0) + 1; return DB.counters[kind]; }

if (process.argv.includes('--seed-admin')) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  if (DB.users.find(u => u.username === username)) {
    console.log('✓ Admin already exists'); process.exit(0);
  }
  const hash = bcrypt.hashSync(password, 10);
  DB.users.push({
    id: nextId('user'), username, email: username + '@vexo.local',
    passwordHash: hash, role: 'admin', kycStatus: 'verified',
    blocked: false, createdAt: new Date().toISOString()
  });
  saveDB();
  console.log('✓ Admin created: ' + username + ' / ' + password);
  process.exit(0);
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    const user = DB.users.find(u => u.id === p.sub);
    if (!user || user.blocked) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'unauthorized' }); }
}

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, role: u.role, kycStatus: u.kycStatus, createdAt: u.createdAt };
}

function userStats(userId) {
  const completed = DB.orders.filter(o => o.status === 'completed' && (o.buyerId === userId || o.sellerId === userId)).length;
  const cancelled = DB.orders.filter(o => o.status === 'cancelled' && (o.buyerId === userId || o.sellerId === userId)).length;
  const reviews = DB.reviews.filter(r => r.targetId === userId);
  const avg = reviews.length ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2)) : null;
  return {
    dealsTotal: completed + cancelled, dealsCompleted: completed,
    successRate: (completed + cancelled) ? Math.round((completed / (completed + cancelled)) * 100) : null,
    reviewsCount: reviews.length, ratingAvg: avg
  };
}

app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || username.length < 3) return res.status(400).json({ error: 'short_username' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'bad_email' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'short_password' });
  if (DB.users.find(u => u.username === username)) return res.status(409).json({ error: 'user_exists' });
  if (DB.users.find(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'email_exists' });

  const user = {
    id: nextId('user'), username, email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10), role: 'user',
    kycStatus: 'none', blocked: false, createdAt: new Date().toISOString()
  };
  DB.users.push(user); saveDB();
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body || {};
  const user = DB.users.find(u => u.email === String(login).toLowerCase() || u.username === login);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'invalid_credentials' });
  if (user.blocked) return res.status(403).json({ error: 'blocked' });
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/users/me', auth, (req, res) => res.json({ user: publicUser(req.user), stats: userStats(req.user.id) }));
app.patch('/api/users/me', auth, (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'bad_email' });
  if (DB.users.find(u => u.email === email.toLowerCase() && u.id !== req.user.id)) return res.status(409).json({ error: 'email_taken' });
  req.user.email = email.toLowerCase(); saveDB(); res.json({ user: publicUser(req.user) });
});

function shapeAd(a) {
  const u = DB.users.find(x => x.id === a.userId);
  const stats = userStats(a.userId);
  const realMaxRub = Math.min(a.maxRub, a.amountLeft * a.price);

  return {
    id: a.id, userId: a.userId, username: u?.username || '?', kycStatus: u?.kycStatus || 'none',
    side: a.side, faceType: a.faceType, asset: a.asset, price: a.price,
    amountTotal: a.amountTotal, amountLeft: a.amountLeft, 
    totalRub: (a.amountLeft * a.price).toFixed(2), 
    minRub: a.minRub, 
    maxRub: realMaxRub.toFixed(2), 
    paymentMethods: a.paymentMethods, terms: a.terms,
    active: a.active, createdAt: a.createdAt, ...stats
  };
}

app.get('/api/ads', (req, res) => {
  let list = DB.ads.filter(a => a.active && a.amountLeft > 0);
  if (req.query.side) list = list.filter(a => a.side === req.query.side);
  if (req.query.asset) list = list.filter(a => a.asset === req.query.asset);
  if (req.query.face_type) list = list.filter(a => a.faceType === req.query.face_type);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items: list.map(shapeAd) });
});

app.post('/api/ads', auth, (req, res) => {
  const { side, face_type, asset, price, amount_total, min_rub, max_rub, payment_methods, terms } = req.body || {};
  if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'bad_side' });
  const p = Number(price), at = Number(amount_total), mn = Number(min_rub), mx = Number(max_rub);
  if (!(p > 0) || !(at > 0) || !(mn > 0) || !(mx > 0)) return res.status(400).json({ error: 'bad_amounts' });
  if (mn > mx) return res.status(400).json({ error: 'min_gt_max' });
  const totalRub = at * p;
  if (mx > totalRub) return res.status(400).json({ error: 'max_exceeds_total' });
  const ad = {
    id: nextId('ad'), userId: req.user.id, side, faceType: face_type, asset,
    price: p, amountTotal: at, amountLeft: at, minRub: mn, maxRub: mx,
    paymentMethods: payment_methods, terms: (terms || '').slice(0, 2000),
    active: true, createdAt: new Date().toISOString()
  };
  DB.ads.push(ad); saveDB(); res.status(201).json(shapeAd(ad));
});

app.get('/api/ads/my', auth, (req, res) => res.json({ items: DB.ads.filter(a => a.userId === req.user.id).map(shapeAd) }));

const STATUS_LABEL = { waiting: 'Ожидает оплаты', paid: 'Оплата отмечена', completed: 'Завершён', cancelled: 'Отменён', dispute: 'Спор' };

function shapeOrder(o) {
  const buyer = DB.users.find(u => u.id === o.buyerId);
  const seller = DB.users.find(u => u.id === o.sellerId);
  return {
    id: o.id, publicId: o.publicId, adId: o.adId, asset: o.asset, price: o.price,
    amountRub: o.amountRub, amountAsset: o.amountAsset, faceType: o.faceType,
    paymentMethod: o.paymentMethod, status: o.status, statusLabel: STATUS_LABEL[o.status] || o.status,
    buyer: { id: o.buyerId, username: buyer?.username || '?' },
    seller: { id: o.sellerId, username: seller?.username || '?' },
    createdAt: o.createdAt, expiresAt: o.expiresAt
  };
}

app.post('/api/orders', auth, (req, res) => {
  const { ad_id, amount_rub, payment_method } = req.body || {};
  const ad = DB.ads.find(a => a.id === Number(ad_id));
  if (!ad || !ad.active) return res.status(409).json({ error: 'ad_inactive' });
  if (ad.userId === req.user.id) return res.status(409).json({ error: 'self_trade' });
  if (!ad.paymentMethods.includes(payment_method)) return res.status(400).json({ error: 'bad_payment' });
  const rub = Number(amount_rub);
  if (!(rub > 0) || rub < ad.minRub) return res.status(400).json({ error: 'below_min' });
  if (rub > ad.maxRub) return res.status(400).json({ error: 'above_max' });
  const assetQty = rub / ad.price;
  if (assetQty > ad.amountLeft) return res.status(400).json({ error: 'insufficient_asset' });
  
  const buyerId = ad.side === 'sell' ? req.user.id : ad.userId;
  const sellerId = ad.side === 'sell' ? ad.userId : req.user.id;
  ad.amountLeft -= assetQty;
  
  const order = {
    id: nextId('order'), publicId: 'VX-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    adId: ad.id, buyerId, sellerId, asset: ad.asset, price: ad.price,
    amountRub: rub, amountAsset: Number(assetQty.toFixed(8)),
    faceType: ad.faceType, paymentMethod: payment_method, status: 'waiting',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    history: [{ status: 'waiting', at: new Date().toISOString(), note: 'Ордер создан' }]
  };
  DB.orders.push(order); saveDB(); res.status(201).json(shapeOrder(order));
});

app.get('/api/orders/my', auth, (req, res) => {
  let list = DB.orders.filter(o => o.buyerId === req.user.id || o.sellerId === req.user.id);
  const f = req.query.status;
  if (f === 'active') list = list.filter(o => ['waiting', 'paid'].includes(o.status));
  else if (f === 'completed') list = list.filter(o => o.status === 'completed');
  else if (f === 'cancelled') list = list.filter(o => o.status === 'cancelled');
  else if (f === 'dispute') list = list.filter(o => o.status === 'dispute');
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items: list.map(shapeOrder) });
});

app.get('/api/orders/:id', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.buyerId !== req.user.id && o.sellerId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  res.json({ order: shapeOrder(o), history: o.history });
});

function transition(orderId, to, note) {
  const o = DB.orders.find(o => o.id === orderId);
  o.status = to; o.history.push({ status: to, at: new Date().toISOString(), note });
  if (to === 'cancelled') { const ad = DB.ads.find(a => a.id === o.adId); if (ad) ad.amountLeft += o.amountAsset; }
  saveDB(); return o;
}

app.post('/api/orders/:id/paid', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.id));
  if (o.buyerId !== req.user.id || o.status !== 'waiting') return res.status(409).json({ error: 'bad' });
  transition(o.id, 'paid', 'Оплата отмечена'); res.json({ ok: true });
});
app.post('/api/orders/:id/confirm', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.id));
  if (o.sellerId !== req.user.id || o.status !== 'paid') return res.status(409).json({ error: 'bad' });
  transition(o.id, 'completed', 'Завершён'); res.json({ ok: true });
});
app.post('/api/orders/:id/cancel', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.id));
  if (o.status !== 'waiting') return res.status(409).json({ error: 'bad' });
  transition(o.id, 'cancelled', 'Отменён'); res.json({ ok: true });
});
app.post('/api/orders/:id/dispute', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.id));
  if (o.status !== 'paid') return res.status(409).json({ error: 'bad' });
  transition(o.id, 'dispute', 'Спор: ' + (req.body?.reason || '')); res.json({ ok: true });
});

app.get('/api/chat/:orderId', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.orderId));
  if (!o || (o.buyerId !== req.user.id && o.sellerId !== req.user.id)) return res.status(403).json({ error: 'forbidden' });
  const items = DB.messages.filter(m => m.orderId === o.id).map(m => ({
    id: m.id, senderId: m.senderId, senderUsername: DB.users.find(u => u.id === m.senderId)?.username || '?',
    text: m.text, createdAt: m.createdAt, isMine: m.senderId === req.user.id
  }));
  res.json({ items });
});

app.post('/api/chat/:orderId', auth, (req, res) => {
  const o = DB.orders.find(o => o.id === Number(req.params.orderId));
  if (!o || ['completed', 'cancelled'].includes(o.status)) return res.status(409).json({ error: 'closed' });
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'empty' });
  const m = { id: nextId('message'), orderId: o.id, senderId: req.user.id, text, createdAt: new Date().toISOString() };
  DB.messages.push(m); saveDB();
  res.status(201).json({ id: m.id, senderId: m.senderId, senderUsername: req.user.username, text: m.text, createdAt: m.createdAt, isMine: true });
});

app.post('/api/reviews', auth, (req, res) => {
  const { order_id, rating, comment } = req.body || {};
  const o = DB.orders.find(o => o.id === Number(order_id));
  if (!o || o.status !== 'completed') return res.status(409).json({ error: 'not_completed' });
  const isBuyer = o.buyerId === req.user.id, isSeller = o.sellerId === req.user.id;
  if (!isBuyer && !isSeller) return res.status(403).json({ error: 'not_party' });
  if (DB.reviews.find(r => r.orderId === o.id && r.authorId === req.user.id)) return res.status(409).json({ error: 'already_reviewed' });
  const r = Number(rating);
  if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'bad_rating' });
  const review = {
    id: nextId('review'), orderId: o.id, authorId: req.user.id, targetId: isBuyer ? o.sellerId : o.buyerId,
    rating: r, comment: (comment || '').slice(0, 1000), createdAt: new Date().toISOString()
  };
  DB.reviews.push(review); saveDB(); res.status(201).json(review);
});

app.get('/api/stats', (req, res) => {
  const users = DB.users.length;
  const completedOrders = DB.orders.filter(o => o.status === 'completed');
  const deals = completedOrders.length;
  const turnover = completedOrders.reduce((sum, o) => sum + o.amountRub, 0);
  const reviews = DB.reviews;
  const avgRating = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2) : '—';
  res.json({ users, deals, turnover, avgRating });
});

const FRONTEND = path.join(__dirname);
app.use(express.static(FRONTEND));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

app.listen(PORT, () => {
  console.log('VEXO P2P started on http://localhost:' + PORT);
});