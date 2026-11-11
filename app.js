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
        const existing = Array.from(c.children).find(el => el.textContent === msg);
        if (existing) return;
        if (c.children.length >= 2) c.removeChild(c.firstElementChild);
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
        content.innerHTML = `<h3 style="font-size:18px;font-weight:800;color:var(--txt)">${title}</h3><p style="font-size:14px;color:var(--dim);margin:10px 0;font-weight:500;">${message}</p><div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-ghost" style="flex:1;border:1px solid var(--glass-border);" id="dlgCancel">Отмена</button><button class="btn btn-primary" style="flex:1;" id="dlgOk">${okText}</button></div>`;
        overlay.classList.add('active');
        document.getElementById('dlgCancel').onclick = () => { overlay.classList.remove('active'); resolve(false); };
        document.getElementById('dlgOk').onclick = () => { overlay.classList.remove('active'); resolve(true); };
      });
    }

    function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }
    window.closeModal = closeModal;

    // --- ИНИЦИАЛИЗАЦИЯ ЭКРАНА ОБМЕНА ---
    function initExchange() {
      if (document.getElementById('screen-exchange').dataset.init) return;
      document.getElementById('screen-exchange').dataset.init = 'true';
      
      const nav = document.querySelector('.bottom-nav');
      if (nav && !document.querySelector('[data-screen="exchange"]')) {
        const createBtn = nav.querySelector('[data-screen="create"]');
        const exBtn = document.createElement('button');
        exBtn.className = 'bn-btn';
        exBtn.dataset.screen = 'exchange';
        exBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg><span>Обмен</span>`;
        if (createBtn) nav.insertBefore(exBtn, createBtn);
        else nav.appendChild(exBtn);
        exBtn.onclick = (e) => { e.preventDefault(); show('exchange'); };
      }

      const div = document.getElementById('screen-exchange');
      div.innerHTML = `
        <div class="glass-card" style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 class="section-title" style="margin:0;">Обмен</h2>
                <span id="exMarketStatus" style="font-size: 10px; color: var(--dim); background: var(--glass-bg); padding: 4px 8px; border-radius: 6px;">Загрузка...</span>
            </div>
            
            <div class="trade-tabs" style="margin-bottom: 16px;">
                <button class="trade-tab active" id="exTabBuy">Купить USDT</button>
                <button class="trade-tab" id="exTabSell">Продать USDT</button>
            </div>
            
            <div class="form-group">
                <label class="label" id="exInputLabel">Сумма в RUB</label>
                <input type="number" id="exAmount" class="input" style="font-size: 24px; font-weight: 800;" placeholder="0">
            </div>
            
            <div style="background: rgba(0,0,0,0.2); border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid var(--glass-border);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 13px; color: var(--dim);">Курс обмена:</span>
                    <span id="exRateDisplay" style="font-size: 13px; font-weight: 700; color: var(--txt);">-- ₽</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="font-size: 13px; color: var(--dim);">Вы получите:</span>
                    <span id="exResultDisplay" style="font-size: 14px; font-weight: 800; color: var(--grn);">0 USDT</span>
                </div>
            </div>

            <button class="btn btn-primary btn-block" id="exSubmitBtn" style="padding: 16px;">Обменять</button>
        </div>
      `;

      let exMode = 'buy'; 
      let basePrice = 90; 
      let isPriceLoaded = false;

      async function fetchRealMarketRate() {
        const statusEl = document.getElementById('exMarketStatus');
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub');
            const data = await res.json();
            if (data && data.tether && data.tether.rub) {
                basePrice = data.tether.rub;
                isPriceLoaded = true;
                if (statusEl) { statusEl.textContent = 'Курс актуален'; statusEl.style.color = 'var(--grn)'; }
            }
        } catch (e) {
            basePrice = 92.50; 
            isPriceLoaded = true;
            if (statusEl) { statusEl.textContent = 'Резервный курс'; statusEl.style.color = 'var(--yellow)'; }
        }
        updateExchangeUI();
      }

      fetchRealMarketRate();
      setInterval(fetchRealMarketRate, 300000);

      const updateExchangeUI = () => {
          const input = document.getElementById('exAmount');
          const amount = parseFloat(input.value) || 0;
          let rate = 0, result = 0;

          if (exMode === 'buy') {
              rate = basePrice * 1.03; 
              result = amount / rate; 
              document.getElementById('exInputLabel').textContent = 'Сумма в RUB';
              document.getElementById('exResultDisplay').textContent = `${fmtDec(result, 4)} USDT`;
              document.getElementById('exSubmitBtn').style.background = 'var(--grn)';
              document.getElementById('exSubmitBtn').textContent = 'Купить USDT';
          } else {
              rate = basePrice * 0.97; 
              result = amount * rate; 
              document.getElementById('exInputLabel').textContent = 'Сумма в USDT';
              document.getElementById('exResultDisplay').textContent = `${fmt(result)} RUB`;
              document.getElementById('exSubmitBtn').style.background = 'var(--red)';
              document.getElementById('exSubmitBtn').textContent = 'Продать USDT';
          }
          document.getElementById('exRateDisplay').textContent = `1 USDT = ${fmtDec(rate, 2)} ₽`;
      };

      document.getElementById('exTabBuy').onclick = () => {
          exMode = 'buy';
          document.getElementById('exTabBuy').classList.add('active');
          document.getElementById('exTabSell').classList.remove('active');
          document.getElementById('exAmount').value = '';
          updateExchangeUI();
      };

      document.getElementById('exTabSell').onclick = () => {
          exMode = 'sell';
          document.getElementById('exTabSell').classList.add('active');
          document.getElementById('exTabBuy').classList.remove('active');
          document.getElementById('exAmount').value = '';
          updateExchangeUI();
      };

      document.getElementById('exAmount').oninput = updateExchangeUI;

      document.getElementById('exSubmitBtn').onclick = async () => {
          if (!isPriceLoaded) return toast('Загрузка курса...', 'info');
          const amount = parseFloat(document.getElementById('exAmount').value);
          if (!amount || amount <= 0) return toast('Введите сумму', 'error');
          if (!API.user()) { document.getElementById('authModal').classList.add('active'); return; }
          
          const btn = document.getElementById('exSubmitBtn');
          btn.disabled = true; btn.textContent = 'Обработка...';
          try {
              const finalRate = exMode === 'buy' ? basePrice * 1.03 : basePrice * 0.97;
              await API.req('POST', '/exchange', { type: exMode, amount: amount, rate: finalRate });
              toast('Заявка создана! Ожидайте.', 'success');
              document.getElementById('exAmount').value = '';
              updateExchangeUI();
          } catch(e) {
              toast(e.message || 'Ошибка', 'error');
          } finally {
              btn.disabled = false;
              updateExchangeUI();
          }
      };
      
      updateExchangeUI();
    }

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
    notifications = notifications.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);

    function addNotification(text) {
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
            <div style="font-size:13px;font-weight:600;color:var(--txt);">${n.text}</div>
          </div>
        `).join('') : '<div class="empty-state">Нет уведомлений</div>';
      }
    }

    document.getElementById('notifBtn')?.addEventListener('click', () => {
      document.getElementById('notificationsModal').classList.add('active');
      updateNotifUI();
    });

    // --- НАВИГАЦИЯ ---
    let previousScreen = 'home';

    function show(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const target = document.getElementById('screen-' + name);
      if (target) target.classList.add('active');
      
      document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-screen="${name}"]`).forEach(b => b.classList.add('active'));
      
      const backBtn = document.getElementById('backBtn');
      if (backBtn) backBtn.classList.toggle('hidden', !['order', 'admin'].includes(name));
      
      try {
        if (name === 'market') loadMarket();
        if (name === 'orders') loadOrders('active');
        if (name === 'profile') loadProfile();
        if (name === 'home') loadHome();
        if (name === 'wallet') loadWallet();
        if (name === 'admin') loadAdmin();
      } catch(e) { console.error('show error:', e); }
      
      window.scrollTo(0, 0);
    }

    document.querySelectorAll('[data-screen]').forEach(b => {
      b.onclick = e => {
        e.preventDefault();
        const s = b.dataset.screen;
        if (!['order', 'admin'].includes(s)) previousScreen = s;
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
        toast(authMode === 'login' ? 'С возвращением!' : 'Аккаунт создан!', 'success');
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
      const isStaff = u && ['admin', 'owner', 'deputy'].includes(u.role);

      if (u) {
        if (lb) lb.classList.add('hidden');
        if (ab) { ab.classList.remove('hidden'); ab.innerHTML = (u.displayName || u.username || '?')[0].toUpperCase(); }
        if (isStaff) document.getElementById('adminBnBtn').classList.remove('hidden');
        else document.getElementById('adminBnBtn').classList.add('hidden');
      } else {
        if (lb) lb.classList.remove('hidden');
        if (ab) ab.classList.add('hidden');
        document.getElementById('adminBnBtn').classList.add('hidden');
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
          <div class="wallet-hero glass-card">
            <div class="lbl">Общий баланс</div>
            <div class="amount">${fmt(u.balanceRub)} <span>₽</span></div>
            <div class="wallet-actions">
              <button class="btn btn-primary" id="btnDeposit" style="flex:1;">Пополнить</button>
              <button class="btn btn-ghost" id="btnWithdraw" style="flex:1; border: 1px solid var(--glass-border);">Вывести</button>
            </div>
          </div>
          <h3 class="section-title">Активы</h3>
          <div class="wallet-list">
            <div class="glass-card" style="padding: 16px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="font-size:24px; font-weight:800;">₽</div>
                    <div><div style="font-weight:700;">Российский рубль</div><div style="font-size:11px;color:var(--dim);">RUB · фиат</div></div>
                </div>
                <div style="font-weight:800;">${fmt(u.balanceRub)} ₽</div>
            </div>
            <div class="glass-card" style="padding: 16px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="font-size:24px; font-weight:800; color:#26A17B;">₮</div>
                    <div><div style="font-weight:700;">Tether</div><div style="font-size:11px;color:var(--dim);">USDT · TRC-20</div></div>
                </div>
                <div style="font-weight:800;">${fmtDec(u.balanceUsdt, 2)} <span style="font-size:10px;color:var(--dim);">≈ 0 ₽</span></div>
            </div>
          </div>`;
        document.getElementById('btnDeposit').onclick = () => { walletActionType = 'deposit'; document.getElementById('walletActionTitle').textContent = 'Пополнение'; document.getElementById('walletRequisitesField').classList.add('hidden'); document.getElementById('walletActionModal').classList.add('active'); };
        document.getElementById('btnWithdraw').onclick = () => { walletActionType = 'withdraw'; document.getElementById('walletActionTitle').textContent = 'Вывод'; document.getElementById('walletRequisitesField').classList.remove('hidden'); document.getElementById('walletActionModal').classList.add('active'); };
      }
    }

    // МАРКЕТ
    function getActiveFilters() {
      const filters = {};
      const activeTab = document.querySelector('#marketSideTabs .trade-tab.active');
      if (activeTab && activeTab.dataset.side) filters.side = activeTab.dataset.side === 'buy' ? 'sell' : 'buy';
      
      const faceChip = document.querySelector('#filterModal #filterFace .chip.active'); 
      if (faceChip && faceChip.dataset.val) filters.face_type = faceChip.dataset.val;
      
      const assetChip = document.querySelector('#filterModal #filterAsset .icon-chip.active'); 
      if (assetChip && assetChip.dataset.val !== 'all') filters.asset = assetChip.dataset.val;
      
      const payChip = document.querySelector('#filterModal #filterPayment .icon-chip.active'); 
      if (payChip && payChip.dataset.val !== 'all') filters.payment = payChip.dataset.val;
      
      const fMin = document.getElementById('filterMinAmount')?.value;
      const fMax = document.getElementById('filterMaxAmount')?.value;
      if (fMin) filters.min_amount = fMin;
      if (fMax) filters.max_amount = fMax;

      return filters;
    }

    async function loadMarket() {
      const list = document.getElementById('adsList');
      if (!list) return;
      
      const filters = getActiveFilters();
      list.innerHTML = '<div class="empty-state">Загрузка...</div>';

      try {
        const { items } = await API.req('GET', '/ads?' + new URLSearchParams(filters));
        list.innerHTML = items.length ? items.map(renderAd).join('') : '<div class="empty-state">Объявлений не найдено</div>';
        bindAdButtons();
      } catch (e) { 
        list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; 
      }
    }

    document.getElementById('openFilterBtn')?.addEventListener('click', () => {
      document.getElementById('filterModal').classList.add('active');
    });

    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
      closeModal('filterModal');
      loadMarket();
    });

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        document.getElementById('filterMinAmount').value = '';
        document.getElementById('filterMaxAmount').value = '';
        document.querySelectorAll('#filterModal .chip, #filterModal .icon-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('#filterModal #filterFace .chip[data-val=""]')?.classList.add('active');
        document.querySelector('#filterModal #filterAsset .icon-chip[data-val="all"]')?.classList.add('active');
        document.querySelector('#filterModal #filterPayment .icon-chip[data-val="all"]')?.classList.add('active');
    });

    document.querySelectorAll('#marketSideTabs .trade-tab').forEach(c => c.onclick = () => { 
        document.querySelectorAll('#marketSideTabs .trade-tab').forEach(x => x.classList.remove('active')); 
        c.classList.add('active'); 
        loadMarket(); 
    });

    document.querySelectorAll('#filterModal .chip').forEach(c => c.onclick = () => { 
        document.querySelectorAll('#filterModal .chip').forEach(x => x.classList.remove('active')); 
        c.classList.add('active'); 
    });
    document.querySelectorAll('#filterModal .icon-chip').forEach(c => c.onclick = () => { 
        document.querySelectorAll('#filterModal .icon-chip').forEach(x => x.classList.remove('active')); 
        c.classList.add('active'); 
    });

    function renderAd(ad) {
      const isSell = ad.side === 'sell';
      const faceLabel = ad.faceType === 'first' ? '1-е лицо' : '3-е лицо';
      window._ads = window._ads || {}; window._ads[ad.id] = ad;
      const pays = (ad.paymentMethods || []).map(p => `<span class="pay-tag" style="font-size:10px;background:rgba(0,0,0,0.2);padding:4px 8px;border-radius:6px;border:1px solid var(--glass-border);">${p}</span>`).join('');
      
      let avatarHtml = `<div class="avatar">${ad.displayName[0].toUpperCase()}</div>`;
      if (ad.avatarUrl) avatarHtml = `<div class="avatar"><img src="${ad.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${ad.displayName[0].toUpperCase()}'"></div>`;
      
      const merchantBadge = ad.isMerchant ? `<span class="badge-merchant">MERCHANT</span>` : '';
      const makerBadge = ad.isMaker ? `<span class="badge-maker">MAKER</span>` : '';

      return `<div class="ad-card glass-card">
        <div class="ad-head" onclick="openPublicProfile(${ad.userId})">
          ${avatarHtml}
          <div class="ad-user">
            <div class="ad-name">
                ${ad.displayName} ${merchantBadge} ${makerBadge} 
                <span class="badge-face">${faceLabel}</span> 
                ${ad.isPro ? '<span class="badge-pro">PRO</span>' : ''}
            </div>
            <div class="ad-meta"><span>★ ${ad.ratingAvg || '—'}</span> <span>${ad.dealsCompleted || 0} сделок</span></div>
          </div>
        </div>
        <div class="ad-body">
          <div class="ad-price-block">
             <div class="ad-price">${fmt(ad.price)} ₽</div>
             <div class="ad-limits">Лимит: ${fmt(ad.minRub)} - ${fmt(ad.maxRub)} RUB</div>
             <div class="ad-amount">Доступно: ${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div>
             ${pays ? `<div class="ad-pay-methods" style="margin-top:10px;display:flex;gap:6px;">${pays}</div>` : ''}
          </div>
          <div class="ad-action">
             <button class="btn ${isSell ? 'btn-buy' : 'btn-sell'} btn-sm" data-ad-id="${ad.id}" style="min-width:110px;">${isSell ? 'Купить' : 'Продать'}</button>
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

    window.openPublicProfile = async function(userId) {
      const m = document.getElementById('publicProfileModal'); const c = document.getElementById('publicProfileContent');
      if (!m || !c) return; c.innerHTML = '<div class="empty-state">Загрузка...</div>'; m.classList.add('active');
      try {
        const { user, stats, isFavorite } = await API.req('GET', '/users/' + userId);
        let avatarHtml = `<div class="avatar lg" style="margin:0 auto 10px;">${user.displayName[0].toUpperCase()}</div>`;
        if (user.avatarUrl) avatarHtml = `<div class="avatar lg" style="margin:0 auto 10px;"><img src="${user.avatarUrl}"></div>`;
        let favBtn = '';
        if (API.user() && API.user().id !== user.id) favBtn = `<button class="btn-fav ${isFavorite ? 'active' : ''}" onclick="toggleFavorite(${user.id}, this)" style="position:absolute;top:20px;right:20px;font-size:24px;background:none;border:none;">${isFavorite ? '❤️' : '🤍'}</button>`;
        
        c.innerHTML = `
          ${favBtn}
          <div style="text-align:center; margin-bottom: 24px; margin-top:10px;">
            ${avatarHtml}
            <h2 style="font-size:22px;font-weight:800;margin-bottom:4px;color:var(--txt);">${user.displayName}</h2>
            <div style="font-size:13px;color:var(--dim);font-weight:600;">@${user.username}</div>
          </div>
          <div class="stats" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="glass-card" style="padding:16px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Сделок</div><div style="font-size:20px;font-weight:800;color:var(--txt);">${stats.dealsTotal}</div></div>
            <div class="glass-card" style="padding:16px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Успешных</div><div style="font-size:20px;font-weight:800;color:var(--txt);">${stats.successRate !== null ? stats.successRate + '%' : '—'}</div></div>
            <div class="glass-card" style="padding:16px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Отзывов</div><div style="font-size:20px;font-weight:800;color:var(--txt);">${stats.reviewsCount}</div></div>
            <div class="glass-card" style="padding:16px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Рейтинг</div><div style="font-size:20px;font-weight:800;color:var(--txt);">${stats.ratingAvg || '—'}</div></div>
          </div>
          <div id="publicReviewsList" style="margin-top:20px;">Загрузка...</div>`;
        loadPublicReviews(user.id);
      } catch(e) { c.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    };

    window.toggleFavorite = async function(targetId, btnEl) {
      if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; }
      try {
        const res = await API.req('POST', '/users/' + targetId + '/favorite');
        if (res.isFavorite) { btnEl.innerHTML = '❤️'; toast('В избранном', 'success'); }
        else { btnEl.innerHTML = '🤍'; toast('Удалено', 'info'); }
      } catch(e) { toast('Ошибка', 'error'); }
    };

    async function loadPublicReviews(userId) {
      const list = document.getElementById('publicReviewsList'); if (!list) return;
      try {
        const data = await API.req('GET', '/reviews/user/' + userId);
        const items = data.items || [];
        list.innerHTML = `<div class="section-title" style="font-size:14px; margin-bottom:12px;">Отзывы</div>` + 
          (items.length ? items.map(r => `<div class="glass-card" style="padding:14px;margin-bottom:8px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong style="font-size:13px;color:var(--txt);">${r.author}</strong><span style="color:var(--yellow);font-size:14px;">${'★'.repeat(r.rating)}</span></div><p style="font-size:13px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p></div>`).join('') : '<div class="empty-state" style="padding:20px 0;">Отзывов нет</div>');
      } catch(e) { list.innerHTML = ''; }
    }

    // СОЗДАНИЕ
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
          face_type: document.querySelector('#f-face .seg-btn.active')?.dataset.val || 'first',
          asset: asset, price: price, amount_total: amount,
          min_rub: min, max_rub: max,
          payment_methods: payments, terms: document.getElementById('f-terms')?.value || '',
          payment_time: Number(payment_time)
        });
        toast('Объявление создано!', 'success');
        show('market');
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      } finally { btn.disabled = false; btn.textContent = 'Опубликовать'; }
    });

    // ОРДЕРА
    async function loadOrders(filter) {
      const list = document.getElementById('ordersList'); if (!list) return;
      if (!API.user()) { list.innerHTML = '<div class="empty-state">Войдите</div>'; return; }
      try {
        const { items } = await API.req('GET', '/orders/my?status=' + filter);
        const sc = { pending: 'var(--yellow)', accepted: 'var(--blue)', paid: 'var(--grn)', completed: 'var(--grn)', cancelled: 'var(--red)', declined: 'var(--red)', dispute: 'var(--gold)' };
        list.innerHTML = items.length ? items.map(o => `
          <div class="ad-card glass-card" style="cursor:pointer;border-left:4px solid ${sc[o.status] || 'var(--dim)'};" data-order-id="${o.id}">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px">
              <strong style="font-family:monospace;font-size:16px;color:var(--txt);">#${o.publicId}</strong>
              <span style="color:${sc[o.status] || 'var(--txt)'};font-size:12px;font-weight:800">${o.statusLabel}</span>
            </div>
            <div class="ad-body">
              <div><div style="font-size:11px; color:var(--dim); font-weight:600;">Сумма</div><div style="font-size:16px; font-weight:800; color:var(--txt);">${fmt(o.amountRub)} ₽</div></div>
              <div><div style="font-size:11px; color:var(--dim); font-weight:600;">Актив</div><div style="font-size:16px; font-weight:800; color:var(--txt);">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
            </div>
            <div style="font-size:12px;color:var(--dim);display:flex;justify-content:space-between;font-weight:600;margin-top:16px; border-top: 1px solid var(--glass-border); padding-top: 12px;">
              <span>${new Date(o.createdAt).toLocaleString('ru-RU')}</span>
              <span>${o.buyer.displayName} ↔ ${o.seller.displayName}</span>
            </div>
          </div>`).join('') : '<div class="empty-state">Нет ордеров</div>';
        list.querySelectorAll('[data-order-id]').forEach(el => { el.onclick = () => openOrderPage(+el.dataset.orderId); });
      } catch(e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    document.querySelectorAll('#ordersFilter .tab').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#ordersFilter .tab').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        loadOrders(c.dataset.val);
      };
    });

    window.openAdminOrder = function(orderId) { previousScreen = 'admin'; openOrderPage(orderId); };

    async function openOrderPage(orderId) {
      if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; }
      if (previousScreen !== 'admin') previousScreen = 'orders'; 
      show('order');
      const container = document.getElementById('orderDetailContent'); if (!container) return;
      container.innerHTML = '<div class="empty-state">Загрузка...</div>';
      try {
        const { order, history, terms } = await API.req('GET', '/orders/' + orderId);
        renderOrderPage(order, history, terms);
      } catch (e) { container.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    function renderOrderPage(order, history, terms) {
      const u = API.user(), isBuyer = order.buyer_id === u.id, isSeller = order.seller_id === u.id;
      const isStaff = ['admin', 'owner', 'deputy'].includes(u.role);
      
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
          actionsHtml = `<div class="grid-2-col" style="margin-bottom:8px"><button class="btn btn-primary" onclick="doAction(${order.id},'accept')" style="background:var(--grn);border:none;">Принять</button><button class="btn btn-ghost" style="color:var(--red);border:1px solid var(--red);" onclick="doAction(${order.id},'decline')">Отклонить</button></div>`;
        } else {
          actionsHtml = `<div style="background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:8px;font-weight:600;">Ожидайте подтверждения</div><button class="btn btn-ghost btn-block" style="color:var(--red);border:1px solid var(--glass-border);" onclick="doAction(${order.id},'cancel')">Отменить</button>`;
        }
      } else if (order.status === 'accepted') {
        if (isBuyer) {
          actionsHtml = `<div style="background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
            <div style="font-size:12px;color:var(--dim);margin-bottom:8px;">Время на оплату:</div>
            <div id="paymentTimerDisplay" style="font-size:28px;font-weight:900;color:var(--yellow);margin-bottom:16px;">--:--</div>
            <button class="btn btn-primary btn-block" onclick="doAction(${order.id},'paid')" style="margin-bottom:8px;">Я оплатил</button>
            <button class="btn btn-ghost btn-block" style="color:var(--red);border:1px solid var(--glass-border);" onclick="doAction(${order.id},'cancel')">Отменить</button>
          </div>`;
        } else {
          actionsHtml = `<div style="background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:8px;font-weight:600;">Ожидайте оплаты</div><button class="btn btn-ghost btn-block" style="color:var(--gold);border:1px solid var(--glass-border);" onclick="doAction(${order.id},'dispute')">Открыть спор</button>`;
        }
      } else if (order.status === 'paid') {
        if (isSeller) {
          actionsHtml = `<div class="grid-2-col" style="margin-bottom:8px"><button class="btn btn-primary" onclick="doAction(${order.id},'confirm')">Оплата получена</button><button class="btn btn-ghost" style="color:var(--red);border:1px solid var(--glass-border);" onclick="doAction(${order.id},'dispute')">Спор</button></div>`;
        } else {
          actionsHtml = `<div style="background:rgba(0,0,0,0.2);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:13px;margin-bottom:8px;font-weight:600;">Ожидайте подтверждения</div>`;
        }
      } else if (order.status === 'completed') {
        actionsHtml = `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:14px;text-align:center;color:var(--grn);font-size:14px;font-weight:800;margin-bottom:10px">✓ Сделка завершена</div><button class="btn btn-primary btn-block" onclick="openReview(${order.id})" style="margin-bottom:16px;">Оставить отзыв</button>`;
      } else if (order.status === 'dispute') {
        if (isStaff) actionsHtml = `<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:14px;margin-bottom:12px;font-weight:800;">Вы админ. Решите спор:</div><div class="grid-2-col" style="margin-bottom:16px"><button class="btn btn-primary" onclick="resolveDispute(${order.id}, 'completed')">Завершить</button><button class="btn btn-ghost" style="color:var(--red);border:1px solid var(--red);" onclick="resolveDispute(${order.id}, 'cancelled')">Отменить</button></div>`;
        else actionsHtml = `<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:14px;margin-bottom:16px;font-weight:800;">Спор рассматривается</div>`;
      }

      const timelineHtml = (history || []).map(h => `<div style="display:flex;gap:12px;padding:10px 0; border-bottom:1px solid var(--glass-border);"><div style="width:13px;height:13px;border-radius:50%;background:var(--txt);flex-shrink:0;margin-top:3px"></div><div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--txt);">${h.note || h.status}</div><div style="font-size:11px;color:var(--dim);font-weight:600;">${new Date(h.at).toLocaleString('ru-RU')}</div></div></div>`).join('');
      
      const container = document.getElementById('orderDetailContent');
      container.innerHTML = `
        <div class="glass-card" style="padding: 24px; margin-bottom: 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
             <div style="font-size:13px;color:var(--dim);font-family:monospace;font-weight:700;">#${order.public_id}</div>
             <div style="background:rgba(0,0,0,0.2);color:${sc[order.status]};font-size:12px;font-weight:800;padding:4px 10px;border-radius:6px;border:1px solid var(--glass-border);">${order.statusLabel}</div>
          </div>
          <h2 style="font-size:24px;font-weight:900;margin-bottom:8px;color:var(--txt)">${isBuyer ? 'Покупка ' : 'Продажа '}${order.asset}</h2>
          <div style="font-size:38px;font-weight:900;color:var(--txt);">${fmt(order.amount_rub)}<span style="font-size:18px;color:var(--dim);font-weight:600;margin-left:4px">₽</span></div>
          <div style="width:100%;height:6px;background:rgba(0,0,0,0.2);border-radius:3px;margin-top:24px;overflow:hidden"><div style="height:100%;width:${progress}%;background:${sc[order.status]};transition:0.3s"></div></div>
        </div>
        
        <div class="glass-card" style="padding:16px;margin-bottom:16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="openPublicProfile(${counterparty.id})">
          <div style="display:flex;align-items:center;gap:12px;">
             <div class="avatar" style="width:44px;height:44px;font-size:16px;">${counterparty.displayName[0].toUpperCase()}</div>
             <div>
               <div style="font-size:12px;color:var(--dim);font-weight:600;">${counterpartyRole}</div>
               <div style="font-size:16px;font-weight:800;color:var(--txt);">${counterparty.displayName}</div>
             </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="border:1px solid var(--glass-border);">Профиль</button>
        </div>

        <div class="grid-2-col" style="margin-bottom:16px">
          <div class="glass-card" style="padding:16px;"><div style="font-size:11px;color:var(--dim);font-weight:700;margin-bottom:4px;">Количество</div><div style="font-size:16px;font-weight:800;color:var(--txt);">${fmtDec(order.amount_asset, 4)} ${order.asset}</div></div>
          <div class="glass-card" style="padding:16px;"><div style="font-size:11px;color:var(--dim);font-weight:700;margin-bottom:4px;">Курс</div><div style="font-size:16px;font-weight:800;color:var(--txt);">${fmt(order.price)} ₽</div></div>
        </div>
        
        <div class="glass-card" style="padding:16px;margin-bottom:16px;">
          <div style="font-size: 11px; font-weight: 800; color: var(--dim); text-transform: uppercase; margin-bottom: 8px;">Условия сделки</div>
          <div style="font-size: 14px; color: var(--txt); line-height: 1.5; font-weight: 500;">${terms || 'Стандартные условия.'}</div>
        </div>
        
        ${actionsHtml}
        
        <button style="width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:16px;margin-bottom:16px;color:var(--txt);font-size:14px; cursor:pointer;" onclick="openChatModal(${order.id})">
          <div style="display:flex;align-items:center;gap:12px"><div class="avatar" style="width:40px;height:40px;font-size:18px">💬</div><div style="text-align:left;"><div style="font-weight:800; color:var(--txt);">Чат по сделке</div><div style="font-size:11px;color:var(--dim);font-weight:600;">Обсудить детали</div></div></div>
        </button>
        <div class="glass-card" style="padding:16px;"><div style="font-size:12px;font-weight:800;margin-bottom:14px;color:var(--dim);text-transform:uppercase">История</div>${timelineHtml}</div>`;

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
    }

    window.doAction = async function(orderId, action) {
      if (action === 'cancel' && !await confirmAsync('Отмена', 'Отменить заявку?', 'Да')) return;
      if (action === 'confirm' && !await confirmAsync('Подтверждение', 'Подтвердить оплату?', 'Да')) return;
      if (action === 'dispute' && !await confirmAsync('Спор', 'Вы уверены?', 'Да')) return;
      if (action === 'decline' && !await confirmAsync('Отклонение', 'Отклонить заявку?', 'Да')) return;
      
      try { 
        await API.req('POST', `/orders/${orderId}/${action}`); 
        toast('Статус обновлён', 'success'); 
        openOrderPage(orderId); 
      }
      catch (e) { toast(e.message, 'error'); }
    };

    window.resolveDispute = async function(orderId, resolution) {
      if (!await confirmAsync('Решение спора', 'Вы уверены?', 'Да')) return;
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
    function updateStars() { document.querySelectorAll('#ratingStars .rating-star').forEach(s => { s.classList.toggle('active', +s.dataset.r <= currentRating); s.style.color = +s.dataset.r <= currentRating ? '#FFD60A' : 'var(--dim)'; }); }
    
    document.querySelectorAll('#ratingStars .rating-star').forEach(s => { 
      s.onclick = () => { currentRating = +s.dataset.r; updateStars(); }; 
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
        
        const proBadge = user.isPro ? `<span class="badge-pro" style="margin-left:6px;">PRO</span>` : '';
        const merchantBadge = user.isMerchant ? `<span class="badge-merchant" style="margin-left:6px;">MERCHANT</span>` : '';
        const makerBadge = user.isMaker ? `<span class="badge-maker" style="margin-left:6px;">MAKER</span>` : '';

        const successRateStr = stats.successRate !== null ? `${stats.successRate}%` : '0%';
        const ratingAvgStr = stats.ratingAvg !== null ? stats.ratingAvg : '—';

        let contentHtml = '';
        if (profileTab === 'ads') contentHtml = '<div id="myAdsList"><div class="empty-state">Загрузка...</div></div>';
        else if (profileTab === 'history') contentHtml = '<div id="myHistoryList"><div class="empty-state">Загрузка...</div></div>';
        else if (profileTab === 'reviews') contentHtml = '<div id="myReviewsList"><div class="empty-state">Загрузка...</div></div>';
        
        let avatarHtml = `<div class="avatar lg">${user.displayName[0].toUpperCase()}</div>`;
        if (user.avatarUrl) avatarHtml = `<div class="avatar lg"><img src="${user.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${user.displayName[0].toUpperCase()}'"></div>`;

        content.innerHTML = `
          <div class="glass-card" style="display:flex;align-items:center;gap:16px;padding:20px;margin-bottom:20px;">
            ${avatarHtml}
            <div style="flex:1;min-width:0; padding-right: 4px;">
              <h2 style="font-size:20px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;flex-wrap:wrap;color:var(--txt);line-height: 1.3;">${user.displayName} ${merchantBadge} ${makerBadge} ${proBadge}</h2>
              <div style="font-size:13px;color:var(--dim);font-weight:600;">@${user.username}</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="align-self: flex-start; font-size:18px; background: var(--glass-bg); border: 1px solid var(--glass-border); width: 36px; height: 36px; border-radius: 8px; padding: 0;" onclick="openSettings()">⚙️</button>
          </div>
          
          <div class="grid-2-col" style="margin-bottom:20px;">
            <div class="glass-card" style="padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Сделок</div>
              <div style="font-size:20px;font-weight:800;color:var(--txt);">${stats.dealsTotal}</div>
            </div>
            <div class="glass-card" style="padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Успешных</div>
              <div style="font-size:20px;font-weight:800;color:var(--txt);">${successRateStr}</div>
            </div>
            <div class="glass-card" style="padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Отзывов</div>
              <div style="font-size:20px;font-weight:800;color:var(--txt);">${stats.reviewsCount}</div>
            </div>
            <div class="glass-card" style="padding:16px;text-align:center;">
              <div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Рейтинг</div>
              <div style="font-size:20px;font-weight:800;color:var(--txt);">${ratingAvgStr}</div>
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
        list.innerHTML = items.length ? items.map(ad => `
          <div class="glass-card" style="margin-bottom:12px; padding:16px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:16px">
              <strong style="font-size:16px;color:var(--txt);">${ad.side === 'sell' ? 'Продажа' : 'Покупка'} ${ad.asset}</strong>
              <span style="color:${ad.active ? 'var(--grn)' : 'var(--red)'};font-size:12px;font-weight:700;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;">${ad.active ? 'Активно' : 'Неактивно'}</span>
            </div>
            <div class="grid-2-col" style="margin-bottom:16px;">
              <div><div style="font-size:11px;color:var(--dim);font-weight:600;">Курс</div><div style="font-size:16px;font-weight:800;color:var(--txt);">${fmt(ad.price)} ₽</div></div>
              <div><div style="font-size:11px;color:var(--dim);font-weight:600;">Остаток</div><div style="font-size:16px;font-weight:800;color:var(--txt);">${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div></div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-ghost btn-sm" style="flex:1; border:1px solid var(--glass-border); color:var(--txt);" onclick="toggleAdStatus(${ad.id}, ${ad.active})">${ad.active ? 'Снять' : 'Активировать'}</button>
            </div>
          </div>
        `).join('') : '<div class="empty-state">У вас нет объявлений</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    window.toggleAdStatus = async function(adId, currentStatus) {
      try {
        await API.req('PATCH', '/ads/' + adId, { active: !currentStatus });
        toast(currentStatus ? 'Объявление снято' : 'Активировано', 'success');
        loadMyAds();
      } catch(e) { toast('Ошибка', 'error'); }
    };

    async function loadMyHistory() {
      const list = document.getElementById('myHistoryList'); if (!list) return;
      try {
        const { items } = await API.req('GET', '/orders/my?status=completed');
        list.innerHTML = items.length ? items.map(o => `<div class="glass-card" style="margin-bottom:12px; border-left:4px solid var(--grn); padding:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><strong style="font-size:15px;color:var(--txt);">#${o.publicId}</strong><span style="color:var(--grn);font-size:12px;font-weight:700;">Завершен</span></div><div class="grid-2-col"><div><div style="font-size:11px;color:var(--dim);font-weight:600;">Сумма</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${fmt(o.amountRub)} ₽</div></div><div><div style="font-size:11px;color:var(--dim);font-weight:600;">Актив</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div></div></div>`).join('') : '<div class="empty-state">История пуста</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    async function loadMyReviews() {
      const list = document.getElementById('myReviewsList'); if (!list) return;
      try {
        const u = API.user();
        const data = await API.req('GET', '/reviews/user/' + u.id);
        const items = data.items || [];
        list.innerHTML = items.length ? items.map(r => `<div class="glass-card" style="margin-bottom:12px; padding:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong style="font-size:14px;color:var(--txt);">${r.author}</strong><span style="color:var(--yellow);font-size:16px;">${'★'.repeat(r.rating)}</span></div><p style="font-size:13px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p></div>`).join('') : '<div class="empty-state">Отзывов нет</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    window.openSettings = async function() {
      const u = API.user(); if (!u) return;
      document.getElementById('settingsAvatarUrl').value = u.avatarUrl || '';
      document.getElementById('settingsName').value = u.displayName || '';
      document.getElementById('settingsEmail').value = u.email;
      document.getElementById('settingsCurrentPass').value = '';
      document.getElementById('settingsNewPass').value = '';
      document.getElementById('settingsError').textContent = '';
      
      try {
        const { user, stats } = await API.req('GET', '/users/me');
        const container = document.getElementById('statusProgressContainer');
        let progressHtml = '';
        if (user.isMaker) {
          progressHtml += `<div style="font-size:14px; color:var(--gold); font-weight:800;">✓ Статус Мейкера активен</div>`;
        } else {
          const vol = stats.volumeUsd, sr = stats.successRate || 0;
          const volPercent = Math.min(100, Math.round((vol / 3000) * 100));
          const srPercent = Math.min(100, Math.round((sr / 80) * 100));
          progressHtml += `
            <div style="background:rgba(0,0,0,0.1); padding:16px; border-radius:12px; border:1px solid var(--glass-border);">
              <div style="font-size:14px; font-weight:800; margin-bottom:12px; color:var(--gold);">Статус Мейкера</div>
              <div style="font-size:12px; color:var(--dim); margin-bottom:6px;">Оборот: $${fmt(vol)} / $3,000</div>
              <div style="width:100%; height:6px; background:rgba(0,0,0,0.3); border-radius:3px; margin-bottom:12px;"><div style="width:${volPercent}%; height:100%; background:var(--gold); border-radius:3px;"></div></div>
              <div style="font-size:12px; color:var(--dim); margin-bottom:6px;">Успешных: ${sr}% / 80%</div>
              <div style="width:100%; height:6px; background:rgba(0,0,0,0.3); border-radius:3px; margin-bottom:16px;"><div style="width:${srPercent}%; height:100%; background:var(--gold); border-radius:3px;"></div></div>
            </div>`;
        }
        container.innerHTML = progressHtml;
      } catch (e) { console.error(e); }
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
           if (!curPass) throw new Error('Введите текущий пароль');
           payload.currentPassword = curPass;
           payload.password = newPass;
        }
        const { user } = await API.req('PATCH', '/users/me', payload);
        localStorage.setItem('vexo_user', JSON.stringify(user));
        closeModal('settingsModal'); toast('Сохранено', 'success'); updateAuthUI(); loadProfile();
      } catch (e) {
        const er = document.getElementById('settingsError');
        if (er) er.textContent = e.message === 'wrong_password' ? 'Неверный пароль' : e.message;
      } finally { btn.disabled = false; btn.textContent = 'Сохранить'; }
    });

    // ОРДЕР МОДАЛКА
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
      setText('orderRate', fmt(ad.price));
      setText('orderResultLabel', isBuy ? 'Вы получите' : 'Вы отдадите');
      setText('orderResult', '0 ' + ad.asset);
      setText('orderTotalBottom', '0 RUB');
      setText('orderTerms', ad.terms || 'Стандартные условия.');
      setText('orderError', '');

      const amountInput = document.getElementById('orderAmount');
      if (amountInput) {
        amountInput.value = '';
        const realMaxRub = Math.min(ad.maxRub, ad.amountLeft * ad.price);
        const limitEl = document.getElementById('orderLimit');
        if(limitEl) limitEl.textContent = `Лимит: ${fmt(ad.minRub)} - ${fmt(realMaxRub)} ₽`;

        amountInput.oninput = e => {
          const rub = parseFloat(e.target.value) || 0;
          setText('orderResult', fmtDec(rub / ad.price, 4) + ' ' + ad.asset);
          setText('orderTotalBottom', fmt(rub) + ' RUB');
          
          const errEl = document.getElementById('orderError');
          const btn = document.getElementById('orderSubmit');
          
          if (rub > 0 && (rub < ad.minRub || rub > realMaxRub)) {
             if (errEl) errEl.textContent = `Сумма от ${fmt(ad.minRub)} до ${fmt(realMaxRub)} ₽`;
             if (btn) { btn.style.opacity = '0.5'; btn.disabled = true; }
          } else {
             if (errEl) errEl.textContent = '';
             if (btn) { btn.style.opacity = '1'; btn.disabled = false; }
          }
        };
      }
      
      document.getElementById('btnOrderMax').onclick = () => {
        const realMaxRub = Math.min(ad.maxRub, ad.amountLeft * ad.price);
        amountInput.value = realMaxRub.toFixed(2);
        amountInput.dispatchEvent(new Event('input'));
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
      btn.className = 'btn ' + (isBuy ? 'btn-buy' : 'btn-sell');
      btn.textContent = isBuy ? 'Купить' : 'Продать';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.onclick = submitOrder;
      
      let timeLeft = 60;
      const timerEl = document.getElementById('priceTimer');
      if (timerEl) timerEl.textContent = timeLeft + 's';

      if (priceTimerInterval) clearInterval(priceTimerInterval);
      priceTimerInterval = setInterval(async () => {
        timeLeft--;
        if (timerEl) timerEl.textContent = timeLeft + 's';
        if (timeLeft <= 0) {
          clearInterval(priceTimerInterval);
          if (timerEl) timerEl.textContent = '...';
          try {
            const freshAd = await API.req('GET', '/ads/' + ad.id);
            if (freshAd.price !== ad.price) {
              currentAd = freshAd; window._ads[ad.id] = freshAd; ad.price = freshAd.price;
              setText('orderRate', fmt(ad.price));
              toast('Курс обновлен!', 'error');
              if (amountInput.value) amountInput.dispatchEvent(new Event('input'));
            }
          } catch(e) {}
          timeLeft = 60; if (timerEl) timerEl.textContent = timeLeft + 's';
        }
      }, 1000);

      document.getElementById('orderModal').classList.add('active');
    };

    async function submitOrder() {
      const errEl = document.getElementById('orderError'); if (errEl) errEl.textContent = '';
      const rub = parseFloat(document.getElementById('orderAmount').value) || 0;
      if (!selectedPay) { if (errEl) errEl.textContent = 'Выберите оплату'; return; }
      
      const realMaxRub = Math.min(currentAd.maxRub, currentAd.amountLeft * currentAd.price);
      if (rub < currentAd.minRub) { if (errEl) errEl.textContent = 'Минимум ' + fmt(currentAd.minRub) + ' ₽'; return; }
      if (rub > realMaxRub) { if (errEl) errEl.textContent = 'Максимум ' + fmt(realMaxRub) + ' ₽'; return; }
      
      const btn = document.getElementById('orderSubmit'); btn.disabled = true; btn.textContent = '...';
      try {
        const order = await API.req('POST', '/orders', { ad_id: currentAd.id, amount_rub: rub, payment_method: selectedPay });
        closeModal('orderModal'); toast('Заявка создана!', 'success'); openOrderPage(order.id);
      } catch (err) { if (errEl) errEl.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = currentAd ? (currentAd.side === 'sell' ? 'Купить' : 'Продать') : 'OK'; }
    }

    window.logoutAction = async function() {
      if (await confirmAsync('Выход', 'Выйти из аккаунта?', 'Выйти')) { localStorage.removeItem('vexo_token'); localStorage.removeItem('vexo_user'); location.reload(); }
    };

    document.getElementById('walletActionSubmit')?.addEventListener('click', () => {
      if (!API.user()) { closeModal('walletActionModal'); document.getElementById('authModal')?.classList.add('active'); return; }
      const amount = document.getElementById('walletActionAmount')?.value;
      if (!amount || Number(amount) <= 0) return toast('Введите сумму', 'error');
      window.open(`https://t.me/vexoio_bot?start=${walletActionType === 'deposit' ? 'dep' : 'wth'}_${amount}`, '_blank');
      closeModal('walletActionModal'); toast('Перенаправление...', 'success');
    });

    // АДМИНКА
    let adminTab = 'users';

    async function loadAdmin() {
      const u = API.user();
      if (!['admin', 'owner', 'deputy'].includes(u.role)) return;
      const content = document.getElementById('adminContent');
      if (!content) return;
      const canManageBalance = ['owner', 'deputy'].includes(u.role);

      try {
        if (adminTab === 'users') {
          content.innerHTML = 'Загрузка...';
          const { items } = await API.req('GET', '/admin/users');
          content.innerHTML = items.map(user => `
            <div class="glass-card" style="padding:16px; border-radius:12px; margin-bottom:12px;">
              <div style="font-weight:800; color:var(--txt); font-size:15px;">${user.displayName} (@${user.username})</div>
              <div style="font-size:12px; color:var(--dim); margin-top:2px;">Email: ${user.email} | Роль: ${user.role}</div>
              <div style="margin-top:12px; display:flex; gap:6px; flex-wrap: wrap;">
                <button class="admin-badge-btn ${user.isPro ? 'active-pro' : ''}" onclick="toggleUserStatus(${user.id}, 'is_pro', ${user.isPro})">PRO</button>
                <button class="admin-badge-btn ${user.isMerchant ? 'active-merchant' : ''}" onclick="toggleUserStatus(${user.id}, 'is_merchant', ${user.isMerchant})">MERCHANT</button>
                <button class="admin-badge-btn ${user.isMaker ? 'active-maker' : ''}" onclick="toggleUserStatus(${user.id}, 'is_maker', ${user.isMaker})">MAKER</button>
                ${canManageBalance ? `<button class="btn btn-primary btn-sm" style="margin-left:auto; padding:4px 8px; font-size:12px;" onclick="openBalanceModal(${user.id}, '${user.username}')">💰 Баланс</button>` : ''}
              </div>
            </div>
          `).join('');
        } 
        else if (adminTab === 'disputes') {
          content.innerHTML = 'Загрузка...';
          const { items } = await API.req('GET', '/admin/orders');
          if (!items.length) { content.innerHTML = '<div class="empty-state">Нет споров</div>'; return; }
          content.innerHTML = items.map(o => `
            <div class="ad-card glass-card" style="cursor:pointer; border-left:4px solid ${o.status === 'dispute' ? 'var(--gold)' : 'var(--blue)'}; margin-bottom:12px;" onclick="openAdminOrder(${o.id})">
              <div style="display:flex;justify-content:space-between;margin-bottom:12px">
                <strong style="font-family:monospace;font-size:15px; color:var(--txt);">#${o.publicId}</strong>
                <span style="color:var(--txt);font-size:12px;font-weight:800">${o.statusLabel}</span>
              </div>
              <div class="ad-body">
                <div><div style="font-size:11px; color:var(--dim);">Сумма</div><div style="font-size:15px; font-weight:800; color:var(--txt);">${fmt(o.amountRub)} ₽</div></div>
                <div><div style="font-size:11px; color:var(--dim);">Актив</div><div style="font-size:15px; font-weight:800; color:var(--txt);">${fmtDec(o.amountAsset, 4)} ${o.asset}</div></div>
              </div>
            </div>
          `).join('');
        }
        else if (adminTab === 'requests') {
          content.innerHTML = 'Загрузка...';
          const { items } = await API.req('GET', '/admin/requests');
          if (!items.length) { content.innerHTML = '<div class="empty-state">Нет активных заявок</div>'; return; }
          content.innerHTML = items.map(req => {
            const isExchange = req.type.includes('exchange');
            const isPending = req.status === 'pending';
            const statusColor = isPending ? 'var(--yellow)' : req.status === 'approved' ? 'var(--grn)' : 'var(--red)';
            const typeLabel = isExchange ? (req.type === 'exchange_buy' ? 'Покупка USDT' : 'Продажа USDT') : (req.type === 'withdraw_rub' ? 'Вывод RUB' : 'Вывод USDT');
            const amountStr = `${fmt(req.amount)} ${req.type.includes('rub') || req.type === 'exchange_buy' ? 'RUB' : 'USDT'}`;
            
            return `
            <div class="glass-card" style="padding:16px; margin-bottom:12px; border-left:4px solid ${statusColor};">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <strong style="font-size:14px; color:var(--txt);">${typeLabel}</strong>
                <span style="font-size:11px; font-weight:800; color:${statusColor}; text-transform:uppercase;">${req.status}</span>
              </div>
              <div style="font-size:12px; color:var(--dim); margin-bottom:12px;">Юзер: <span style="color:var(--txt); font-weight:700;">@${req.username}</span></div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                 <div style="font-size:12px; color:var(--dim);">Сумма:</div>
                 <div style="font-size:15px; font-weight:800; color:var(--txt);">${amountStr}</div>
              </div>
              ${isPending && canManageBalance ? `
                <div class="grid-2-col" style="gap: 8px;">
                  <button class="btn btn-primary btn-sm" style="background:var(--grn);" onclick="updateRequestStatus(${req.id}, 'approved')">Одобрить</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red); border:1px solid var(--red);" onclick="updateRequestStatus(${req.id}, 'rejected')">Отклонить</button>
                </div>
              ` : ''}
            </div>`;
          }).join('');
        }
      } catch(e) { content.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    document.querySelectorAll('#adminTabs .tab').forEach(c => {
      c.onclick = () => {
        document.querySelectorAll('#adminTabs .tab').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        adminTab = c.dataset.val;
        loadAdmin();
      };
    });

    window.toggleUserStatus = async function(userId, field, currentVal) {
      try {
        const payload = {}; payload[field] = !currentVal;
        await API.req('PATCH', '/admin/users/' + userId + '/status', payload);
        toast('Статус обновлен', 'success'); loadAdmin();
      } catch(e) { toast('Ошибка', 'error'); }
    };

    window.openBalanceModal = function(userId, username) {
      let m = document.getElementById('balanceModal');
      if (!m) {
        m = document.createElement('div');
        m.id = 'balanceModal'; m.className = 'modal';
        m.innerHTML = `
          <div class="modal-content glass-card" style="padding: 24px;">
            <div class="modal-header" style="padding:0; margin-bottom:16px;">
                <h3 style="font-size: 18px; font-weight: 800; color: var(--txt);">Баланс: @${username}</h3>
                <button class="icon-btn" onclick="document.getElementById('balanceModal').classList.remove('active')">✕</button>
            </div>
            <div class="form-group">
              <label class="label">Валюта</label>
              <select id="balCurrency" class="input" style="margin-top: 4px;">
                <option value="rub">RUB</option>
                <option value="usdt">USDT</option>
              </select>
            </div>
            <div class="form-group">
              <label class="label">Сумма</label>
              <input type="number" id="balAmount" class="input" style="margin-top: 4px;" placeholder="1000">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 20px;">
              <button class="btn btn-primary" style="flex:1; background: var(--grn);" onclick="changeBalance(${userId}, 'add')">Начислить (+)</button>
              <button class="btn btn-primary" style="flex:1; background: var(--red);" onclick="changeBalance(${userId}, 'sub')">Списать (-)</button>
            </div>
          </div>
        `;
        document.body.appendChild(m);
      }
      m.classList.add('active');
    };

    window.changeBalance = async function(userId, action) {
      const currency = document.getElementById('balCurrency').value;
      const amount = parseFloat(document.getElementById('balAmount').value);
      if (!amount || amount <= 0) return toast('Введите сумму', 'error');
      try {
        await API.req('POST', '/admin/users/' + userId + '/balance', { currency, amount, action });
        toast('Баланс изменен', 'success');
        document.getElementById('balanceModal').classList.remove('active');
        loadAdmin();
      } catch(e) { toast(e.message || 'Ошибка', 'error'); }
    };

    window.updateRequestStatus = async function(reqId, status) {
      if (!await confirmAsync('Изменение', `Отметить как "${status}"?`, 'Да')) return;
      try {
        await API.req('PATCH', '/admin/requests/' + reqId, { status });
        toast('Статус обновлен', 'success'); loadAdmin();
      } catch(e) { toast(e.message || 'Ошибка', 'error'); }
    };

    // СТАРТ
    initExchange();
    updateAuthUI();
    updateNotifUI();
    try { loadHome(); } catch(e) { console.error('Initial loadHome:', e); }

  } catch (err) {
    console.error('VEXO: КРИТИЧЕСКАЯ ОШИБКА', err);
  }
});t <= 0) return toast('Введите сумму', 'error');
      try {
        await API.req('POST', '/admin/users/' + userId + '/balance', { currency, amount, action });
        toast('Баланс изменен', 'success');
        document.getElementById('balanceModal').classList.remove('active');
        loadAdmin();
      } catch(e) { toast(e.message || 'Ошибка', 'error'); }
    };

    window.updateRequestStatus = async function(reqId, status) {
      if (!await confirmAsync('Изменение', `Отметить как "${status}"?`, 'Да')) return;
      try {
        await API.req('PATCH', '/admin/requests/' + reqId, { status });
        toast('Статус обновлен', 'success'); loadAdmin();
      } catch(e) { toast(e.message || 'Ошибка', 'error'); }
    };

    // СТАРТ
    initExchange();
    updateAuthUI();
    updateNotifUI();
    try { loadHome(); } catch(e) { console.error('Initial loadHome:', e); }

  } catch (err) {
    console.error('VEXO: КРИТИЧЕСКАЯ ОШИБКА', err);
  }
});