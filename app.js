document.addEventListener('contextmenu', e => { if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); });

const API = {
  token: () => localStorage.getItem('vexo_token'),
  user: () => { try { return JSON.parse(localStorage.getItem('vexo_user')); } catch { return null; } },
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token()) headers.Authorization = 'Bearer ' + this.token();
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    
    if (res.status === 401) {
      localStorage.removeItem('vexo_token');
      localStorage.removeItem('vexo_user');
      window.location.reload(); // Автоматический выход при истекшем токене
    }

    if (!res.ok) { const e = new Error(data.error || 'error'); e.code = data.error; e.status = res.status; throw e; }
    return data;
  }
};

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n || 0);
const fmtDec = (n, d = 2) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

function confirmAsync(title, message, okText = 'OK') {
  return new Promise(resolve => {
    const overlay = document.getElementById('dialogOverlay'), content = document.getElementById('dialogContent');
    content.innerHTML = `<h3 style="font-size:17px;font-weight:700">${title}</h3><p style="font-size:14px;color:var(--dim);margin:10px 0">${message}</p><div style="display:flex;gap:10px;margin-top:4px"><button class="btn btn-ghost" style="flex:1" id="dlgCancel">Отмена</button><button class="btn btn-primary" style="flex:1" id="dlgOk">${okText}</button></div>`;
    overlay.classList.add('active');
    document.getElementById('dlgCancel').onclick = () => { overlay.classList.remove('active'); resolve(false); };
    document.getElementById('dlgOk').onclick = () => { overlay.classList.remove('active'); resolve(true); };
  });
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

const titles = { home: 'Главная', market: 'Маркет', create: 'Создать', orders: 'Ордера', order: 'Ордер', profile: 'Профиль', wallet: 'Кошелёк' };
let previousScreen = 'home';

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-btn, .bn-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`[data-screen="${name}"]`).forEach(b => b.classList.add('active'));
  document.getElementById('topbarTitle').textContent = titles[name] || '';
  document.getElementById('backBtn').classList.toggle('hidden', !['order'].includes(name));
  if (name === 'market') loadMarket();
  if (name === 'orders') loadOrders('active');
  if (name === 'profile') loadProfile();
  if (name === 'home') loadHome();
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-screen]').forEach(b => b.onclick = e => { e.preventDefault(); const s = b.dataset.screen; if (!['order'].includes(s)) previousScreen = s; show(s); });
document.getElementById('backBtn').onclick = () => show(previousScreen);

// Карусель
(function() {
  const track = document.getElementById('bannerTrack');
  const dots = document.querySelectorAll('.banner-dot');
  let idx = 0, timer;
  function go(i) { idx = (i + dots.length) % dots.length; track.style.transform = `translateX(-${idx * 100}%)`; dots.forEach((d, k) => d.classList.toggle('active', k === idx)); }
  function auto() { clearInterval(timer); timer = setInterval(() => go(idx + 1), 4500); }
  dots.forEach((d, i) => d.onclick = () => { go(i); auto(); });
  let sx = 0; const vp = track.parentElement;
  vp.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  vp.addEventListener('touchend', e => { const d = sx - e.changedTouches[0].clientX; if (Math.abs(d) > 40) { go(d > 0 ? idx + 1 : idx - 1); auto(); } else { go(idx); } });
  auto();
})();

// Авторизация
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('emailField').classList.toggle('hidden', mode !== 'register');
  document.getElementById('loginLabel').textContent = mode === 'register' ? 'Никнейм' : 'Логин или Email';
  document.getElementById('authSubmit').textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
  document.getElementById('authError').textContent = '';
}

document.getElementById('tabLogin').onclick = () => setAuthMode('login');
document.getElementById('tabRegister').onclick = () => setAuthMode('register');
document.getElementById('loginBtn').onclick = () => { setAuthMode('login'); document.getElementById('authModal').classList.add('active'); };
document.getElementById('avatarBtn').onclick = () => show('profile');

document.getElementById('authForm').onsubmit = async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('authError'), btn = document.getElementById('authSubmit');
  errEl.textContent = ''; btn.disabled = true; btn.textContent = '...';
  try {
    const body = { password: document.getElementById('authPass').value };
    let path;
    if (authMode === 'login') { path = '/auth/login'; body.login = document.getElementById('authLogin').value; }
    else { path = '/auth/register'; body.username = document.getElementById('authLogin').value; body.email = document.getElementById('authEmail').value; }
    const data = await API.req('POST', path, body);
    localStorage.setItem('vexo_token', data.token);
    localStorage.setItem('vexo_user', JSON.stringify(data.user));
    closeModal('authModal');
    updateAuthUI();
    toast(authMode === 'login' ? 'Добро пожаловать, ' + data.user.username : 'Аккаунт создан!', 'success');
    show('market');
  } catch (err) {
    const map = { invalid_credentials: 'Неверный логин или пароль', user_exists: 'Никнейм уже занят', email_exists: 'Email занят', short_password: 'Пароль мин. 8 символов', short_username: 'Никнейм мин. 3 символа', bad_email: 'Неверный email' };
    errEl.textContent = map[err.code] || err.message;
  } finally { btn.disabled = false; btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться'; }
};

