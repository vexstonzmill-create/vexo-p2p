document.addEventListener('contextmenu', e => { 
  if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); 
});

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
        
        // Защита от дублей тостов
        const existing = Array.from(c.children).find(el => el.textContent === msg);
        if (existing) return;

        if (c.children.length >= 2) c.removeChild(c.firstElementChild);

        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        c.appendChild(el);
        
        setTimeout(() => { 
          el.style.opacity = '0'; 
          el.style.transition = '.3s'; 
          setTimeout(() => el.remove(), 300); 
        }, 3000);
      } catch(e) { console.error(e); }
    }

    function confirmAsync(title, message, okText = 'OK') {
      return new Promise(resolve => {
        const overlay = document.getElementById('dialogOverlay');
        const content = document.getElementById('dialogContent');
        if (!overlay || !content) return resolve(false);
        content.innerHTML = `<h3 style="font-size:18px;font-weight:800">${title}</h3><p style="font-size:14px;color:var(--dim);margin:10px 0;font-weight:500;">${message}</p><div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-ghost" style="flex:1;" id="dlgCancel">Отмена</button><button class="btn btn-primary" style="flex:1;" id="dlgOk">${okText}</button></div>`;
        overlay.classList.add('active');
        document.getElementById('dlgCancel').onclick = () => { overlay.classList.remove('active'); resolve(false); };
        document.getElementById('dlgOk').onclick = () => { overlay.classList.remove('active'); resolve(true); };
      });
    }

    function closeModal(id) { 
      const el = document.getElementById(id); 
      if (el) el.classList.remove('active');
    }
    window.closeModal = closeModal;

    // --- БАННЕРЫ ---
    (function initCarousel() {
      const track = document.getElementById('bannerTrack');
      const dots = document.querySelectorAll('.banner-dot');
      const viewport = document.getElementById('bannerViewport');
      if (!track || !dots.length) return;
      let idx = 0, timer;
      function go(i) { idx = (i + dots.length) % dots.length; track.style.transform = `translateX(-${idx * 100}%)`; dots.forEach((d, k) => d.classList.toggle('active', k === idx)); }
      function auto() { clearInterval(timer); timer = setInterval(() => go(idx + 1), 4500); }
      dots.forEach((d, i) => d.onclick = () => { go(i); auto(); });
      let startX = 0;
      viewport.addEventListener('touchstart', e => { startX = e.touches[0].clientX; clearInterval(timer); }, { passive: true });
      viewport.addEventListener('touchend', e => { const endX = e.changedTouches[0].clientX; const diff = startX - endX; if (diff > 50) go(idx + 1); if (diff < -50) go(idx - 1); auto(); });
      auto();
    })();

    // --- УВЕДОМЛЕНИЯ ---
    let notifications = JSON.parse(localStorage.getItem('vexo_notifs')) || [];
    
    // Очистка старых дублей при загрузке
    notifications = notifications.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);

    function addNotification(text) {
      // Защита от спама одинаковыми уведомлениями
      const now = Date.now();
      const isDuplicate = notifications.some(n => n.text === text && (now - new Date(n.date).getTime() < 3000));
      if (isDuplicate) return;

      notifications.unshift({ id: now, text, date: new Date().toISOString() });
      if (notifications.length > 20) notifications.pop();
      localStorage.setItem('vexo_notifs', JSON.stringify(notifications));
      updateNotifUI();
    }
    
    window.clearNotifications = () => {
      notifications = [];
      localStorage.setItem('vexo_notifs', JSON.stringify([]));
      updateNotifUI();
    };

    function updateNotifUI() {
      const dot = document.getElementById('notifDot');
      const list = document.getElementById('notificationsList');
      if (dot) dot.classList.toggle('hidden', notifications.length === 0);
      if (list) {
        list.innerHTML = notifications.length ? notifications.map(n => `
          <div class="glass-card" style="padding:12px;">
            <div style="font-size:10px;color:var(--dim);margin-bottom:4px;">${new Date(n.date).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</div>
            <div style="font-size:13px;font-weight:600;">${n.text}</div>
          </div>
        `).join('') : '<div class="empty-state">Нет новых уведомлений</div>';
      }
    }

    document.getElementById('notifBtn')?.addEventListener('click', () => {
      document.getElementById('notificationsModal').classList.add('active');
      updateNotifUI();
    });

    // --- НАВИГАЦИЯ ---
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
        if (name === 'wallet') loadWallet();
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

    document.getElementById('themeBtn')?.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(currentTheme);
      toast('Тема: ' + (currentTheme === 'dark' ? 'Тёмная' : 'Светлая'), 'info');
    });

    // АВТОРИЗАЦИЯ
    let authMode = 'login';
    function setAuthMode(mode) {
      authMode = mode;
      document.getElementById('tabLogin')?.classList.toggle('active', mode === 'login');
      document.getElementById('tabRegister')?.classList.toggle('active', mode === 'register');
      document.getElementById('emailField')?.classList.toggle('hidden', mode !== 'register');
      const l = document.getElementById('loginLabel');
      if (l) l.textContent = mode === 'register' ? 'Никнейм (логин)' : 'Логин или Email';
      const b = document.getElementById('authSubmit');
      if (b) b.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
      const er = document.getElementById('authError');
      if (er) er.textContent = '';
    }

    document.getElementById('tabLogin')?.addEventListener('click', () => setAuthMode('login'));
    document.getElementById('tabRegister')?.addEventListener('click', () => setAuthMode('register'));
    document.getElementById('loginBtn')?.addEventListener('click', () => { setAuthMode('login'); document.getElementById('authModal')?.classList.add('active'); });
    document.getElementById('avatarBtn')?.addEventListener('click', () => show('profile'));

    document.getElementById('authForm')?.addEventListener('submit', async (e) => {
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
        toast(authMode === 'login' ? 'Добро пожаловать!' : 'Аккаунт создан!', 'success');
        show('market');
      } catch (err) {
        const map = { invalid_credentials: 'Неверный логин или пароль', user_exists: 'Никнейм занят', email_exists: 'Email занят', short_password: 'Пароль мин. 8 символов' };
        if (errEl) errEl.textContent = map[err.code] || err.message;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться'; }
      }
    });

    function updateAuthUI() {
      const u = API.user();
      const lb = document.getElementById('loginBtn');
      const ab = document.getElementById('avatarBtn');
      if (u) {
        if (lb) lb.classList.add('hidden');
        if (ab) {
          ab.classList.remove('hidden');
          ab.style.background = 'var(--btn-bg)'; ab.style.color = 'var(--btn-txt)'; ab.style.width = '32px'; ab.style.height = '32px';
          ab.style.borderRadius = '50%'; ab.style.display = 'flex'; ab.style.alignItems = 'center'; ab.style.justifyContent = 'center';
          ab.style.fontWeight = '800'; ab.style.fontSize = '14px';
          if (u.avatarUrl) {
            ab.innerHTML = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'; this.parentElement.innerHTML='${(u.displayName || u.username || '?')[0].toUpperCase()}';">`;
          } else {
            ab.innerHTML = (u.displayName || u.username || '?')[0].toUpperCase();
          }
        }
      } else {
        if (lb) lb.classList.remove('hidden');
        if (ab) ab.classList.add('hidden');
      }
    }

    // ГЛАВНАЯ
    async function loadHome() {
      const list = document.getElementById('homeTopAds');
      if (!list) return;
      try {
        const { items } = await API.req('GET', '/ads?side=sell');
        const top3 = items.slice(0, 3);
        list.innerHTML = top3.length ? top3.map(renderAd).join('') : '<div class="empty-state">Нет предложений</div>';
        bindAdButtons();
      } catch(e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    // КОШЕЛЕК
    let walletActionType = 'deposit';
    function loadWallet() {
      const u = API.user();
      const screen = document.getElementById('screen-wallet');
      if (!u) {
        screen.innerHTML = `<div class="empty-state" style="margin-top:20px;"><div style="font-size:40px;margin-bottom:10px;">🔒</div>Войдите в аккаунт.<br><br><button class="btn btn-primary" onclick="document.getElementById('authModal').classList.add('active')">Войти</button></div>`;
      } else {
        screen.innerHTML = `
          <h2 style="margin-bottom: 4px; font-size: 18px;">Кошелёк</h2>
          <p style="color: var(--dim); font-size: 12px; margin-bottom: 16px;">Балансы и история операций</p>
          <div class="wallet-hero">
            <div class="lbl">Общий баланс в рублях</div>
            <div class="amount">0,00 <span>₽</span></div>
            <div class="wallet-actions">
              <button class="btn btn-primary" id="btnDeposit" style="flex:1;">Пополнить</button>
              <button class="btn btn-ghost" id="btnWithdraw" style="flex:1;">Вывести</button>
            </div>
          </div>
          <h3 style="margin-top: 20px; font-size: 14px; margin-bottom: 12px;">Активы</h3>
          <div class="wallet-list">
            <div class="wallet-item"><div class="coin-icon rub">₽</div><div class="w-info"><div class="w-name">Российский рубль</div><div class="w-sub">RUB · фиат</div></div><div class="w-bal">0,00 ₽</div></div>
            <div class="wallet-item"><div class="coin-icon usdt">₮</div><div class="w-info"><div class="w-name">Tether</div><div class="w-sub">USDT · TRC-20</div></div><div class="w-bal">0,00 <span>≈ 0 ₽</span></div></div>
          </div>`;
        document.getElementById('btnDeposit').onclick = () => { walletActionType = 'deposit'; document.getElementById('walletActionTitle').textContent = 'Пополнение'; document.getElementById('walletRequisitesField').style.display = 'none'; document.getElementById('walletActionModal').classList.add('active'); };
        document.getElementById('btnWithdraw').onclick = () => { walletActionType = 'withdraw'; document.getElementById('walletActionTitle').textContent = 'Вывод'; document.getElementById('walletRequisitesField').style.display = 'block'; document.getElementById('walletActionModal').classList.add('active'); };
      }
    }

    // МАРКЕТ
    async function loadMarket() {
      const filters = {};
      const activeTab = document.querySelector('#marketSideTabs .trade-tab.active');
      if (activeTab && activeTab.dataset.side) filters.side = activeTab.dataset.side === 'buy' ? 'sell' : 'buy';
      const faceChip = document.querySelector('#filterFace .chip.active'); if (faceChip && faceChip.dataset.val) filters.face_type = faceChip.dataset.val;
      const assetChip = document.querySelector('#filterAsset .icon-chip.active'); if (assetChip && assetChip.dataset.val) filters.asset = assetChip.dataset.val;
      const payChip = document.querySelector('#filterPayment .icon-chip.active'); if (payChip && payChip.dataset.val) filters.payment = payChip.dataset.val;
      const fMin = document.getElementById('filterMinAmount')?.value;
      const fMax = document.getElementById('filterMaxAmount')?.value;
      if (fMin) filters.min_amount = fMin;
      if (fMax) filters.max_amount = fMax;

      const list = document.getElementById('adsList');
      if (!list) return;
      list.innerHTML = '<div class="empty-state">Загрузка...</div>';

      try {
        const { items } = await API.req('GET', '/ads?' + new URLSearchParams(filters));
        list.innerHTML = items.length ? items.map(renderAd).join('') : '<div class="empty-state">Объявлений не найдено</div>';
        bindAdButtons();
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    document.getElementById('openFilterBtn')?.addEventListener('click', () => {
      document.getElementById('filterModal').classList.add('active');
    });
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
      closeModal('filterModal');
      loadMarket();
    });

    function renderAd(ad) {
      const isSell = ad.side === 'sell';
      const faceLabel = ad.faceType === 'first' ? '1-е лицо' : '3-е лицо';
      window._ads = window._ads || {}; window._ads[ad.id] = ad;
      const pays = (ad.paymentMethods || []).map(p => `<span class="pay-tag">${p}</span>`).join('');
      
      let avatarHtml = `<div class="avatar">${ad.displayName[0].toUpperCase()}</div>`;
      if (ad.avatarUrl) avatarHtml = `<div class="avatar"><img src="${ad.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${ad.displayName[0].toUpperCase()}'"></div>`;
      
      const merchantBadge = ad.isMerchant ? `<span class="badge-merchant" title="Проверенный мерчант">✓</span>` : '';

      return `<div class="ad-card">
        <div class="ad-head" onclick="openPublicProfile(${ad.userId})">
          ${avatarHtml}
          <div class="ad-user">
            <div class="ad-name">${ad.displayName} ${merchantBadge} <span class="badge-face">${faceLabel}</span> ${ad.isPro ? '<span class="badge-pro">PRO</span>' : ''}</div>
            <div class="ad-meta"><span>★ ${ad.ratingAvg || '—'}</span> <span>${ad.dealsCompleted || 0} сделок</span></div>
          </div>
        </div>
        <div class="ad-body">
          <div class="ad-price-block">
             <div class="ad-price">${fmt(ad.price)} ₽</div>
             <div class="ad-limits">Лимиты: ${fmt(ad.minRub)} - ${fmt(ad.maxRub)} RUB</div>
             <div class="ad-amount">Доступно: ${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div>
             ${pays ? `<div class="ad-pay-methods" style="justify-content:flex-start;margin-top:4px;">${pays}</div>` : ''}
          </div>
          <div class="ad-action">
             <button class="btn ${isSell ? 'btn-buy' : 'btn-sell'} btn-sm" data-ad-id="${ad.id}" style="min-width:100px;">${isSell ? 'Купить' : 'Продать'}</button>
          </div>
        </div>
      </div>`;
    }

    function bindAdButtons() {
      document.querySelectorAll('[data-ad-id]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; }
          openOrderModal(+b.dataset.adId);
        };
      });
    }

    document.querySelectorAll('#marketSideTabs .trade-tab').forEach(c => c.onclick = () => { document.querySelectorAll('#marketSideTabs .trade-tab').forEach(x => x.classList.remove('active')); c.classList.add('active'); loadMarket(); });
    document.querySelectorAll('#filterFace .chip').forEach(c => c.onclick = () => { document.querySelectorAll('#filterFace .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); loadMarket(); });
    document.querySelectorAll('#filterAsset .icon-chip').forEach(c => c.onclick = () => { document.querySelectorAll('#filterAsset .icon-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); loadMarket(); });
    document.querySelectorAll('#filterPayment .icon-chip').forEach(c => c.onclick = () => { document.querySelectorAll('#filterPayment .icon-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); });

    window.openPublicProfile = async function(userId) {
      const m = document.getElementById('publicProfileModal'); const c = document.getElementById('publicProfileContent');
      if (!m || !c) return; c.innerHTML = '<div class="empty-state">Загрузка...</div>'; m.classList.add('active');
      try {
        const { user, stats, isFavorite } = await API.req('GET', '/users/' + userId);
        let avatarHtml = `<div class="avatar lg" style="margin:0 auto 10px;">${user.displayName[0].toUpperCase()}</div>`;
        if (user.avatarUrl) avatarHtml = `<div class="avatar lg" style="margin:0 auto 10px;"><img src="${user.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${user.displayName[0].toUpperCase()}'"></div>`;
        let favBtn = '';
        if (API.user() && API.user().id !== user.id) favBtn = `<button class="btn-fav ${isFavorite ? 'active' : ''}" onclick="toggleFavorite(${user.id}, this)" style="position:absolute;top:20px;right:20px;font-size:24px;background:none;border:none;">${isFavorite ? '❤️' : '🤍'}</button>`;
        
        const merchantBadge = stats.isMerchant ? `<span class="badge-merchant" style="width:20px;height:20px;font-size:12px;margin-left:6px;" title="Проверенный мерчант">✓</span>` : '';

        c.innerHTML = `
          ${favBtn}
          <div style="text-align:center; margin-bottom: 20px; margin-top:10px;">
            ${avatarHtml}
            <h2 style="font-size:20px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;justify-content:center;">${user.displayName} ${merchantBadge} ${stats.isPro ? '<span class="badge-pro">PRO</span>' : ''}</h2>
            <div style="font-size:12px;color:var(--dim);font-weight:600;">@${user.username}</div>
          </div>
          <div class="stats" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="glass-card" style="padding:12px;text-align:center;"><div style="font-size:11px;color:var(--dim);">Сделок</div><div style="font-size:18px;font-weight:800;">${stats.dealsTotal}</div></div>
            <div class="glass-card" style="padding:12px;text-align:center;"><div style="font-size:11px;color:var(--dim);">Успешных</div><div style="font-size:18px;font-weight:800;">${stats.successRate !== null ? stats.successRate + '%' : '—'}</div></div>
            <div class="glass-card" style="padding:12px;text-align:center;"><div style="font-size:11px;color:var(--dim);">Отзывов</div><div style="font-size:18px;font-weight:800;">${stats.reviewsCount}</div></div>
            <div class="glass-card" style="padding:12px;text-align:center;"><div style="font-size:11px;color:var(--dim);">Рейтинг</div><div style="font-size:18px;font-weight:800;">${stats.ratingAvg || '—'}</div></div>
          </div>
          <div id="publicReviewsList" style="margin-top:16px;">Загрузка отзывов...</div>`;
        loadPublicReviews(user.id);
      } catch(e) { c.innerHTML = '<div class="empty-state">Ошибка загрузки профиля</div>'; }
    };

    window.toggleFavorite = async function(targetId, btnEl) {
      if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; }
      try {
        const res = await API.req('POST', '/users/' + targetId + '/favorite');
        if (res.isFavorite) { btnEl.classList.add('active'); btnEl.innerHTML = '❤️'; toast('В избранном', 'success'); }
        else { btnEl.classList.remove('active'); btnEl.innerHTML = '🤍'; toast('Удалено', 'info'); }
      } catch(e) { toast('Ошибка', 'error'); }
    };

    async function loadPublicReviews(userId) {
      const list = document.getElementById('publicReviewsList'); if (!list) return;
      try {
        const data = await API.req('GET', '/reviews/user/' + userId);
        const items = data.items || [];
        list.innerHTML = `<div style="font-size:12px;font-weight:800;margin-bottom:10px;color:var(--dim);text-transform:uppercase;">Отзывы</div>` + 
          (items.length ? items.map(r => `<div class="glass-card" style="padding:12px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong style="font-size:13px;">${r.author}</strong><span style="color:var(--txt);font-size:14px;">${'★'.repeat(r.rating)}</span></div><p style="font-size:12px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p></div>`).join('') : '<div class="empty-state">Отзывов пока нет</div>');
      } catch(e) { list.innerHTML = ''; }
    }

    // СОЗДАНИЕ ОБЪЯВЛЕНИЯ
    document.querySelectorAll('#f-side .seg-btn').forEach(b => { b.onclick = () => { document.querySelectorAll('#f-side .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });
    document.querySelectorAll('#f-face .seg-btn').forEach(b => { b.onclick = () => { document.querySelectorAll('#f-face .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });
    document.querySelectorAll('#f-payments .pay-chip').forEach(c => { c.onclick = () => c.classList.toggle('active'); });
    document.querySelectorAll('#f-time .pay-chip').forEach(c => { c.onclick = () => { document.querySelectorAll('#f-time .pay-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); }; });
    document.querySelectorAll('#f-asset-select .icon-chip').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#f-asset-select .icon-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        const lbl = document.getElementById('f-asset-label');
        if (lbl) lbl.textContent = c.dataset.val;
      };
    });

    document.getElementById('createBtn')?.addEventListener('click', async () => {
      const errEl = document.getElementById('createError'); if (errEl) errEl.textContent = '';
      if (!API.user()) { if (errEl) errEl.textContent = 'Войдите в аккаунт'; setTimeout(() => document.getElementById('authModal')?.classList.add('active'), 500); return; }
      
      const payments = [...document.querySelectorAll('#f-payments .pay-chip.active')].map(c => c.dataset.val);
      if (!payments.length) { if (errEl) errEl.textContent = 'Выберите способ оплаты'; return; }
      
      const price = document.getElementById('f-price')?.value;
      const amount = document.getElementById('f-amount')?.value;
      const min = document.getElementById('f-min')?.value;
      const max = document.getElementById('f-max')?.value;
      if (!price || !amount || !min || !max) { if (errEl) errEl.textContent = 'Заполните все поля'; return; }
      
      const payment_time = document.querySelector('#f-time .pay-chip.active')?.dataset.val || 30;

      const btn = document.getElementById('createBtn'); btn.disabled = true; btn.textContent = 'Публикация...';
      const asset = document.querySelector('#f-asset-select .icon-chip.active')?.dataset.val;
      
      try {
        await API.req('POST', '/ads', {
          side: document.querySelector('#f-side .seg-btn.active')?.dataset.val,
          face_type: document.querySelector('#f-face .seg-btn.active')?.dataset.val,
          asset: asset, price: price, amount_total: amount,
          min_rub: min, max_rub: max,
          payment_methods: payments, terms: document.getElementById('f-terms')?.value || '',
          payment_time: Number(payment_time)
        });
        toast('Объявление опубликовано!', 'success');
        addNotification('Вы успешно создали новое объявление.');
        show('market');
      } catch (err) {
        const map = { max_exceeds_total: 'Максимальный лимит больше общего объёма', min_gt_max: 'Минимум больше максимума', bad_amounts: 'Проверьте числа' };
        if (errEl) errEl.textContent = map[err.code] || err.message;
      } finally { btn.disabled = false; btn.textContent = 'Опубликовать'; }
    });

    // ОРДЕРА (ЗАЯВКИ)
    async function loadOrders(filter) {
      const list = document.getElementById('ordersList'); if (!list) return;
      if (!API.user()) { list.innerHTML = '<div class="empty-state">Войдите, чтобы увидеть ордера</div>'; return; }
      try {
        const { items } = await API.req('GET', '/orders/my?status=' + filter);
        const sc = { pending: 'var(--yellow)', accepted: 'var(--blue)', paid: 'var(--grn)', completed: 'var(--grn)', cancelled: 'var(--red)', declined: 'var(--red)', dispute: 'var(--gold)' };
        list.innerHTML = items.length ? items.map(o => `
          <div class="ad-card" style="cursor:pointer;border-left:4px solid ${sc[o.status] || 'var(--dim)'}" data-order-id="${o.id}">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px">
              <strong style="font-family:Inter,monospace;font-size:15px;">#${o.publicId}</strong>
              <span style="color:${sc[o.status] || 'var(--txt)'};font-size:12px;font-weight:800">${o.statusLabel}</span>
            </div>
            <div class="ad-body">
              <div><div class="ad-lbl">Сумма</div><div class="ad-val">${fmt(o.amountRub)} ₽</div></div>
              <div><div class="ad-lbl">Актив</div><div class="ad-val">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
            </div>
            <div style="font-size:12px;color:var(--dim);display:flex;justify-content:space-between;font-weight:600;margin-top:12px;">
              <span>${new Date(o.createdAt).toLocaleString('ru-RU')}</span>
              <span>${o.buyer.displayName} ↔ ${o.seller.displayName}</span>
            </div>
          </div>`).join('') : '<div class="empty-state">Ордеров нет</div>';
        list.querySelectorAll('[data-order-id]').forEach(el => { el.onclick = () => openOrderPage(+el.dataset.orderId); });
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
      const container = document.getElementById('orderDetailContent'); if (!container) return;
      container.innerHTML = '<div class="empty-state">Загрузка...</div>';
      try {
        const { order, history, terms } = await API.req('GET', '/orders/' + orderId);
        renderOrderPage(order, history, terms);
      } catch (e) { container.innerHTML = '<div class="empty-state">Ошибка загрузки ордера</div>'; }
    }

    function renderOrderPage(order, history, terms) {
      const u = API.user(), isBuyer = order.buyer_id === u.id, isSeller = order.seller_id === u.id, isAdmin = u.role === 'admin';
      const sc = { pending: '#FFD60A', accepted: '#3b82f6', paid: '#22c55e', completed: '#22c55e', cancelled: '#ef4444', declined: '#ef4444', dispute: '#D4AF37' };
      let progress = 20;
      if (order.status === 'accepted') progress = 40;
      if (order.status === 'paid') progress = 70;
      if (order.status === 'completed') progress = 100;
      if (order.status === 'cancelled' || order.status === 'dispute' || order.status === 'declined') progress = 0;

      const counterparty = isBuyer ? order.seller : order.buyer;
      const counterpartyRole = isBuyer ? 'Продавец' : 'Покупатель';

      let actionsHtml = '';
      
      if (order.status === 'pending') {
        if (isSeller) {
          actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px"><button class="btn btn-primary" onclick="doAction(${order.id},'accept')" style="background:var(--grn);color:#fff;border:none;">Принять заявку</button><button class="btn btn-ghost" style="color:var(--red);border-color:var(--red);" onclick="doAction(${order.id},'decline')">Отклонить</button></div>`;
        } else {
          actionsHtml = `<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:8px;font-weight:600;">Ожидайте подтверждения заявки продавцом</div>
          <button class="btn btn-ghost btn-block" style="color:var(--red);" onclick="doAction(${order.id},'cancel')">Отменить заявку</button>`;
        }
      } 
      else if (order.status === 'accepted') {
        if (isBuyer) {
          actionsHtml = `
          <div style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
            <div style="font-size:12px;color:var(--dim);margin-bottom:8px;">Время на оплату:</div>
            <div id="paymentTimerDisplay" style="font-size:24px;font-weight:900;color:var(--yellow);margin-bottom:12px;">--:--</div>
            <input type="file" id="receiptFile" style="display:none;" accept="image/*">
            <button class="btn btn-primary btn-block" onclick="document.getElementById('receiptFile').click()" style="margin-bottom:8px;">Прикрепить чек</button>
            <div id="fileName" style="font-size:11px;color:var(--grn);margin-bottom:12px;font-weight:600;"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
               <button class="btn btn-primary" onclick="doAction(${order.id},'paid')">Я оплатил</button>
               <button class="btn btn-ghost" style="color:var(--red);" onclick="doAction(${order.id},'cancel')">Отменить</button>
            </div>
          </div>`;
        } else {
          actionsHtml = `<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:8px;font-weight:600;">Ожидайте оплаты от покупателя</div><button class="btn btn-ghost btn-block" style="color:var(--gold);" onclick="doAction(${order.id},'dispute')">Открыть спор</button>`;
        }
      } 
      else if (order.status === 'paid') {
        if (isSeller) {
          actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px"><button class="btn btn-primary" onclick="doAction(${order.id},'confirm')">Оплата получена</button><button class="btn btn-ghost" style="color:var(--red);" onclick="doAction(${order.id},'dispute')">Спор</button></div>`;
        } else {
          actionsHtml = `<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:8px;font-weight:600;">Ожидайте подтверждения от продавца</div><button class="btn btn-ghost btn-block" style="color:var(--red);" onclick="doAction(${order.id},'dispute')">Открыть спор</button>`;
        }
      } 
      else if (order.status === 'completed') {
        actionsHtml = `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:14px;text-align:center;color:var(--grn);font-size:14px;font-weight:800;margin-bottom:10px">✓ Сделка завершена</div><button class="btn btn-primary btn-block" onclick="openReview(${order.id})" style="margin-bottom:16px;">Оставить отзыв</button>`;
      } 
      else if (order.status === 'cancelled' || order.status === 'declined') {
        actionsHtml = `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;text-align:center;color:var(--red);font-size:14px;margin-bottom:16px;font-weight:800;">Заявка ${order.status === 'declined' ? 'отклонена' : 'отменена'}</div>`;
      } 
      else if (order.status === 'dispute') {
        if (isAdmin) actionsHtml = `<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:14px;margin-bottom:12px;font-weight:800;">Вы админ. Решите спор:</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px"><button class="btn btn-primary" onclick="resolveDispute(${order.id}, 'completed')">Завершить</button><button class="btn btn-ghost" style="color:var(--red)" onclick="resolveDispute(${order.id}, 'cancelled')">Отменить</button></div>`;
        else actionsHtml = `<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:14px;margin-bottom:16px;font-weight:800;">Спор рассматривается администратором</div>`;
      }

      const timelineHtml = (history || []).map(h => `<div style="display:flex;gap:12px;padding:8px 0"><div style="width:13px;height:13px;border-radius:50%;background:var(--txt);flex-shrink:0;margin-top:3px"></div><div style="flex:1"><div style="font-size:13px;font-weight:700">${h.note || h.status}</div><div style="font-size:11px;color:var(--dim);font-weight:600;">${new Date(h.at).toLocaleString('ru-RU')}</div></div></div>`).join('');
      
      const container = document.getElementById('orderDetailContent');
      container.innerHTML = `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
             <div style="font-size:12px;color:var(--dim);font-family:monospace;font-weight:700;">#${order.public_id}</div>
             <div style="background:var(--glass-bg);color:${sc[order.status]};font-size:12px;font-weight:800;padding:4px 10px;border-radius:6px">${order.statusLabel}</div>
          </div>
          <h2 style="font-size:22px;font-weight:900;margin-bottom:8px;color:var(--txt)">${isBuyer ? 'Покупка ' : 'Продажа '}${order.asset}</h2>
          <div style="font-size:36px;font-weight:900;color:var(--txt);font-variant-numeric:tabular-nums;">${fmt(order.amount_rub)}<span style="font-size:16px;color:var(--dim);font-weight:600;margin-left:4px">₽</span></div>
          <div style="width:100%;height:6px;background:var(--glass-border);border-radius:3px;margin-top:20px;overflow:hidden"><div style="height:100%;width:${progress}%;background:${sc[order.status]};transition:0.3s"></div></div>
        </div>
        
        <div class="glass-card" style="padding:16px;margin-bottom:16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="openPublicProfile(${counterparty.id})">
          <div style="display:flex;align-items:center;gap:12px;">
             <div class="avatar" style="width:44px;height:44px;font-size:16px;">${counterparty.avatarUrl ? `<img src="${counterparty.avatarUrl}">` : counterparty.displayName[0].toUpperCase()}</div>
             <div>
               <div style="font-size:12px;color:var(--dim);font-weight:600;">${counterpartyRole}</div>
               <div style="font-size:15px;font-weight:800;">${counterparty.displayName}</div>
             </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="border:1px solid var(--glass-border);">Профиль</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div class="glass-card" style="padding:16px;"><div style="font-size:11px;color:var(--dim);font-weight:700;margin-bottom:4px;">Количество</div><div style="font-size:15px;font-weight:800;">${fmtDec(order.amount_asset, 4)} ${order.asset}</div></div>
          <div class="glass-card" style="padding:16px;"><div style="font-size:11px;color:var(--dim);font-weight:700;margin-bottom:4px;">Курс</div><div style="font-size:15px;font-weight:800;">${fmt(order.price)} ₽</div></div>
        </div>
        
        <div class="glass-card" style="padding:16px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
             <div style="font-size: 11px; font-weight: 800; color: var(--dim); text-transform: uppercase;">Время на оплату</div>
             <div style="font-size: 12px; font-weight: 800; color: var(--yellow);">${order.paymentTime} минут</div>
          </div>
          <div style="font-size: 11px; font-weight: 800; color: var(--dim); text-transform: uppercase; margin-bottom: 8px;">Условия сделки</div>
          <div style="font-size: 13px; color: var(--txt); line-height: 1.5; font-weight: 500;">${terms || 'Стандартные условия сделки.'}</div>
        </div>
        
        ${actionsHtml}
        
        <button style="width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:16px;margin-bottom:16px;color:var(--txt);font-size:14px" onclick="openChatModal(${order.id})">
          <div style="display:flex;align-items:center;gap:12px"><div class="avatar" style="width:40px;height:40px;font-size:18px">💬</div><div style="text-align:left;"><div style="font-weight:800">Чат по сделке</div><div style="font-size:11px;color:var(--dim);font-weight:600;">Обсудить детали</div></div></div>
        </button>
        <div class="glass-card" style="padding:16px"><div style="font-size:12px;font-weight:800;margin-bottom:14px;color:var(--dim);text-transform:uppercase">История</div>${timelineHtml}</div>`;

      if (order.status === 'accepted') {
        const timerEl = document.getElementById('paymentTimerDisplay');
        if (timerEl) {
           const createdAt = new Date(order.createdAt).getTime();
           const limitMs = order.paymentTime * 60000;
           const expiresAt = createdAt + limitMs;
           
           if (window.orderTimerInterval) clearInterval(window.orderTimerInterval);
           
           window.orderTimerInterval = setInterval(() => {
             const now = Date.now();
             const diff = expiresAt - now;
             
             if (diff <= 0) {
               clearInterval(window.orderTimerInterval);
               timerEl.textContent = '00:00';
               timerEl.style.color = 'var(--red)';
             } else {
               const m = Math.floor(diff / 60000).toString().padStart(2, '0');
               const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
               timerEl.textContent = `${m}:${s}`;
             }
           }, 1000);
        }
      } else {
         if (window.orderTimerInterval) clearInterval(window.orderTimerInterval);
      }

      const fileInput = document.getElementById('receiptFile');
      if (fileInput) {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            document.getElementById('fileName').textContent = `✓ Файл прикреплен`;
            toast('Чек успешно прикреплен!', 'success');
          }
        };
      }
    }

    window.doAction = async function(orderId, action) {
      if (action === 'cancel' && !await confirmAsync('Отмена', 'Отменить заявку?', 'Да')) return;
      if (action === 'confirm' && !await confirmAsync('Подтверждение', 'Подтвердить оплату?', 'Да')) return;
      if (action === 'dispute' && !await confirmAsync('Спор', 'Вы уверены, что хотите открыть спор?', 'Да')) return;
      if (action === 'decline' && !await confirmAsync('Отклонение', 'Отклонить заявку?', 'Да')) return;
      
      try { 
        await API.req('POST', `/orders/${orderId}/${action}`); 
        toast('Статус обновлён', 'success'); 
        addNotification(`Статус ордера #${orderId} обновлен`);
        openOrderPage(orderId); 
      }
      catch (e) { toast(e.message, 'error'); }
    };

    window.resolveDispute = async function(orderId, resolution) {
      if (!await confirmAsync('Решение спора', 'Вы уверены в решении?', 'Да')) return;
      try { await API.req('POST', `/orders/${orderId}/resolve`, { resolution }); toast('Спор решен', 'success'); openOrderPage(orderId); }
      catch (e) { toast(e.message, 'error'); }
    };

    // ЧАТ
    let currentChatOrderId = null, chatPollTimer = null;
    window.openChatModal = async function(orderId) {
      currentChatOrderId = orderId;
      const m = document.getElementById('chatModal'); if (m) m.classList.add('active');
      await loadChat(orderId, true);
      if (chatPollTimer) clearInterval(chatPollTimer);
      chatPollTimer = setInterval(() => loadChat(orderId, false), 3000);
    };
    window.closeChatModal = function() {
      const m = document.getElementById('chatModal'); if (m) m.classList.remove('active');
      if (chatPollTimer) clearInterval(chatPollTimer); chatPollTimer = null;
    };

    document.getElementById('chatSend')?.addEventListener('click', async () => {
      const input = document.getElementById('chatInput');
      const text = input?.value.trim();
      if (!text || !currentChatOrderId) return;
      if (input) input.value = '';
      try { await API.req('POST', '/chat/' + currentChatOrderId, { text }); loadChat(currentChatOrderId, false); }
      catch (e) { toast(e.message, 'error'); }
    });
    document.getElementById('chatInput')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('chatSend')?.click(); });

    async function loadChat(orderId, reset = true) {
      try {
        const { items } = await API.req('GET', '/chat/' + orderId);
        const body = document.getElementById('chatBody'); if (!body) return;
        if (reset) body.innerHTML = '<div style="text-align:center;font-size:12px;color:var(--dim);font-weight:600;margin-bottom:10px;">Сделка создана.</div>';
        const rendered = body.querySelectorAll('[data-msg-id]').length;
        items.slice(rendered).forEach(m => {
          const div = document.createElement('div');
          div.className = 'msg' + (m.isMine ? ' me' : '');
          div.dataset.msgId = m.id;
          div.innerHTML = `<div class="avatar" style="width:28px;height:28px;font-size:11px">${m.senderUsername[0].toUpperCase()}</div><div><div class="msg-bubble">${m.text.replace(/</g, '&lt;')}</div><div style="font-size:10px;color:var(--dim);margin-top:4px;font-weight:600; text-align: ${m.isMine ? 'right' : 'left'}">${new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
          body.appendChild(div);
        });
        body.scrollTop = body.scrollHeight;
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
    function updateStars() { document.querySelectorAll('#ratingStars .rating-star').forEach(s => s.classList.toggle('active', +s.dataset.r <= currentRating)); }
    
    document.querySelectorAll('#ratingStars .rating-star').forEach(s => { 
      s.onclick = () => { 
        currentRating = +s.dataset.r; 
        updateStars(); 
        document.querySelectorAll('#ratingStars .rating-star').forEach(el => el.style.color = +el.dataset.r <= currentRating ? '#FFD60A' : 'var(--dim)');
      }; 
    });

    document.getElementById('reviewSubmitBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('reviewSubmitBtn');
      btn.disabled = true;
      try {
        await API.req('POST', '/reviews', { order_id: currentReviewOrderId, rating: currentRating, comment: document.getElementById('reviewComment')?.value || '' });
        toast('Отзыв добавлен!', 'success');
        closeModal('reviewModal'); loadProfile();
      } catch (e) { const er = document.getElementById('reviewError'); if (er) er.textContent = e.message; }
      finally { btn.disabled = false; }
    });

    // ПРОФИЛЬ
    let profileTab = 'ads';
    async function loadProfile() {
      const u = API.user();
      const content = document.getElementById('profileContent');
      if (!content) return;
      if (!u) { content.innerHTML = '<div class="empty-state"><button class="btn btn-primary" onclick="document.getElementById(\'authModal\').classList.add(\'active\')">Войти</button></div>'; return; }
      
      try {
        const { user, stats } = await API.req('GET', '/users/me');
        const proBadge = stats.isPro ? `<span class="badge-pro">PRO</span>` : '';
        const merchantBadge = stats.isMerchant ? `<span class="badge-merchant" style="width:20px;height:20px;font-size:12px;margin-left:6px;" title="Мерчант">✓</span>` : '';
        
        const successRateStr = stats.successRate !== null ? `${stats.successRate}%` : '—';
        const ratingAvgStr = stats.ratingAvg !== null ? stats.ratingAvg : '—';
        const proConditions = stats.isPro ? `<div style="font-size:11px; color:var(--grn); margin-top:8px; font-weight:600;">✓ Условия PRO выполнены</div>` : `<div style="font-size:11px; color:var(--dim); margin-top:8px;">До PRO: Оборот $${fmt(stats.volumeUsd)} / $100,000<br>Успешных: ${successRateStr} / 80%</div>`;

        let contentHtml = '';
        if (profileTab === 'ads') contentHtml = '<div id="myAdsList"><div class="empty-state">Загрузка...</div></div>';
        else if (profileTab === 'history') contentHtml = '<div id="myHistoryList"><div class="empty-state">Загрузка...</div></div>';
        else if (profileTab === 'reviews') contentHtml = '<div id="myReviewsList"><div class="empty-state">Загрузка...</div></div>';
        
        let avatarHtml = `<div class="avatar lg">${user.displayName[0].toUpperCase()}</div>`;
        if (user.avatarUrl) avatarHtml = `<div class="avatar lg"><img src="${user.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${user.displayName[0].toUpperCase()}'"></div>`;

        content.innerHTML = `
          <div class="glass-card" style="display:flex;align-items:center;gap:16px;padding:20px;margin-bottom:20px;position:relative;">
            ${avatarHtml}
            <div style="flex:1;min-width:0">
              <h2 style="font-size:20px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;">${user.displayName} ${merchantBadge} ${proBadge}</h2>
              <div style="font-size:12px;color:var(--dim);font-weight:600;">@${user.username}</div>
              ${proConditions}
            </div>
            <button class="btn btn-ghost btn-sm" style="position:absolute;top:16px;right:16px;font-size:18px;" onclick="openSettings()">⚙️</button>
          </div>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Сделок</div>
              <div style="font-size:18px;font-weight:800;">${stats.dealsTotal}</div>
            </div>
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Успешных</div>
              <div style="font-size:18px;font-weight:800;">${successRateStr}</div>
            </div>
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Отзывов</div>
              <div style="font-size:18px;font-weight:800;">${stats.reviewsCount}</div>
            </div>
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Рейтинг</div>
              <div style="font-size:18px;font-weight:800;">${ratingAvgStr}</div>
            </div>
          </div>
          
          <div class="profile-tabs">
            <button class="profile-tab ${profileTab === 'ads' ? 'active' : ''}" onclick="switchProfileTab('ads')">Объявления</button>
            <button class="profile-tab ${profileTab === 'history' ? 'active' : ''}" onclick="switchProfileTab('history')">История</button>
            <button class="profile-tab ${profileTab === 'reviews' ? 'active' : ''}" onclick="switchProfileTab('reviews')">Отзывы</button>
          </div>
          <div id="profileTabContent">${contentHtml}</div>
          <div style="margin-top:24px"><button class="btn btn-ghost btn-block" onclick="logoutAction()" style="color:var(--red);border:1px solid rgba(239,68,68,.3);">Выйти из аккаунта</button></div>`;

        if (profileTab === 'ads') loadMyAds();
        else if (profileTab === 'history') loadMyHistory();
        else if (profileTab === 'reviews') loadMyReviews();
      } catch (e) { content.innerHTML = '<div class="empty-state">Ошибка загрузки профиля</div>'; }
    }
    window.switchProfileTab = function(tab) { profileTab = tab; loadProfile(); };

    async function loadMyAds() {
      const list = document.getElementById('myAdsList'); if (!list) return;
      try {
        const { items } = await API.req('GET', '/ads/my');
        list.innerHTML = items.length ? items.map(ad => `<div class="glass-card" style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><strong style="font-size:16px;">${ad.side === 'sell' ? 'Продажа' : 'Покупка'} ${ad.asset}</strong><span style="color:${ad.active ? 'var(--grn)' : 'var(--red)'};font-size:12px;font-weight:700;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;">${ad.active ? 'Активно' : 'Неактивно'}</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><div style="font-size:11px;color:var(--dim);font-weight:600;">Курс</div><div style="font-size:15px;font-weight:800;">${fmt(ad.price)} ₽</div></div><div><div style="font-size:11px;color:var(--dim);font-weight:600;">Остаток</div><div style="font-size:15px;font-weight:800;">${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div></div></div></div>`).join('') : '<div class="empty-state">У вас нет объявлений</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки объявлений</div>'; }
    }

    async function loadMyHistory() {
      const list = document.getElementById('myHistoryList'); if (!list) return;
      try {
        const { items } = await API.req('GET', '/orders/my?status=completed');
        list.innerHTML = items.length ? items.map(o => `<div class="glass-card" style="margin-bottom:12px; border-left:4px solid var(--grn);"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><strong style="font-size:15px;">#${o.publicId}</strong><span style="color:var(--grn);font-size:12px;font-weight:700;">Завершен</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><div style="font-size:11px;color:var(--dim);font-weight:600;">Сумма</div><div style="font-size:15px;font-weight:800;">${fmt(o.amountRub)} ₽</div></div><div><div style="font-size:11px;color:var(--dim);font-weight:600;">Актив</div><div style="font-size:15px;font-weight:800;">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div></div></div>`).join('') : '<div class="empty-state">История пуста</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    async function loadMyReviews() {
      const list = document.getElementById('myReviewsList'); if (!list) return;
      try {
        const u = API.user();
        const data = await API.req('GET', '/reviews/user/' + u.id);
        const items = data.items || [];
        list.innerHTML = items.length ? items.map(r => `<div class="glass-card" style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong style="font-size:14px;">${r.author}</strong><span style="color:var(--yellow);font-size:16px;">${'★'.repeat(r.rating)}</span></div><p style="font-size:13px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p></div>`).join('') : '<div class="empty-state">Отзывов нет</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    // НАСТРОЙКИ
    window.openSettings = function() {
      const u = API.user(); if (!u) return;
      document.getElementById('settingsAvatarUrl').value = u.avatarUrl || '';
      document.getElementById('settingsName').value = u.displayName || '';
      document.getElementById('settingsEmail').value = u.email;
      document.getElementById('settingsCurrentPass').value = '';
      document.getElementById('settingsNewPass').value = '';
      document.getElementById('settingsError').textContent = '';
      document.getElementById('settingsModal').classList.add('active');
    };

    document.getElementById('settingsSaveBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('settingsSaveBtn'); btn.disabled = true; btn.textContent = 'Сохранение...';
      try {
        const payload = {
          displayName: document.getElementById('settingsName').value,
          avatarUrl: document.getElementById('settingsAvatarUrl').value,
          email: document.getElementById('settingsEmail').value
        };
        const curPass = document.getElementById('settingsCurrentPass').value;
        const newPass = document.getElementById('settingsNewPass').value;
        if (newPass) {
           if (!curPass) throw new Error('Введите текущий пароль для смены');
           payload.currentPassword = curPass;
           payload.password = newPass;
        }
        const { user } = await API.req('PATCH', '/users/me', payload);
        localStorage.setItem('vexo_user', JSON.stringify(user));
        closeModal('settingsModal'); 
        toast('Настройки сохранены', 'success'); 
        addNotification('Вы обновили настройки профиля.');
        updateAuthUI(); loadProfile();
      } catch (e) {
        const er = document.getElementById('settingsError');
        if (er) er.textContent = e.message === 'wrong_password' ? 'Неверный текущий пароль' : e.message;
      } finally { btn.disabled = false; btn.textContent = 'Сохранить'; }
    });

    // ОРДЕР МОДАЛКА (С ТАЙМЕРОМ НА ЦЕНУ)
    let currentAd = null, selectedPay = null, priceTimerInterval = null;
    window.openOrderModal = function(adId) {
      const ad = (window._ads || {})[adId];
      if (!ad) return;
      currentAd = ad; selectedPay = ad.paymentMethods?.[0] || null;
      const isBuy = ad.side === 'sell';
      
      const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
      
      setText('orderTitle', (isBuy ? 'Покупка ' : 'Продажа ') + ad.asset);
      setText('orderUsername', ad.displayName);
      setText('orderUserMeta', (ad.faceType === 'first' ? '1-е лицо' : '3-е лицо') + ' · ★ ' + (ad.ratingAvg || '—'));
      setText('orderRate', fmt(ad.price) + ' ₽');
      setText('orderAvailable', fmtDec(ad.amountLeft, 2) + ' ' + ad.asset);
      setText('orderLimit', `Лимит: ${fmt(ad.minRub)} - ${fmt(ad.maxRub)} ₽`);
      setText('orderResultLabel', isBuy ? 'Вы получите' : 'Вы отдадите');
      setText('orderResult', '0 ' + ad.asset);
      setText('orderTotalBottom', '0 RUB');
      setText('orderTerms', ad.terms || 'Стандартные условия сделки.');
      setText('orderTimeLimit', `⏱ ${ad.paymentTime || 30}мин.`);
      setText('orderError', '');

      const amountInput = document.getElementById('orderAmount');
      if (amountInput) {
        amountInput.value = '';
        amountInput.oninput = e => {
          const rub = parseFloat(e.target.value) || 0;
          setText('orderResult', fmtDec(rub / ad.price, 4) + ' ' + ad.asset);
          setText('orderTotalBottom', fmt(rub) + ' RUB');
          const errEl = document.getElementById('orderError');
          const btn = document.getElementById('orderSubmit');
          if (rub > 0 && (rub < ad.minRub || rub > ad.maxRub)) {
             if (errEl) errEl.textContent = `Сумма должна быть от ${fmt(ad.minRub)} до ${fmt(ad.maxRub)} ₽`;
             if (btn) { btn.style.opacity = '0.5'; btn.disabled = true; }
          } else {
             if (errEl) errEl.textContent = '';
             if (btn) { btn.style.opacity = '1'; btn.disabled = false; }
          }
        };
      }
      
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
      btn.className = 'btn ' + (isBuy ? 'btn-buy' : 'btn-sell');
      btn.textContent = isBuy ? 'Купить' : 'Продать';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.onclick = submitOrder;
      
      // ТАЙМЕР НА ЦЕНУ (60 СЕКУНД)
      let timeLeft = 60;
      const timerEl = document.getElementById('priceTimer');
      if (timerEl) timerEl.textContent = timeLeft + 's';

      if (priceTimerInterval) clearInterval(priceTimerInterval);
      
      priceTimerInterval = setInterval(async () => {
        timeLeft--;
        if (timerEl) timerEl.textContent = timeLeft + 's';

        if (timeLeft <= 0) {
          clearInterval(priceTimerInterval);
          if (timerEl) timerEl.textContent = 'Обновление...';
          try {
            const freshAd = await API.req('GET', '/ads/' + ad.id);
            if (freshAd.price !== ad.price) {
              currentAd = freshAd; 
              window._ads[ad.id] = freshAd;
              ad.price = freshAd.price;
              setText('orderRate', fmt(ad.price) + ' ₽');
              toast('Внимание! Мейкер изменил курс. Цена обновлена.', 'error');
              if (amountInput.value) amountInput.dispatchEvent(new Event('input'));
            }
          } catch(e) { console.log('Ошибка обновления цены', e); }
          timeLeft = 60;
          if (timerEl) timerEl.textContent = timeLeft + 's';
        }
      }, 1000);

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
        closeModal('orderModal'); 
        toast('Заявка создана! Ожидайте подтверждения.', 'success'); 
        addNotification(`Создана новая заявка #${order.publicId}`);
        openOrderPage(order.id);
      } catch (err) { if (errEl) errEl.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = currentAd ? (currentAd.side === 'sell' ? 'Купить' : 'Продать') : 'OK'; }
    }

    window.logoutAction = async function() {
      if (await confirmAsync('Выход', 'Выйти из аккаунта?', 'Выйти')) { localStorage.removeItem('vexo_token'); localStorage.removeItem('vexo_user'); location.reload(); }
    };

    document.getElementById('walletActionSubmit')?.addEventListener('click', () => {
      if (!API.user()) { closeModal('walletActionModal'); document.getElementById('authModal')?.classList.add('active'); return; }
      const amount = document.getElementById('walletActionAmount')?.value;
      if (!amount || Number(amount) <= 0) return toast('Введите корректную сумму', 'error');
      window.open(`https://t.me/vexoio_bot?start=${walletActionType === 'deposit' ? 'dep' : 'wth'}_${amount}`, '_blank');
      closeModal('walletActionModal'); toast('Перенаправление в Telegram...', 'success');
    });

    // СТАРТ
    updateAuthUI();
    updateNotifUI();
    try { loadHome(); } catch(e) { console.error('Initial loadHome:', e); }

  } catch (err) {
    console.error('VEXO: КРИТИЧЕСКАЯ ОШИБКА', err);
  }
});