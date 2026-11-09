document.addEventListener('contextmenu', e => { 
  if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); 
});

console.log('VEXO: app.js загружен');

window.addEventListener('error', (e) => {
  console.error('VEXO CRASH:', e.message, 'at', e.filename, ':', e.lineno);
});

document.addEventListener('DOMContentLoaded', () => {
  try {
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
          window.location.reload();
        }
        if (!res.ok) { const e = new Error(data.error || 'error'); e.code = data.error; e.status = res.status; throw e; }
        return data;
      }
    };

    const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n || 0);
    const fmtDec = (n, d = 2) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

    function toast(msg, type = 'info') {
      try {
        const c = document.getElementById('toastContainer');
        if (!c) return;
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        c.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3000);
      } catch(e) { console.error(e); }
    }

    function confirmAsync(title, message, okText = 'OK') {
      return new Promise(resolve => {
        const overlay = document.getElementById('dialogOverlay');
        const content = document.getElementById('dialogContent');
        if (!overlay || !content) return resolve(false);
        content.innerHTML = `<h3 style="font-size:16px;font-weight:800">${title}</h3><p style="font-size:13px;color:var(--dim);margin:10px 0;font-weight:500;">${message}</p><div style="display:flex;gap:8px;margin-top:4px"><button class="btn btn-ghost" style="flex:1" id="dlgCancel">Отмена</button><button class="btn btn-primary" style="flex:1" id="dlgOk">${okText}</button></div>`;
        overlay.classList.add('active');
        document.getElementById('dlgCancel').onclick = () => { overlay.classList.remove('active'); resolve(false); };
        document.getElementById('dlgOk').onclick = () => { overlay.classList.remove('active'); resolve(true); };
      });
    }

    function closeModal(id) { 
      const el = document.getElementById(id); 
      if (el) el.classList.remove('active');
    }

    const titles = { home: 'Главная', market: 'Маркет', create: 'Создать', orders: 'Ордера', order: 'Ордер', profile: 'Профиль', wallet: 'Кошелёк' };
    let previousScreen = 'home';

    function show(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const target = document.getElementById('screen-' + name);
      if (target) target.classList.add('active');
      
      document.querySelectorAll('.nav-btn, .bn-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-screen="${name}"]`).forEach(b => b.classList.add('active'));
      
      const titleEl = document.getElementById('topbarTitle');
      if (titleEl) titleEl.textContent = titles[name] || '';
      
      const backBtn = document.getElementById('backBtn');
      if (backBtn) backBtn.classList.toggle('hidden', !['order'].includes(name));
      
      try {
        if (name === 'market') loadMarket();
        if (name === 'orders') loadOrders('active');
        if (name === 'profile') loadProfile();
        if (name === 'home') loadHome();
      } catch(e) { console.error('show error:', e); }
      
      window.scrollTo(0, 0);
    }

    document.querySelectorAll('[data-screen]').forEach(b => {
      b.onclick = e => {
        e.preventDefault();
        const s = b.dataset.screen;
        if (!['order'].includes(s)) previousScreen = s;
        show(s);
      };
    });

    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.onclick = () => show(previousScreen);

    // ТЕМА
    let currentTheme = localStorage.getItem('vexo_theme') || 'dark';
    function applyTheme(theme) {
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('vexo_theme', theme);
    }
    applyTheme(currentTheme);

    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      themeBtn.onclick = () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(currentTheme);
        toast('Тема: ' + (currentTheme === 'dark' ? 'Тёмная' : 'Светлая'), 'info');
      };
    }

    // АВТОРИЗАЦИЯ
    let authMode = 'login';
    function setAuthMode(mode) {
      authMode = mode;
      document.getElementById('tabLogin')?.classList.toggle('active', mode === 'login');
      document.getElementById('tabRegister')?.classList.toggle('active', mode === 'register');
      document.getElementById('emailField')?.classList.toggle('hidden', mode !== 'register');
      const l = document.getElementById('loginLabel');
      if (l) l.textContent = mode === 'register' ? 'Никнейм' : 'Логин или Email';
      const b = document.getElementById('authSubmit');
      if (b) b.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
      const er = document.getElementById('authError');
      if (er) er.textContent = '';
    }

    const tabLogin = document.getElementById('tabLogin');
    if (tabLogin) tabLogin.onclick = () => setAuthMode('login');
    const tabRegister = document.getElementById('tabRegister');
    if (tabRegister) tabRegister.onclick = () => setAuthMode('register');

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      loginBtn.onclick = () => {
        setAuthMode('login');
        const m = document.getElementById('authModal');
        if (m) m.classList.add('active');
      };
    }

    const avatarBtn = document.getElementById('avatarBtn');
    if (avatarBtn) avatarBtn.onclick = () => show('profile');

    const authForm = document.getElementById('authForm');
    if (authForm) {
      authForm.onsubmit = async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('authError');
        const btn = document.getElementById('authSubmit');
        if (errEl) errEl.textContent = '';
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        try {
          const body = { password: document.getElementById('authPass')?.value || '' };
          let path;
          if (authMode === 'login') {
            path = '/auth/login';
            body.login = document.getElementById('authLogin')?.value || '';
          } else {
            path = '/auth/register';
            body.username = document.getElementById('authLogin')?.value || '';
            body.email = document.getElementById('authEmail')?.value || '';
          }
          const data = await API.req('POST', path, body);
          localStorage.setItem('vexo_token', data.token);
          localStorage.setItem('vexo_user', JSON.stringify(data.user));
          closeModal('authModal');
          updateAuthUI();
          toast(authMode === 'login' ? 'Добро пожаловать, ' + data.user.username : 'Аккаунт создан!', 'success');
          show('market');
        } catch (err) {
          const map = { invalid_credentials: 'Неверный логин или пароль', user_exists: 'Никнейм уже занят', email_exists: 'Email занят', short_password: 'Пароль мин. 8 символов', short_username: 'Никнейм мин. 3 символа', bad_email: 'Неверный email' };
          if (errEl) errEl.textContent = map[err.code] || err.message;
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться'; }
        }
      };
    }

    function updateAuthUI() {
      const u = API.user();
      const lb = document.getElementById('loginBtn');
      const ab = document.getElementById('avatarBtn');
      if (u) {
        if (lb) lb.classList.add('hidden');
        if (ab) { ab.classList.remove('hidden'); ab.textContent = u.username[0].toUpperCase(); }
      } else {
        if (lb) lb.classList.remove('hidden');
        if (ab) ab.classList.add('hidden');
      }
    }

    // ГЛАВНАЯ
    async function loadHome() {
      try {
        const stats = await API.req('GET', '/stats');
        const su = document.getElementById('statUsers');
        const sd = document.getElementById('statDeals');
        const st = document.getElementById('statTurnover');
        const sr = document.getElementById('statRating');
        if (su) su.textContent = fmt(stats.users);
        if (sd) sd.textContent = fmt(stats.deals);
        if (st) st.textContent = fmt(stats.turnover) + ' ₽';
        if (sr) sr.textContent = stats.avgRating;
      } catch(e) { console.error('loadHome:', e); }
    }

    // МАРКЕТ
    async function loadMarket() {
      const filters = {};
      const activeTab = document.querySelector('#marketSideTabs .trade-tab.active');
      if (activeTab && activeTab.dataset.side) filters.side = activeTab.dataset.side;

      const faceChip = document.querySelector('#filterFace .chip.active');
      if (faceChip && faceChip.dataset.val) filters.face_type = faceChip.dataset.val;

      const assetChip = document.querySelector('#filterAsset .icon-chip.active');
      if (assetChip && assetChip.dataset.val) filters.asset = assetChip.dataset.val;

      const payChip = document.querySelector('#filterPayment .icon-chip.active');
      if (payChip && payChip.dataset.val) filters.payment = payChip.dataset.val;

      const minAmt = document.getElementById('filterMinAmount')?.value;
      const maxAmt = document.getElementById('filterMaxAmount')?.value;
      if (minAmt) filters.min_amount = minAmt;
      if (maxAmt) filters.max_amount = maxAmt;

      const list = document.getElementById('adsList');
      if (!list) return;
      list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--dim);font-weight:600;">Загрузка...</p>';

      try {
        const { items } = await API.req('GET', '/ads?' + new URLSearchParams(filters));
        list.innerHTML = items.length ? items.map(renderAd).join('') : '<div class="empty-state">Объявлений не найдено</div>';
        bindAdButtons();
      } catch (e) {
        list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
        console.error('loadMarket:', e);
      }
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
          <div><div class="ad-lbl">Лимит</div><div class="ad-val" style="font-size:14px">${fmt(ad.minRub)} - ${fmt(ad.maxRub)} ₽</div></div>
          <div><div class="ad-lbl">Объем</div><div class="ad-val" style="font-size:14px">${fmt(ad.totalRub)} ₽</div></div>
        </div>
        ${pays ? `<div style="margin-bottom:10px">${pays}</div>` : ''}
        <button class="btn ${isSell ? 'btn-buy' : 'btn-sell'} btn-block btn-sm" data-ad-id="${ad.id}">${isSell ? 'Купить' : 'Продать'} ${ad.asset}</button>
      </div>`;
    }

    function bindAdButtons() {
      document.querySelectorAll('[data-ad-id]').forEach(b => {
        b.onclick = () => {
          if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; }
          openOrderModal(+b.dataset.adId);
        };
      });
    }

    document.querySelectorAll('#marketSideTabs .trade-tab').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#marketSideTabs .trade-tab').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        loadMarket();
      };
    });
    document.querySelectorAll('#filterFace .chip').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#filterFace .chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        loadMarket();
      };
    });
    document.querySelectorAll('#filterAsset .icon-chip').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#filterAsset .icon-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        loadMarket();
      };
    });
    document.querySelectorAll('#filterPayment .icon-chip').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#filterPayment .icon-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        loadMarket();
      };
    });
    const fMinA = document.getElementById('filterMinAmount');
    if (fMinA) fMinA.oninput = loadMarket;
    const fMaxA = document.getElementById('filterMaxAmount');
    if (fMaxA) fMaxA.oninput = loadMarket;

    // СОЗДАНИЕ ОБЪЯВЛЕНИЯ
    const fPrice = document.getElementById('f-price');
    const fAmount = document.getElementById('f-amount');
    const fMax = document.getElementById('f-max');

    function recalc() {
      const total = (parseFloat(fAmount?.value) || 0) * (parseFloat(fPrice?.value) || 0);
      const ct = document.getElementById('calcTotal');
      const ct2 = document.getElementById('calcTotal2');
      const mh = document.getElementById('maxHint');
      if (ct) ct.textContent = fmt(total) + ' ₽';
      if (ct2) ct2.textContent = fmt(total) + ' ₽';
      if (mh) mh.textContent = total > 0 ? 'Не больше ' + fmt(total) + ' ₽' : 'Введите данные для расчета';
      if (fMax) fMax.style.borderColor = parseFloat(fMax.value) > total ? 'var(--red)' : 'var(--brd)';
    }
    [fPrice, fAmount, fMax].forEach(el => { if (el) el.oninput = recalc; });
    recalc();

    document.querySelectorAll('#f-side .seg-btn').forEach(b => { b.onclick = () => { document.querySelectorAll('#f-side .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });
    document.querySelectorAll('#f-face .seg-btn').forEach(b => { b.onclick = () => { document.querySelectorAll('#f-face .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });
    document.querySelectorAll('#f-payments .pay-chip').forEach(c => { c.onclick = () => c.classList.toggle('active'); });
    document.querySelectorAll('#f-asset-select .icon-chip').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#f-asset-select .icon-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        const lbl = document.getElementById('f-asset-label');
        if (lbl) lbl.textContent = c.dataset.val;
      };
    });

    const createBtn = document.getElementById('createBtn');
    if (createBtn) {
      createBtn.onclick = async () => {
        const errEl = document.getElementById('createError');
        if (errEl) errEl.textContent = '';
        if (!API.user()) { 
          if (errEl) errEl.textContent = 'Войдите в аккаунт';
          setTimeout(() => document.getElementById('authModal')?.classList.add('active'), 500);
          return;
        }
        const payments = [...document.querySelectorAll('#f-payments .pay-chip.active')].map(c => c.dataset.val);
        if (!payments.length) { if (errEl) errEl.textContent = 'Выберите способ оплаты'; return; }
        if (!fPrice?.value || !fAmount?.value || !document.getElementById('f-min')?.value || !fMax?.value) {
          if (errEl) errEl.textContent = 'Заполните все поля'; return;
        }
        const btn = createBtn; btn.disabled = true; btn.textContent = 'Публикация...';
        const asset = document.querySelector('#f-asset-select .icon-chip.active')?.dataset.val;
        try {
          await API.req('POST', '/ads', {
            side: document.querySelector('#f-side .seg-btn.active')?.dataset.val,
            face_type: document.querySelector('#f-face .seg-btn.active')?.dataset.val,
            asset: asset,
            price: fPrice.value, amount_total: fAmount.value,
            min_rub: document.getElementById('f-min').value, max_rub: fMax.value,
            payment_methods: payments, terms: document.getElementById('f-terms')?.value || ''
          });
          toast('Объявление опубликовано!', 'success');
          show('market');
        } catch (err) {
          const map = { max_exceeds_total: 'Максимальный лимит больше общего объёма', min_gt_max: 'Минимум больше максимума', bad_amounts: 'Проверьте числа' };
          if (errEl) errEl.textContent = map[err.code] || err.message;
        } finally {
          btn.disabled = false; btn.textContent = 'Опубликовать';
        }
      };
    }

    // ОРДЕРА
    async function loadOrders(filter) {
      const list = document.getElementById('ordersList');
      if (!list) return;
      if (!API.user()) { list.innerHTML = '<div class="empty-state">Войдите, чтобы увидеть ордера</div>'; return; }
      try {
        const { items } = await API.req('GET', '/orders/my?status=' + filter);
        const sc = { waiting: 'var(--yellow)', paid: 'var(--grn)', completed: 'var(--grn)', cancelled: 'var(--red)', dispute: 'var(--gold)' };
        list.innerHTML = items.length ? items.map(o => `
          <div class="ad-card" style="cursor:pointer;border-left:4px solid ${sc[o.status]}" data-order-id="${o.id}">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px">
              <strong style="font-family:Inter,monospace;font-size:15px;">#${o.publicId}</strong>
              <span style="color:${sc[o.status]};font-size:12px;font-weight:800">${o.statusLabel}</span>
            </div>
            <div class="ad-body">
              <div><div class="ad-lbl">Сумма</div><div class="ad-val">${fmt(o.amountRub)} ₽</div></div>
              <div><div class="ad-lbl">Актив</div><div class="ad-val">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
            </div>
            <div style="font-size:12px;color:var(--dim);display:flex;justify-content:space-between;font-weight:600">
              <span>${new Date(o.createdAt).toLocaleString('ru-RU')}</span>
              <span>${o.buyer.username} ↔ ${o.seller.username}</span>
            </div>
          </div>`).join('') : '<div class="empty-state">Ордеров нет</div>';
        list.querySelectorAll('[data-order-id]').forEach(el => {
          el.onclick = () => openOrderPage(+el.dataset.orderId);
        });
      } catch(e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    document.querySelectorAll('#ordersFilter .tab').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#ordersFilter .tab').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        loadOrders(c.dataset.val);
      };
    });

    async function openOrderPage(orderId) {
      if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; }
      previousScreen = 'orders'; show('order');
      const container = document.getElementById('orderDetailContent');
      if (!container) return;
      container.innerHTML = '<p style="text-align:center;padding:30px;color:var(--dim);font-weight:600;">Загрузка...</p>';
      try {
        const { order, history, terms } = await API.req('GET', '/orders/' + orderId);
        renderOrderPage(order, history, terms);
      } catch (e) { container.innerHTML = '<div class="empty-state">Ошибка загрузки ордера</div>'; }
    }

    function renderOrderPage(order, history, terms) {
      const u = API.user(), isBuyer = order.buyer.id === u.id, isSeller = order.seller.id === u.id;
      const sc = { waiting: '#FFD60A', paid: '#22c55e', completed: '#22c55e', cancelled: '#ef4444', dispute: '#D4AF37' };
      let progress = 20;
      if (order.status === 'paid') progress = 60;
      if (order.status === 'completed') progress = 100;
      if (order.status === 'cancelled' || order.status === 'dispute') progress = 0;

      let actionsHtml = '';
      if (order.status === 'waiting' && isBuyer) actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px"><button class="btn btn-primary" onclick="doAction(${order.id},'paid')">Я оплатил</button><button class="btn btn-ghost" style="color:var(--red)" onclick="doAction(${order.id},'cancel')">Отменить</button></div>`;
      else if (order.status === 'waiting' && isSeller) actionsHtml = `<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:16px;font-weight:600;">Ожидайте оплаты от покупателя</div>`;
      else if (order.status === 'paid') {
        if (isSeller) actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px"><button class="btn btn-primary" onclick="doAction(${order.id},'confirm')">Оплата получена</button><button class="btn btn-ghost" style="color:var(--red)" onclick="doAction(${order.id},'dispute')">Спор</button></div>`;
        else actionsHtml = `<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:16px;font-weight:600;">Ожидайте подтверждения от продавца</div>`;
      } else if (order.status === 'completed') actionsHtml = `<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:14px;text-align:center;color:var(--grn);font-size:13px;font-weight:700;margin-bottom:10px">✓ Сделка завершена</div><button class="btn btn-ghost btn-block" onclick="openReview(${order.id})" style="margin-bottom:16px">Оставить отзыв</button>`;
      else if (order.status === 'dispute') actionsHtml = `<div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:13px;margin-bottom:16px;font-weight:700;">Спор рассматривается администратором</div>`;
      else if (order.status === 'cancelled') actionsHtml = `<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;text-align:center;color:var(--red);font-size:13px;margin-bottom:16px;font-weight:700;">Ордер отменён</div>`;

      const timelineHtml = (history || []).map(h => `<div style="display:flex;gap:12px;padding:8px 0"><div style="width:13px;height:13px;border-radius:50%;background:var(--yellow);flex-shrink:0;margin-top:3px"></div><div style="flex:1"><div style="font-size:13px;font-weight:700">${h.note || h.status}</div><div style="font-size:11px;color:var(--dim);font-weight:600;">${new Date(h.at).toLocaleString('ru-RU')}</div></div></div>`).join('');
      const otherUser = isBuyer ? order.seller.username : order.buyer.username;

      const container = document.getElementById('orderDetailContent');
      if (!container) return;
      container.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1608,#0f0f0f);border:1px solid #2a2410;border-radius:16px;padding:20px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:12px;color:var(--dim);font-family:monospace;font-weight:700;">#${order.publicId}</div>
            <div style="background:rgba(255,255,255,.05);color:${sc[order.status]};font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px">${order.statusLabel}</div>
          </div>
          <h2 style="font-size:20px;font-weight:800;margin-bottom:8px">${isBuyer ? 'Покупка ' : 'Продажа '}${order.asset}</h2>
          <div style="font-size:32px;font-weight:800;color:var(--yellow);font-variant-numeric:tabular-nums;">${fmt(order.amountRub)}<span style="font-size:14px;color:var(--dim);font-weight:500;margin-left:4px">₽</span></div>
          <div style="width:100%;height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:16px;overflow:hidden">
            <div style="height:100%;width:${progress}%;background:${sc[order.status]};transition:0.3s"></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim);font-weight:700;">Количество</div><div style="font-size:14px;font-weight:800;margin-top:4px">${fmtDec(order.amountAsset, 4)} ${order.asset}</div></div>
          <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim);font-weight:700;">Курс</div><div style="font-size:14px;font-weight:800;margin-top:4px">${fmt(order.price)} ₽</div></div>
          <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim);font-weight:700;">Оплата</div><div style="font-size:14px;font-weight:800;margin-top:4px">${order.paymentMethod}</div></div>
          <div style="background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:12px 14px"><div style="font-size:11px;color:var(--dim);font-weight:700;">Тип лица</div><div style="font-size:14px;font-weight:800;margin-top:4px">${order.faceType === 'first' ? '1-е лицо' : '3-е лицо'}</div></div>
        </div>
        <div style="background: rgba(255,214,10,0.05); border: 1px dashed rgba(255,214,10,0.3); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: 800; color: var(--yellow); text-transform: uppercase; margin-bottom: 6px;">Условия сделки</div>
          <div style="font-size: 13px; color: var(--dim); line-height: 1.5; font-weight: 600;">${terms || 'Стандартные условия сделки.'}</div>
        </div>
        ${actionsHtml}
        <button style="width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--surf);border:1px solid var(--brd);border-radius:14px;padding:16px;margin-bottom:16px;color:var(--txt);font-size:14px" onclick="openChatModal(${order.id}, '${otherUser}')">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="avatar" style="width:36px;height:36px;font-size:14px">${otherUser[0].toUpperCase()}</div>
            <div><div style="font-weight:800">Чат с ${otherUser}</div><div style="font-size:11px;color:var(--dim);font-weight:600;">Обсудить детали</div></div>
          </div>
          <span id="chatBadge" style="background:var(--red);color:#fff;font-size:11px;font-weight:800;border-radius:10px;padding:2px 8px;display:none">0</span>
        </button>
        <div style="background:var(--surf);border:1px solid var(--brd);border-radius:14px;padding:16px">
          <div style="font-size:12px;font-weight:800;margin-bottom:14px;color:var(--dim);text-transform:uppercase">История</div>
          ${timelineHtml}
        </div>
      `;
      loadChat(order.id, true);
    }

    window.doAction = async function(orderId, action) {
      if (action === 'cancel' && !await confirmAsync('Отмена', 'Отменить ордер?', 'Да')) return;
      if (action === 'confirm' && !await confirmAsync('Подтверждение', 'Подтвердить оплату?', 'Да')) return;
      try { await API.req('POST', `/orders/${orderId}/${action}`); toast('Статус обновлён', 'success'); openOrderPage(orderId); }
      catch (e) { toast(e.message, 'error'); }
    };

    // ЧАТ
    let currentChatOrderId = null, chatPollTimer = null, lastChatCount = 0;

    window.openChatModal = async function(orderId, username) {
      currentChatOrderId = orderId;
      const t = document.getElementById('chatTitle'); if (t) t.textContent = 'Чат с ' + username;
      const a = document.getElementById('chatAvatar'); if (a) a.textContent = username[0].toUpperCase();
      const m = document.getElementById('chatModal'); if (m) m.classList.add('active');
      const b = document.getElementById('chatBadge'); if (b) b.style.display = 'none';
      lastChatCount = 0;
      await loadChat(orderId, true);
      if (chatPollTimer) clearInterval(chatPollTimer);
      chatPollTimer = setInterval(() => loadChat(orderId, false), 3000);
    };

    window.closeChatModal = function() {
      const m = document.getElementById('chatModal'); if (m) m.classList.remove('active');
      if (chatPollTimer) clearInterval(chatPollTimer);
      chatPollTimer = null;
    };

    const chatSend = document.getElementById('chatSend');
    if (chatSend) {
      chatSend.onclick = async () => {
        const input = document.getElementById('chatInput');
        const text = input?.value.trim();
        if (!text || !currentChatOrderId) return;
        if (input) input.value = '';
        try { await API.req('POST', '/chat/' + currentChatOrderId, { text }); loadChat(currentChatOrderId, false); }
        catch (e) { toast(e.message, 'error'); }
      };
    }
    const chatInput = document.getElementById('chatInput');
    if (chatInput) chatInput.onkeypress = e => { if (e.key === 'Enter') document.getElementById('chatSend')?.click(); };

    async function loadChat(orderId, reset = true) {
      try {
        const { items } = await API.req('GET', '/chat/' + orderId);
        const body = document.getElementById('chatBody');
        if (!body) return;
        if (!document.getElementById('chatModal')?.classList.contains('active') && items.length > lastChatCount && !reset) {
          const badge = document.getElementById('chatBadge');
          if (badge) { badge.textContent = items.length - lastChatCount; badge.style.display = 'inline-block'; }
        }
        if (reset) body.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--dim);font-weight:600;">Сделка создана.</div>';
        const rendered = body.querySelectorAll('[data-msg-id]').length;
        items.slice(rendered).forEach(m => {
          const div = document.createElement('div');
          div.className = 'msg' + (m.isMine ? ' me' : '');
          div.dataset.msgId = m.id;
          div.innerHTML = `<div class="avatar" style="width:28px;height:28px;font-size:11px">${m.senderUsername[0].toUpperCase()}</div><div><div class="msg-bubble">${m.text.replace(/</g, '&lt;')}</div><div style="font-size:10px;color:var(--dim);margin-top:2px;font-weight:600;">${new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
          body.appendChild(div);
        });
        body.scrollTop = body.scrollHeight;
        if (document.getElementById('chatModal')?.classList.contains('active')) lastChatCount = items.length;
      } catch (e) {}
    }

    // ОТЗЫВЫ
    let currentReviewOrderId = null, currentRating = 5;

    window.openReview = function(orderId) {
      currentReviewOrderId = orderId; currentRating = 5;
      const c = document.getElementById('reviewComment'); if (c) c.value = '';
      const er = document.getElementById('reviewError'); if (er) er.textContent = '';
      updateStars();
      document.getElementById('reviewModal')?.classList.add('active');
    };

    function updateStars() {
      document.querySelectorAll('#ratingStars .rating-star').forEach(s => s.classList.toggle('active', +s.dataset.r <= currentRating));
    }

    document.querySelectorAll('#ratingStars .rating-star').forEach(s => {
      s.onclick = () => { currentRating = +s.dataset.r; updateStars(); };
    });

    const reviewSubmitBtn = document.getElementById('reviewSubmitBtn');
    if (reviewSubmitBtn) {
      reviewSubmitBtn.onclick = async () => {
        reviewSubmitBtn.disabled = true;
        try {
          if (currentReviewOrderId === 'platform') {
            await API.req('POST', '/platform-reviews', { rating: currentRating, comment: document.getElementById('reviewComment')?.value || '' });
            toast('Спасибо за оценку платформы!', 'success');
          } else {
            await API.req('POST', '/reviews', { order_id: currentReviewOrderId, rating: currentRating, comment: document.getElementById('reviewComment')?.value || '' });
            toast('Отзыв добавлен!', 'success');
          }
          closeModal('reviewModal'); loadProfile();
        } catch (e) {
          const map = { already_reviewed: 'Вы уже оставили отзыв', no_completed_deals: 'Нужна хотя бы 1 завершенная сделка' };
          const er = document.getElementById('reviewError'); if (er) er.textContent = map[e.code] || e.message;
        } finally { reviewSubmitBtn.disabled = false; }
      };
    }

    // ПРОФИЛЬ
    let profileTab = 'ads';

    async function loadProfile() {
      const u = API.user();
      const content = document.getElementById('profileContent');
      if (!content) return;
      if (!u) { content.innerHTML = '<div class="empty-state"><button class="btn btn-primary" onclick="document.getElementById(\'authModal\').classList.add(\'active\')">Войти</button></div>'; return; }
      try {
        const { user, stats } = await API.req('GET', '/users/me');
        const kycBadge = user.kycStatus === 'verified' ? '<span style="background:rgba(34,197,94,.12);color:var(--grn);border:1px solid rgba(34,197,94,.3);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;margin-top:6px;display:inline-block">Проверен</span>' : '<span style="background:rgba(138,138,138,.12);color:var(--dim);border:1px solid var(--brd);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;margin-top:6px;display:inline-block">Не проверен</span>';
        const adminBadge = user.role === 'admin' ? '<span style="background:rgba(255,214,10,.12);color:var(--yellow);border:1px solid rgba(255,214,10,.3);padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;margin-top:6px;display:inline-block;margin-left:4px">ADMIN</span>' : '';

        let contentHtml = '';
        if (profileTab === 'ads') contentHtml = '<div id="myAdsList">Загрузка...</div>';
        else if (profileTab === 'history') contentHtml = '<div id="myHistoryList">Загрузка...</div>';
        else if (profileTab === 'reviews') contentHtml = '<div id="myReviewsList">Загрузка...</div>';

        content.innerHTML = `
          <div style="display:flex;align-items:center;gap:16px;padding:20px;background:var(--surf);border:1px solid var(--brd);border-radius:16px;margin-bottom:20px">
            <div class="avatar lg">${user.username[0].toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <h2 style="font-size:20px;font-weight:800;margin-bottom:4px">${user.username}</h2>
              <div style="font-size:13px;color:var(--dim);font-weight:500;">${user.email}</div>
              <div style="font-size:12px;color:var(--dim);margin-top:2px;font-weight:500;">С нами с ${new Date(user.createdAt).toLocaleDateString('ru-RU')}</div>
              <div>${kycBadge} ${adminBadge}</div>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><div class="stat-lbl">Сделок</div><div class="stat-val">${stats.dealsTotal}</div></div>
            <div class="stat"><div class="stat-lbl">Успешных</div><div class="stat-val">${stats.successRate !== null ? stats.successRate + '%' : '—'}</div></div>
            <div class="stat"><div class="stat-lbl">Отзывов</div><div class="stat-val">${stats.reviewsCount}</div></div>
            <div class="stat"><div class="stat-lbl">Рейтинг</div><div class="stat-val">${stats.ratingAvg ? '★ ' + stats.ratingAvg : '—'}</div></div>
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
      } catch (e) { content.innerHTML = '<div class="empty-state">Ошибка загрузки профиля</div>'; }
    }

    window.switchProfileTab = function(tab) {
      profileTab = tab;
      loadProfile();
    };

    async function loadMyAds() {
      try {
        const { items } = await API.req('GET', '/ads/my');
        window._myAds = {};
        items.forEach(ad => window._myAds[ad.id] = ad);
        const list = document.getElementById('myAdsList');
        if (!list) return;
        list.innerHTML = items.length ? items.map(ad => `
          <div class="ad-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <strong style="font-size:15px;">${ad.side === 'sell' ? 'Продажа' : 'Покупка'} ${ad.asset}</strong>
              <span style="color:${ad.active ? 'var(--grn)' : 'var(--red)'};font-size:12px;font-weight:700;">${ad.active ? 'Активно' : 'Неактивно'}</span>
            </div>
            <div class="ad-body">
              <div><div class="ad-lbl">Курс</div><div class="ad-val">${fmt(ad.price)} ₽</div></div>
              <div><div class="ad-lbl">Остаток</div><div class="ad-val">${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div></div>
            </div>
            <button class="btn btn-ghost btn-block btn-sm" onclick="openEditAd(${ad.id})" style="margin-top:10px;">Редактировать</button>
          </div>
        `).join('') : '<div class="empty-state">У вас нет объявлений</div>';
      } catch (e) { const l = document.getElementById('myAdsList'); if (l) l.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    async function loadMyHistory() {
      try {
        const { items } = await API.req('GET', '/orders/my?status=completed');
        const list = document.getElementById('myHistoryList');
        if (!list) return;
        list.innerHTML = items.length ? items.map(o => `
          <div class="ad-card" style="border-left:4px solid var(--grn);">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <strong style="font-size:15px;">#${o.publicId}</strong>
              <span style="color:var(--grn);font-size:12px;font-weight:700;">Завершен</span>
            </div>
            <div class="ad-body">
              <div><div class="ad-lbl">Сумма</div><div class="ad-val">${fmt(o.amountRub)} ₽</div></div>
              <div><div class="ad-lbl">Актив</div><div class="ad-val">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
            </div>
          </div>
        `).join('') : '<div class="empty-state">История пуста</div>';
      } catch (e) { const l = document.getElementById('myHistoryList'); if (l) l.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    async function loadMyReviews() {
      try {
        const u = API.user();
        const data = await API.req('GET', '/reviews/user/' + u.id);
        const items = data.items || [];
        const list = document.getElementById('myReviewsList');
        if (!list) return;
        list.innerHTML = items.length ? items.map(r => `
          <div class="ad-card">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <strong style="font-size:14px;">${r.author}</strong>
              <span style="color:var(--yellow);font-size:16px;">${'★'.repeat(r.rating)}</span>
            </div>
            <p style="font-size:13px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p>
          </div>
        `).join('') : '<div class="empty-state">Отзывов нет</div>';
      } catch (e) { const l = document.getElementById('myReviewsList'); if (l) l.innerHTML = '<div class="empty-state">Отзывов нет</div>'; }
    }

    // РЕДАКТИРОВАНИЕ ОБЪЯВЛЕНИЯ
    window.openEditAd = function(adId) {
      const ad = window._myAds?.[adId];
      if (!ad) return;
      document.getElementById('edit-price').value = ad.price;
      document.getElementById('edit-min').value = ad.minRub;
      document.getElementById('edit-max').value = ad.maxRub;
      document.getElementById('edit-terms').value = ad.terms || '';
      document.getElementById('editError').textContent = '';
      document.getElementById('editAdModal').dataset.id = adId;
      document.getElementById('editAdModal').classList.add('active');
    };

    const editSaveBtn = document.getElementById('editSaveBtn');
    if (editSaveBtn) {
      editSaveBtn.onclick = async () => {
        const modal = document.getElementById('editAdModal');
        const adId = modal.dataset.id;
        const btn = editSaveBtn; btn.disabled = true;
        try {
          await API.req('PATCH', `/ads/${adId}`, {
            price: document.getElementById('edit-price').value,
            min_rub: document.getElementById('edit-min').value,
            max_rub: document.getElementById('edit-max').value,
            payment_methods: ['СБП'],
            terms: document.getElementById('edit-terms').value
          });
          closeModal('editAdModal'); toast('Объявление обновлено!', 'success'); loadProfile();
        } catch (e) { document.getElementById('editError').textContent = e.message; }
        finally { btn.disabled = false; }
      };
    }

    // МОДАЛКА ОРДЕРА
    let currentAd = null, selectedPay = null;

    window.openOrderModal = function(adId) {
      const ad = (window._ads || {})[adId];
      if (!ad) return;
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
      document.getElementById('orderTerms').textContent = ad.terms || 'Стандартные условия сделки.';
      document.getElementById('orderAmount').oninput = e => {
        const rub = parseFloat(e.target.value) || 0;
        document.getElementById('orderResult').textContent = fmtDec(rub / ad.price, 4) + ' ' + ad.asset;
      };
      const payBox = document.getElementById('orderPayments');
      if (!payBox) return;
      payBox.innerHTML = '';
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
    };

    async function submitOrder() {
      const errEl = document.getElementById('orderError'); if (errEl) errEl.textContent = '';
      const rub = parseFloat(document.getElementById('orderAmount').value) || 0;
      if (!selectedPay) { if (errEl) errEl.textContent = 'Выберите способ оплаты'; return; }
      if (rub < currentAd.minRub) { if (errEl) errEl.textContent = 'Минимум ' + fmt(currentAd.minRub) + ' ₽'; return; }
      if (rub > currentAd.maxRub) { if (errEl) errEl.textContent = 'Максимум ' + fmt(currentAd.maxRub) + ' ₽'; return; }
      const btn = document.getElementById('orderSubmit'); btn.disabled = true; btn.textContent = '...';
      try {
        const order = await API.req('POST', '/orders', { ad_id: currentAd.id, amount_rub: rub, payment_method: selectedPay });
        closeModal('orderModal'); toast('Ордер создан!', 'success'); openOrderPage(order.id);
      } catch (err) {
        const map = { self_trade: 'Нельзя торговать с собой.', insufficient_asset: 'Недостаточно актива', ad_inactive: 'Объявление неактивно', bad_payment: 'Способ оплаты недоступен' };
        if (errEl) errEl.textContent = map[err.code] || err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = currentAd ? (currentAd.side === 'sell' ? 'Купить ' : 'Продать ') + currentAd.asset : 'OK';
      }
    }

    // НАСТРОЙКИ
    window.openSettings = function() {
      const u = API.user(); if (!u) return;
      document.getElementById('settingsEmail').value = u.email;
      document.getElementById('settingsError').textContent = '';
      document.getElementById('settingsModal').classList.add('active');
    };

    const settingsSaveBtn = document.getElementById('settingsSaveBtn');
    if (settingsSaveBtn) {
      settingsSaveBtn.onclick = async () => {
        const btn = settingsSaveBtn; btn.disabled = true;
        try {
          const { user } = await API.req('PATCH', '/users/me', { email: document.getElementById('settingsEmail').value });
          localStorage.setItem('vexo_user', JSON.stringify(user));
          closeModal('settingsModal'); toast('Настройки сохранены', 'success'); loadProfile();
        } catch (e) {
          const er = document.getElementById('settingsError');
          if (er) er.textContent = e.code === 'email_taken' ? 'Этот email уже занят' : 'Неверный email';
        } finally { btn.disabled = false; }
      };
    }

    window.logoutAction = async function() {
      if (await confirmAsync('Выход', 'Выйти из аккаунта?', 'Выйти')) {
        localStorage.removeItem('vexo_token'); localStorage.removeItem('vexo_user'); location.reload();
      }
    };

    // КОШЕЛЕК
    let walletActionType = 'deposit';

    const btnDeposit = document.getElementById('btnDeposit');
    if (btnDeposit) {
      btnDeposit.onclick = () => {
        walletActionType = 'deposit';
        document.getElementById('walletActionTitle').textContent = 'Пополнение';
        document.getElementById('walletRequisitesField').style.display = 'none';
        document.getElementById('walletActionAmount').value = '';
        document.getElementById('walletActionRequisites').value = '';
        document.getElementById('walletActionModal').classList.add('active');
      };
    }

    const btnWithdraw = document.getElementById('btnWithdraw');
    if (btnWithdraw) {
      btnWithdraw.onclick = () => {
        walletActionType = 'withdraw';
        document.getElementById('walletActionTitle').textContent = 'Вывод';
        document.getElementById('walletRequisitesField').style.display = 'block';
        document.getElementById('walletActionAmount').value = '';
        document.getElementById('walletActionRequisites').value = '';
        document.getElementById('walletActionModal').classList.add('active');
      };
    }

    document.querySelectorAll('#walletActionAsset .icon-chip').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#walletActionAsset .icon-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
      };
    });

    const walletActionSubmit = document.getElementById('walletActionSubmit');
    if (walletActionSubmit) {
      walletActionSubmit.onclick = () => {
        if (!API.user()) {
          closeModal('walletActionModal');
          document.getElementById('authModal')?.classList.add('active');
          return;
        }
        const asset = document.querySelector('#walletActionAsset .icon-chip.active')?.dataset.val;
        const amount = document.getElementById('walletActionAmount')?.value;
        const requisites = document.getElementById('walletActionRequisites')?.value;

        if (!amount || Number(amount) <= 0) return toast('Введите корректную сумму', 'error');
        if (walletActionType === 'withdraw' && !requisites) return toast('Введите реквизиты', 'error');

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
    }

    // КАРУСЕЛЬ
    (function() {
      const track = document.getElementById('bannerTrack');
      const dots = document.querySelectorAll('.banner-dot');
      if (!track || !dots.length) return;
      let idx = 0, timer;
      function go(i) { idx = (i + dots.length) % dots.length; track.style.transform = `translateX(-${idx * 100}%)`; dots.forEach((d, k) => d.classList.toggle('active', k === idx)); }
      function auto() { clearInterval(timer); timer = setInterval(() => go(idx + 1), 4500); }
      dots.forEach((d, i) => d.onclick = () => { go(i); auto(); });
      auto();
    })();

    // СТАРТ
    updateAuthUI();
    try { loadHome(); } catch(e) { console.error('Initial loadHome:', e); }

    console.log('VEXO: ВСЁ ЗАГРУЖЕНО И РАБОТАЕТ');

  } catch (err) {
    console.error('VEXO: КРИТИЧЕСКАЯ ОШИБКА', err);
    alert('Ошибка инициализации VEXO: ' + err.message);
  }
});