function updateAuthUI() {
  const u = API.user(), loginBtn = document.getElementById('loginBtn'), avatarBtn = document.getElementById('avatarBtn');
  if (u) { loginBtn.classList.add('hidden'); avatarBtn.classList.remove('hidden'); avatarBtn.textContent = u.username[0].toUpperCase(); }
  else { loginBtn.classList.remove('hidden'); avatarBtn.classList.add('hidden'); }
}

// Главная и Маркет
async function loadHome() {
  try {
    const stats = await API.req('GET', '/stats');
    document.getElementById('statUsers').textContent = fmt(stats.users);
    document.getElementById('statDeals').textContent = fmt(stats.deals);
    document.getElementById('statTurnover').textContent = fmt(stats.turnover) + ' ₽';
    document.getElementById('statRating').textContent = stats.avgRating;
  } catch (e) {}
}

async function loadMarket() {
  const filters = {};
  const activeTab = document.querySelector('#marketSideTabs .tab.active');
  if (activeTab && activeTab.dataset.side) filters.side = activeTab.dataset.side;
  
  const faceChip = document.querySelector('#filterFace .chip.active');
  if (faceChip && faceChip.dataset.val) filters.face_type = faceChip.dataset.val;
  
  const assetChip = document.querySelector('#filterAsset .icon-chip.active');
  if (assetChip && assetChip.dataset.val) filters.asset = assetChip.dataset.val;
  
  const minAmt = document.getElementById('filterMinAmount').value;
  const maxAmt = document.getElementById('filterMaxAmount').value;
  if (minAmt) filters.min_amount = minAmt;
  if (maxAmt) filters.max_amount = maxAmt;

  document.getElementById('adsList').innerHTML = '<p style="text-align:center;padding:20px;color:var(--dim)">Загрузка...</p>';
  try {
    const { items } = await API.req('GET', '/ads?' + new URLSearchParams(filters));
    document.getElementById('adsList').innerHTML = items.length ? items.map(renderAd).join('') : '<p style="text-align:center;color:var(--dim);padding:30px">Объявлений не найдено</p>';
    bindAdButtons();
  } catch (e) { document.getElementById('adsList').innerHTML = 'Ошибка'; }
}

function renderAd(ad) {
  const isSell = ad.side === 'sell';
  const faceLabel = ad.faceType === 'first' ? '1-е лицо' : '3-е лицо';
  const faceClass = ad.faceType === 'first' ? 'first' : 'third';
  window._ads = window._ads || {}; window._ads[ad.id] = ad;
  const pays = (ad.paymentMethods || []).map(p => `<span class="pay-tag">${p}</span>`).join('');
  const coinClass = ad.asset.toLowerCase();
  
  return `<div class="ad-card">
    <div class="ad-head">
      <div class="avatar">${ad.username[0].toUpperCase()}</div>
      <div class="ad-user">
        <div class="ad-name">${ad.username} <span class="badge-face ${faceClass}">${faceLabel}</span></div>
        <div class="ad-meta"><span>★ ${ad.ratingAvg || '—'}</span><span>${ad.successRate !== null ? ad.successRate + '%' : '—'}</span><span>${ad.dealsCompleted || 0} сделок</span></div>
      </div>
    </div>
    <div class="ad-body">
      <div><div class="ad-lbl">Курс</div><div class="ad-val">${fmt(ad.price)} ₽</div></div>
      <div><div class="ad-lbl">Доступно</div><div class="ad-val" style="display:flex;align-items:center;gap:4px;"><div class="coin-icon ${coinClass}" style="width:18px;height:18px;font-size:10px;">${ad.asset[0]}</div> ${fmtDec(ad.amountLeft, 2)}</div></div>
      <div><div class="ad-lbl">Лимит</div><div class="ad-val" style="font-size:13px">${fmt(ad.minRub)} - ${fmt(ad.maxRub)} ₽</div></div>
      <div><div class="ad-lbl">Объем</div><div class="ad-val" style="font-size:13px">${fmt(ad.totalRub)} ₽</div></div>
    </div>
    ${pays ? `<div style="margin-bottom:14px">${pays}</div>` : ''}
    <button class="btn ${isSell ? 'btn-buy' : 'btn-sell'} btn-block btn-sm" data-ad-id="${ad.id}">${isSell ? 'Купить' : 'Продать'} ${ad.asset}</button>
  </div>`;
} 

function bindAdButtons() {
  document.querySelectorAll('[data-ad-id]').forEach(b => b.onclick = () => {
    if (!API.user()) { document.getElementById('authModal').classList.add('active'); return; }
    openOrderModal(+b.dataset.adId);
  });
}

document.querySelectorAll('#marketSideTabs .tab').forEach(c => c.onclick = () => {
  document.querySelectorAll('#marketSideTabs .tab').forEach(x => x.classList.remove('active'));
  c.classList.add('active'); loadMarket();
});
document.querySelectorAll('#filterFace .chip').forEach(c => c.onclick = () => {
  document.querySelectorAll('#filterFace .chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active'); loadMarket();
});
document.querySelectorAll('#filterAsset .icon-chip').forEach(c => c.onclick = () => {
  document.querySelectorAll('#filterAsset .icon-chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active'); loadMarket();
});
document.getElementById('filterMinAmount').oninput = loadMarket;
document.getElementById('filterMaxAmount').oninput = loadMarket;

// Создание и Редактирование объявления
const fPrice = document.getElementById('f-price'), fAmount = document.getElementById('f-amount'), fMax = document.getElementById('f-max');
function recalc() {
  const total = (parseFloat(fAmount.value) || 0) * (parseFloat(fPrice.value) || 0);
  document.getElementById('calcTotal').textContent = fmt(total) + ' ₽';
  document.getElementById('calcTotal2').textContent = fmt(total) + ' ₽';
  document.getElementById('maxHint').textContent = total > 0 ? 'Не больше ' + fmt(total) + ' ₽' : 'Введите данные для расчета';
  fMax.style.borderColor = parseFloat(fMax.value) > total ? 'var(--red)' : 'var(--brd)';
}
[fPrice, fAmount, fMax].forEach(el => el.oninput = recalc); recalc();

document.querySelectorAll('#f-side .seg-btn').forEach(b => b.onclick = () => { document.querySelectorAll('#f-side .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); });
document.querySelectorAll('#f-face .seg-btn').forEach(b => b.onclick = () => { document.querySelectorAll('#f-face .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); });
document.querySelectorAll('#f-payments .pay-chip').forEach(c => c.onclick = () => c.classList.toggle('active'));
document.querySelectorAll('#f-asset-select .icon-chip').forEach(c => c.onclick = () => {
  document.querySelectorAll('#f-asset-select .icon-chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  document.getElementById('f-asset-label').textContent = c.dataset.val;
});

document.getElementById('createBtn').onclick = async () => {
  const errEl = document.getElementById('createError'); errEl.textContent = '';
  if (!API.user()) { errEl.textContent = 'Войдите в аккаунт'; setTimeout(() => document.getElementById('authModal').classList.add('active'), 500); return; }
  const payments = [...document.querySelectorAll('#f-payments .pay-chip.active')].map(c => c.dataset.val);
  if (!payments.length) { errEl.textContent = 'Выберите способ оплаты'; return; }
  if (!fPrice.value || !fAmount.value || !document.getElementById('f-min').value || !fMax.value) { errEl.textContent = 'Заполните все поля'; return; }
  
  const btn = document.getElementById('createBtn'); btn.disabled = true; btn.textContent = 'Публикация...';
  const asset = document.querySelector('#f-asset-select .icon-chip.active').dataset.val;
  
  try {
    await API.req('POST', '/ads', {
      side: document.querySelector('#f-side .seg-btn.active').dataset.val,
      face_type: document.querySelector('#f-face .seg-btn.active').dataset.val,
      asset: asset,
      price: fPrice.value, amount_total: fAmount.value,
      min_rub: document.getElementById('f-min').value, max_rub: fMax.value,
      payment_methods: payments, terms: document.getElementById('f-terms').value
    });
    toast('Объявление опубликовано!', 'success'); show('market');
  } catch (err) {
    const map = { max_exceeds_total: 'Максимальный лимит больше общего объёма', min_gt_max: 'Минимум больше максимума', bad_amounts: 'Проверьте числа' };
    errEl.textContent = map[err.code] || err.message;
  } finally { btn.disabled = false; btn.textContent = 'Опубликовать'; }
};

// Модалка Редактирования
let currentEditAdId = null;
function openEditAd(adId) {
  const ad = window._myAds[adId];
  if (!ad) return;
  currentEditAdId = adId;
  document.getElementById('edit-price').value = ad.price;
  document.getElementById('edit-min').value = ad.minRub;
  document.getElementById('edit-max').value = ad.maxRub;
  document.getElementById('edit-terms').value = ad.terms || '';
  document.getElementById('editError').textContent = '';
  document.getElementById('editAdModal').classList.add('active');
}

document.getElementById('editSaveBtn').onclick = async () => {
  const btn = document.getElementById('editSaveBtn'); btn.disabled = true;
  try {
    await API.req('PATCH', `/ads/${currentEditAdId}`, {
      price: document.getElementById('edit-price').value,
      min_rub: document.getElementById('edit-min').value,
      max_rub: document.getElementById('edit-max').value,
      payment_methods: ['СБП'], // Упрощенно для формы
      terms: document.getElementById('edit-terms').value
    });
    closeModal('editAdModal'); toast('Объявление обновлено!', 'success'); loadProfile();
  } catch (e) { document.getElementById('editError').textContent = e.message; }
  finally { btn.disabled = false; }
};

// Модалка Ордера
let currentAd = null, selectedPay = null;
function openOrderModal(adId) {
  const ad = (window._ads || {})[adId]; if (!ad) return;
  currentAd = ad; selectedPay = ad.paymentMethods?.[0] || null;
  const isBuy = ad.side === 'sell';
  
  document.getElementById('orderTitle').textContent = (isBuy ? 'Покупка ' : 'Продажа ') + ad.asset;
  document.getElementById('orderAvatar').textContent = ad.username[0].toUpperCase();
  document.getElementById('orderUsername').textContent = ad.username;
  document.getElementById('orderUserMeta').textContent = (ad.faceType === 'first' ? '1-е лицо' : '3-е лицо') + ' · ★ ' + (ad.ratingAvg || '—');
  document.getElementById('orderRate').textContent = fmt(ad.price) + ' ₽';
  document.getElementById('orderAvailable').textContent = fmtDec(ad.amountLeft, 2) + ' ' + ad.asset;
  document.getElementById('orderLimit').textContent = `Лимит: ${fmt(ad.minRub)} - ${fmt(ad.maxRub)} ₽`;
  document.getElementById('orderAmount').value = '';
  document.getElementById('orderResultLabel').textContent = isBuy ? 'Вы получите' : 'Вы отдадите';
  document.getElementById('orderResult').textContent = '0 ' + ad.asset;
  document.getElementById('orderError').textContent = '';
  
  document.getElementById('orderAmount').oninput = e => {
    const rub = parseFloat(e.target.value) || 0;
    document.getElementById('orderResult').textContent = fmtDec(rub / ad.price, 4) + ' ' + ad.asset;
  };
  
  const payBox = document.getElementById('orderPayments'); payBox.innerHTML = '';
  (ad.paymentMethods || []).forEach(p => {
    const el = document.createElement('div');
    el.className = 'pay-chip' + (p === selectedPay ? ' active' : ''); el.textContent = p;
    el.onclick = () => { payBox.querySelectorAll('.pay-chip').forEach(x => x.classList.remove('active')); el.classList.add('active'); selectedPay = p; };
    payBox.appendChild(el);
  });
  
  const btn = document.getElementById('orderSubmit');
  btn.className = 'btn btn-block ' + (isBuy ? 'btn-buy' : 'btn-sell');
  btn.textContent = isBuy ? 'Купить ' + ad.asset : 'Продать ' + ad.asset;
  btn.onclick = submitOrder;
  document.getElementById('orderModal').classList.add('active');
}

async function submitOrder() {
  const errEl = document.getElementById('orderError'); errEl.textContent = '';
  const rub = parseFloat(document.getElementById('orderAmount').value) || 0;
  if (!selectedPay) { errEl.textContent = 'Выберите способ оплаты'; return; }
  if (rub < currentAd.minRub) { errEl.textContent = 'Минимум ' + fmt(currentAd.minRub) + ' ₽'; return; }
  if (rub > currentAd.maxRub) { errEl.textContent = 'Максимум ' + fmt(currentAd.maxRub) + ' ₽'; return; }
  const btn = document.getElementById('orderSubmit'); btn.disabled = true; btn.textContent = '...';
  try {
    const order = await API.req('POST', '/orders', { ad_id: currentAd.id, amount_rub: rub, payment_method: selectedPay });
    closeModal('orderModal'); toast('Ордер создан!', 'success'); openOrderPage(order.id);
  } catch (err) {
    const map = { self_trade: 'Нельзя торговать с собой.', insufficient_asset: 'Недостаточно актива', ad_inactive: 'Объявление неактивно', bad_payment: 'Способ оплаты недоступен' };
    errEl.textContent = map[err.code] || err.message;
  } finally { btn.disabled = false; btn.textContent = currentAd ? (currentAd.side === 'sell' ? 'Купить ' : 'Продать ') + currentAd.asset : 'OK'; }
}

// Ордера
async function loadOrders(filter) {
  if (!API.user()) { document.getElementById('ordersList').innerHTML = '<p style="text-align:center;color:var(--dim);padding:30px">Войдите, чтобы увидеть ордера</p>'; return; }
  try {
    const { items } = await API.req('GET', '/orders/my?status=' + filter);
    const sc = { waiting: 'var(--yellow)', paid: 'var(--grn)', completed: 'var(--grn)', cancelled: 'var(--red)', dispute: 'var(--gold)' };
    
    document.getElementById('ordersList').innerHTML = items.length ? items.map(o => `
      <div class="ad-card" style="cursor:pointer;border-left:4px solid ${sc[o.status]}" data-order-id="${o.id}">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px">
          <strong style="font-family:'Inter',monospace">#${o.publicId}</strong>
          <span style="color:${sc[o.status]};font-size:11px;font-weight:700">${o.statusLabel}</span>
        </div>
        <div class="ad-body">
          <div><div class="ad-lbl">Сумма</div><div class="ad-val">${fmt(o.amountRub)} ₽</div></div>
          <div><div class="ad-lbl">Актив</div><div class="ad-val">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
        </div>
        <div style="font-size:11px;color:var(--dim);display:flex;justify-content:space-between">
          <span>${new Date(o.createdAt).toLocaleString('ru-RU')}</span>
          <span>${o.buyer.username} ↔ ${o.seller.username}</span>
        </div>
      </div>`).join('') : '<p style="text-align:center;color:var(--dim);padding:30px">Ордеров нет</p>';
    
    document.querySelectorAll('[data-order-id]').forEach(el => el.onclick = () => openOrderPage(+el.dataset.orderId));
  } catch (e) { document.getElementById('ordersList').innerHTML = 'Ошибка'; }
}

document.querySelectorAll('#ordersFilter .tab').forEach(c => c.onclick = () => {
  document.querySelectorAll('#ordersFilter .tab').forEach(x => x.classList.remove('active'));
  c.classList.add('active'); loadOrders(c.dataset.val);
});

async function openOrderPage(orderId) {
  if (!API.user()) { document.getElementById('authModal').classList.add('active'); return; }
  previousScreen = 'orders'; show('order');
  const container = document.getElementById('orderDetailContent');
  container.innerHTML = '<p style="text-align:center;padding:30px;color:var(--dim)">Загрузка...</p>';
  try {
    const { order, history } = await API.req('GET', '/orders/' + orderId);
    renderOrderPage(order, history);
  } catch (e) { container.innerHTML = '<p style="text-align:center;padding:30px;color:var(--red)">Ошибка: ' + e.message + '</p>'; }
}

function renderOrderPage(order, history) {
  const u = API.user(), isBuyer = order.buyer.id === u.id, isSeller = order.seller.id === u.id;
  const sc = { waiting: '#FFD60A', paid: '#22c55e', completed: '#22c55e', cancelled: '#ef4444', dispute: '#D4AF37' };
  
  let progress = 20;
  if (order.status === 'paid') progress = 60;
  if (order.status === 'completed') progress = 100;
  if (order.status === 'cancelled' || order.status === 'dispute') progress = 0;

  let actionsHtml = '';
  if (order.status === 'waiting' && isBuyer) actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px"><button class="btn btn-primary" onclick="doAction(${order.id},'paid')">Я оплатил</button><button class="btn btn-ghost" style="color:var(--red)" onclick="doAction(${order.id},'cancel')">Отменить</button></div>`;
  else if (order.status === 'waiting' && isSeller) actionsHtml = `<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:16px">Ожидайте оплаты от покупателя</div>`;
  else if (order.status === 'paid') {
    if (isSeller) actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px"><button class="btn btn-primary" onclick="doAction(${order.id},'confirm')">Оплата получена</button><button class="btn btn-ghost" style="color:var(--red)" onclick="doAction(${order.id},'dispute')">Спор</button></div>`;
    else actionsHtml = `<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:16px">Ожидайте подтверждения от продавца</div>`;
  } else if (order.status === 'completed') actionsHtml = `<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:14px;text-align:center;color:var(--grn);font-size:13px;font-weight:600;margin-bottom:10px">✓ Сделка завершена</div><button class="btn btn-ghost btn-block" onclick="openReview(${order.id})" style="margin-bottom:16px">Оставить отзыв</button>`;
  else if (order.status === 'dispute') actionsHtml = `<div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:13px;margin-bottom:16px">Спор рассматривается администратором</div>`;
  else if (order.status === 'cancelled') actionsHtml = `<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;text-align:center;color:var(--red);font-size:13px;margin-bottom:16px">Ордер отменён</div>`;
  
  const timelineHtml = (history || []).map(h => `<div style="display:flex;gap:12px;padding:8px 0"><div style="width:13px;height:13px;border-radius:50%;background:var(--yellow);flex-shrink:0;margin-top:3px"></div><div style="flex:1"><div style="font-size:13px;font-weight:600">${h.note || h.status}</div><div style="font-size:11px;color:var(--dim)">${new Date(h.at).toLocaleString('ru-RU')}</div></div></div>`).join('');
  const otherUser = isBuyer ? order.seller.username : order.buyer.username;
  
  document.getElementById('orderDetailContent').innerHTML = `
    <div style="background:linear-gradient(135deg,#1a1608,#0f0f0f);border:1px solid #2a2410;border-radius:16px;padding:20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:12px;color:var(--dim);font-family:monospace">#${order.publicId}</div>
        <div style="background:rgba(255,255,255,.05);color:${sc[order.status]};font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px">${order.statusLabel}</div>
      </div>
      <h2 style="font-size:20px;font-weight:800;margin-bottom:8px">${isBuyer ? 'Покупка ' : 'Продажа '}${order.asset}</h2>
      <div style="font-size:32px;font-weight:800;color:var(--yellow)">${fmt(order.amountRub)}<span style="font-size:14px;color:var(--dim);font-weight:500;margin-left:4px">₽</span></div>
      <div style="width:100%;height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:16px;overflow:hidden">
        <div style="height:100%;width:${progress}%;background:${sc[order.status]};transition:0.3s"></div>
      </div>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim)">Количество</div><div style="font-size:14px;font-weight:700;margin-top:4px">${fmtDec(order.amountAsset, 4)} ${order.asset}</div></div>
      <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim)">Курс</div><div style="font-size:14px;font-weight:700;margin-top:4px">${fmt(order.price)} ₽</div></div>
      <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim)">Оплата</div><div style="font-size:14px;font-weight:700;margin-top:4px">${order.paymentMethod}</div></div>
      <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim)">Тип лица</div><div style="font-size:14px;font-weight:700;margin-top:4px">${order.faceType === 'first' ? '1-е лицо' : '3-е лицо'}</div></div>
    </div>
    
    ${actionsHtml}
    
    <button style="width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--surf);border:1px solid var(--brd);border-radius:14px;padding:16px;margin-bottom:16px;color:var(--txt);font-size:14px" onclick="openChatModal(${order.id}, '${otherUser}')">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="avatar" style="width:36px;height:36px;font-size:14px">${otherUser[0].toUpperCase()}</div>
        <div><div style="font-weight:700">Чат с ${otherUser}</div><div style="font-size:11px;color:var(--dim)">Обсудить детали</div></div>
      </div>
      <span id="chatBadge" style="background:var(--red);color:#fff;font-size:11px;font-weight:700;border-radius:10px;padding:2px 8px;display:none">0</span>
    </button>
    
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:14px;padding:16px">
      <div style="font-size:12px;font-weight:700;margin-bottom:14px;color:var(--dim);text-transform:uppercase">История</div>
      ${timelineHtml}
    </div>
  `;
  loadChat(order.id, true);
}

async function doAction(orderId, action) {
  if (action === 'cancel' && !await confirmAsync('Отмена', 'Отменить ордер?', 'Да')) return;
  if (action === 'confirm' && !await confirmAsync('Подтверждение', 'Подтвердить оплату?', 'Да')) return;
  try { await API.req('POST', `/orders/${orderId}/${action}`); toast('Статус обновлён', 'success'); openOrderPage(orderId); }
  catch (e) { toast(e.message, 'error'); }
}

// Чат
let currentChatOrderId = null, chatPollTimer = null, lastChatCount = 0;

async function openChatModal(orderId, username) {
  currentChatOrderId = orderId;
  document.getElementById('chatTitle').textContent = 'Чат с ' + username;
  document.getElementById('chatAvatar').textContent = username[0].toUpperCase();
  document.getElementById('chatModal').classList.add('active');
  document.getElementById('chatBadge').style.display = 'none';
  lastChatCount = 0;
  await loadChat(orderId, true);
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(() => loadChat(orderId, false), 3000);
}

function closeChatModal() {
  document.getElementById('chatModal').classList.remove('active');
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = null;
}

document.getElementById('chatSend').onclick = async () => {
  const input = document.getElementById('chatInput'), text = input.value.trim();
  if (!text || !currentChatOrderId) return;
  input.value = '';
  try { await API.req('POST', '/chat/' + currentChatOrderId, { text }); loadChat(currentChatOrderId, false); }
  catch (e) { toast(e.message, 'error'); }
};

document.getElementById('chatInput').onkeypress = e => { if (e.key === 'Enter') document.getElementById('chatSend').click(); };

async function loadChat(orderId, reset = true) {
  try {
    const { items } = await API.req('GET', '/chat/' + orderId);
    const body = document.getElementById('chatBody');
    if (!body) return;
    if (!document.getElementById('chatModal').classList.contains('active') && items.length > lastChatCount && !reset) {
      const badge = document.getElementById('chatBadge');
      if (badge) { badge.textContent = items.length - lastChatCount; badge.style.display = 'inline-block'; }
    }
    if (reset) body.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--dim)">Сделка создана.</div>';
    const rendered = body.querySelectorAll('[data-msg-id]').length;
    items.slice(rendered).forEach(m => {
      const div = document.createElement('div');
      div.className = 'msg' + (m.isMine ? ' me' : '');
      div.dataset.msgId = m.id;
      div.innerHTML = `<div class="avatar" style="width:28px;height:28px;font-size:11px">${m.senderUsername[0].toUpperCase()}</div><div><div class="msg-bubble">${m.text.replace(/</g, '&lt;')}</div><div style="font-size:10px;color:var(--dim);margin-top:2px">${new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
      body.appendChild(div);
    });
    body.scrollTop = body.scrollHeight;
    if (document.getElementById('chatModal').classList.contains('active')) lastChatCount = items.length;
  } catch (e) {}
}

// Отзывы
let currentReviewOrderId = null, currentRating = 5;

function openReview(orderId) {
  currentReviewOrderId = orderId; currentRating = 5;
  document.getElementById('reviewComment').value = '';
  document.getElementById('reviewError').textContent = '';
  updateStars();
  document.getElementById('reviewModal').classList.add('active');
}

function updateStars() {
  document.querySelectorAll('#ratingStars .rating-star').forEach(s => s.classList.toggle('active', +s.dataset.r <= currentRating));
}

document.querySelectorAll('#ratingStars .rating-star').forEach(s => s.onclick = () => { currentRating = +s.dataset.r; updateStars(); });

document.getElementById('reviewSubmitBtn').onclick = async () => {
  const btn = document.getElementById('reviewSubmitBtn'); btn.disabled = true;
  try {
    await API.req('POST', '/reviews', { order_id: currentReviewOrderId, rating: currentRating, comment: document.getElementById('reviewComment').value });
    closeModal('reviewModal'); toast('Отзыв добавлен!', 'success');
  } catch (e) { document.getElementById('reviewError').textContent = e.code === 'already_reviewed' ? 'Вы уже оставили отзыв' : e.message; }
  finally { btn.disabled = false; }
};

// Профиль с табами
let profileTab = 'ads';

async function loadProfile() {
  const u = API.user();
  if (!u) { document.getElementById('profileContent').innerHTML = '<div style="text-align:center;padding:40px"><p style="color:var(--dim);margin-bottom:20px">Войдите в аккаунт</p><button class="btn btn-primary" onclick="document.getElementById(\'authModal\').classList.add(\'active\')">Войти</button></div>'; return; }
  
  try {
    const { user, stats } = await API.req('GET', '/users/me');
    const kycBadge = user.kycStatus === 'verified' ? '<span style="background:rgba(34,197,94,.12);color:var(--grn);border:1px solid rgba(34,197,94,.3);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;display:inline-block">Проверен</span>' : '<span style="background:rgba(138,138,138,.12);color:var(--dim);border:1px solid var(--brd);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;display:inline-block">Не проверен</span>';
    const adminBadge = user.role === 'admin' ? '<span style="background:rgba(255,214,10,.12);color:var(--yellow);border:1px solid rgba(255,214,10,.3);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;display:inline-block;margin-left:4px">ADMIN</span>' : '';

    let contentHtml = '';
    if (profileTab === 'ads') contentHtml = '<div id="myAdsList">Загрузка...</div>';
    else if (profileTab === 'history') contentHtml = '<div id="myHistoryList">Загрузка...</div>';
    else if (profileTab === 'reviews') contentHtml = '<div id="myReviewsList">Загрузка...</div>';

    document.getElementById('profileContent').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;padding:20px;background:var(--surf);border:1px solid var(--brd);border-radius:16px;margin-bottom:20px">
        <div class="avatar lg">${user.username[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <h2 style="font-size:20px;font-weight:800;margin-bottom:4px">${user.username}</h2>
          <div style="font-size:12px;color:var(--dim)">${user.email}</div>
          <div style="font-size:12px;color:var(--dim);margin-top:2px">С нами с ${new Date(user.createdAt).toLocaleDateString('ru-RU')}</div>
          <div>${kycBadge} ${adminBadge}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-lbl">Сделок</div><div class="stat-val">${stats.dealsTotal}</div></div>
        <div class="stat"><div class="stat-lbl">Успешных</div><div class="stat-val">${stats.successRate !== null ? stats.successRate + '%' : '—'}</div></div>
        <div class="stat"><div class="stat-lbl">Отзывов</div><div class="stat-val">${stats.reviewsCount}</div></div>
        <div class="stat"><div class="stat-lbl">Рейтинг</div><div class="stat-val">${stats.ratingAvg ? '★ ' + stats.ratingAvg : '—'}</div></div>
      </div>
      <div style="background:var(--surf);border:1px solid var(--brd);border-radius:14px;padding:20px;margin-bottom:20px">
        <h4 style="font-size:15px;font-weight:700;margin-bottom:14px">Настройки</h4>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--brd);font-size:13px"><span style="color:var(--dim)">Email</span><span style="font-weight:600">${user.email}</span></div>
        <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--brd);font-size:13px"><span style="color:var(--dim)">Роль</span><span style="font-weight:600;text-transform:capitalize">${user.role}</span></div>
        <div style="margin-top:14px"><button class="btn btn-ghost btn-block btn-sm" onclick="openSettings()">Изменить Email</button></div>
      </div>
      
      <div class="profile-tabs">
        <button class="profile-tab ${profileTab === 'ads' ? 'active' : ''}" onclick="switchProfileTab('ads')">Объявления</button>
        <button class="profile-tab ${profileTab === 'history' ? 'active' : ''}" onclick="switchProfileTab('history')">История</button>
        <button class="profile-tab ${profileTab === 'reviews' ? 'active' : ''}" onclick="switchProfileTab('reviews')">Отзывы</button>
      </div>
      
      <div id="profileTabContent">${contentHtml}</div>
      
      <div style="margin-top:24px"><button class="btn btn-ghost btn-block" onclick="logoutAction()" style="color:var(--red)">Выйти из аккаунта</button></div>
    `;

    if (profileTab === 'ads') loadMyAds();
    else if (profileTab === 'history') loadMyHistory();
    else if (profileTab === 'reviews') loadMyReviews();

  } catch (e) { document.getElementById('profileContent').innerHTML = 'Ошибка: ' + e.message; }
}

function switchProfileTab(tab) {
  profileTab = tab;
  loadProfile();
}

async function loadMyAds() {
  try {
    const { items } = await API.req('GET', '/ads/my');
    window._myAds = {};
    items.forEach(ad => window._myAds[ad.id] = ad);
    
    document.getElementById('myAdsList').innerHTML = items.length ? items.map(ad => `
      <div class="ad-card">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong>${ad.side === 'sell' ? 'Продажа' : 'Покупка'} ${ad.asset}</strong>
          <span style="color:${ad.active ? 'var(--grn)' : 'var(--red)'};font-size:11px">${ad.active ? 'Активно' : 'Неактивно'}</span>
        </div>
        <div class="ad-body">
          <div><div class="ad-lbl">Курс</div><div class="ad-val">${fmt(ad.price)} ₽</div></div>
          <div><div class="ad-lbl">Остаток</div><div class="ad-val">${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div></div>
        </div>
        <button class="btn btn-ghost btn-block btn-sm" onclick="openEditAd(${ad.id})" style="margin-top:10px;">Редактировать</button>
      </div>
    `).join('') : '<p style="color:var(--dim);text-align:center;padding:20px">У вас нет объявлений</p>';
  } catch (e) { document.getElementById('myAdsList').innerHTML = 'Ошибка'; }
}

async function loadMyHistory() {
  try {
    const { items } = await API.req('GET', '/orders/my?status=completed');
    document.getElementById('myHistoryList').innerHTML = items.length ? items.map(o => `
      <div class="ad-card" style="border-left:4px solid var(--grn);">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong>#${o.publicId}</strong>
          <span style="color:var(--grn);font-size:11px">Завершен</span>
        </div>
        <div class="ad-body">
          <div><div class="ad-lbl">Сумма</div><div class="ad-val">${fmt(o.amountRub)} ₽</div></div>
          <div><div class="ad-lbl">Актив</div><div class="ad-val">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
        </div>
      </div>
    `).join('') : '<p style="color:var(--dim);text-align:center;padding:20px">История пуста</p>';
  } catch (e) { document.getElementById('myHistoryList').innerHTML = 'Ошибка'; }
}

async function loadMyReviews() {
  try {
    const u = API.user();
    const res = await fetch('/api/reviews/user/' + u.id); // Примерный эндпоинт
    const data = await res.json();
    const items = data.items || [];
    document.getElementById('myReviewsList').innerHTML = items.length ? items.map(r => `
      <div class="ad-card">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong>${r.author}</strong>
          <span style="color:var(--yellow);">${'★'.repeat(r.rating)}</span>
        </div>
        <p style="font-size:13px;color:var(--dim);">${r.comment || 'Без комментария'}</p>
      </div>
    `).join('') : '<p style="color:var(--dim);text-align:center;padding:20px">Отзывов нет</p>';
  } catch (e) { document.getElementById('myReviewsList').innerHTML = '<p style="color:var(--dim);text-align:center;padding:20px">Отзывов нет</p>'; }
}

function openSettings() {
  const u = API.user();
  document.getElementById('settingsEmail').value = u.email;
  document.getElementById('settingsError').textContent = '';
  document.getElementById('settingsModal').classList.add('active');
}

document.getElementById('settingsSaveBtn').onclick = async () => {
  const btn = document.getElementById('settingsSaveBtn'); btn.disabled = true;
  try {
    const { user } = await API.req('PATCH', '/users/me', { email: document.getElementById('settingsEmail').value });
    localStorage.setItem('vexo_user', JSON.stringify(user));
    closeModal('settingsModal'); toast('Настройки сохранены', 'success'); loadProfile();
  } catch (e) { document.getElementById('settingsError').textContent = e.code === 'email_taken' ? 'Этот email уже занят' : 'Неверный email'; }
  finally { btn.disabled = false; }
};

async function logoutAction() {
  if (await confirmAsync('Выход', 'Выйти из аккаунта?', 'Выйти')) {
    localStorage.removeItem('vexo_token'); localStorage.removeItem('vexo_user'); location.reload();
  }
}

// Темы
let currentTheme = localStorage.getItem('vexo_theme') || 'dark';
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('vexo_theme', theme);
}
applyTheme(currentTheme);

document.addEventListener('DOMContentLoaded', () => {
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.onclick = () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(currentTheme);
      toast('Тема: ' + (currentTheme === 'dark' ? 'Тёмная' : 'Светлая'), 'info'); 
    };
  }
});

// ЛОГИКА ПОПОЛНЕНИЯ / ВЫВОДА
let walletActionType = 'deposit';

document.getElementById('btnDeposit').onclick = () => {
  walletActionType = 'deposit';
  document.getElementById('walletActionTitle').textContent = 'Пополнение';
  document.getElementById('walletRequisitesField').style.display = 'none';
  document.getElementById('walletActionAmount').value = '';
  document.getElementById('walletActionRequisites').value = '';
  document.getElementById('walletActionModal').classList.add('active');
};

document.getElementById('btnWithdraw').onclick = () => {
  walletActionType = 'withdraw';
  document.getElementById('walletActionTitle').textContent = 'Вывод';
  document.getElementById('walletRequisitesField').style.display = 'block';
  document.getElementById('walletActionAmount').value = '';
  document.getElementById('walletActionRequisites').value = '';
  document.getElementById('walletActionModal').classList.add('active');
};

document.querySelectorAll('#walletActionAsset .icon-chip').forEach(c => {
  c.onclick = () => {
    document.querySelectorAll('#walletActionAsset .icon-chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
  };
});

document.getElementById('walletActionSubmit').onclick = () => {
  if (!API.user()) {
    closeModal('walletActionModal');
    document.getElementById('authModal').classList.add('active');
    return;
  }
  const asset = document.querySelector('#walletActionAsset .icon-chip.active').dataset.val;
  const amount = document.getElementById('walletActionAmount').value;
  const requisites = document.getElementById('walletActionRequisites').value;
  
  if (!amount || Number(amount) <= 0) return toast('Введите корректную сумму', 'error');
  if (walletActionType === 'withdraw' && !requisites) return toast('Введите реквизиты для вывода', 'error');
  
  let payload = walletActionType === 'deposit' ? 'dep' : 'wth';
  payload += `_${asset}_${amount}`;
  if (walletActionType === 'withdraw') {
    const cleanReq = requisites.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    payload += `_${cleanReq}`;
  }
  
  window.open(`https://t.me/vexoio_bot?start=${payload}`, '_blank');
  closeModal('walletActionModal');
  toast('Перенаправление в Telegram...', 'success');
};

updateAuthUI();
loadHome();