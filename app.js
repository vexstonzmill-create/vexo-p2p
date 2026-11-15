document.addEventListener('contextmenu', e => { if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); });
window.addEventListener('error', (e) => console.error('VEXO CRASH:', e.message, 'at', e.filename, ':', e.lineno));
window.addEventListener('unhandledrejection', (e) => console.error('VEXO PROMISE ERROR:', e.reason));

document.addEventListener('DOMContentLoaded', () => {
  try {
    setTimeout(() => { const loader = document.getElementById('loader'); if (loader) { loader.classList.add('hidden-loader'); loader.style.display = 'none'; } }, 800);

    const PAY_ICONS = {
      'СБП': `<svg viewBox="0 0 24 24" fill="none" width="18" height="18" style="flex-shrink:0; border-radius:4px; overflow:hidden;"><rect width="24" height="24" fill="#0055BB"/><path d="M0 0h12v12H0z" fill="#FF0033"/><path d="M12 12h12v12H12z" fill="#00CC00"/><path d="M12 0h12v12H12z" fill="#FFCC00"/><path d="M0 12h12v12H0z" fill="#0055BB"/><path d="M6 8h12v2H6zM6 14h12v2H6z" fill="#fff"/></svg>`,
      'Тинькофф': `<svg viewBox="0 0 24 24" fill="none" width="18" height="18" style="flex-shrink:0; border-radius:4px; overflow:hidden;"><rect width="24" height="24" rx="4" fill="#FFDD2D"/><path d="M12 5l6 3v4c0 3.5-2.5 6.5-6 7-3.5-.5-6-3.5-6-7V8l6-3z" fill="#000"/></svg>`,
      'Сбербанк': `<svg viewBox="0 0 24 24" fill="none" width="18" height="18" style="flex-shrink:0; border-radius:4px; overflow:hidden;"><rect width="24" height="24" rx="4" fill="#21A038"/><path d="M7 12l3 3 7-7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      'Альфа-Банк': `<svg viewBox="0 0 24 24" fill="none" width="18" height="18" style="flex-shrink:0; border-radius:4px; overflow:hidden;"><rect width="24" height="24" rx="4" fill="#EF3124"/><path d="M12 6l5 12h-3l-1-3H8l-1 3H4L12 6zm-2 6h3l-1.5-4L10 12z" fill="#fff"/></svg>`
    };
    const getPayIcon = (name) => PAY_ICONS[name] || '';

    const API = {
      token: () => localStorage.getItem('vexo_token'),
      user: () => { try { return JSON.parse(localStorage.getItem('vexo_user')); } catch { return null; } },
      async req(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token()) headers.Authorization = 'Bearer ' + this.token();
        const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { localStorage.removeItem('vexo_token'); localStorage.removeItem('vexo_user'); window.location.reload(); }
        if (!res.ok) { const e = new Error(data.error || 'error'); e.code = data.error; e.status = res.status; throw e; }
        return data;
      }
    };

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
    });

    async function initTelegramAuth() {
      if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        const tg = window.Telegram.WebApp;
        document.body.classList.add('tg-fullscreen');
        document.body.style.paddingTop = '60px';
        try { tg.ready(); tg.expand(); if (tg.requestFullscreen) tg.requestFullscreen(); if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); tg.setHeaderColor('#09090b'); tg.setBackgroundColor('#09090b'); } catch(e) {}
        const initData = tg.initData; if (API.token()) return; 
        try {
          const res = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
          if (res.ok) { const data = await res.json(); localStorage.setItem('vexo_token', data.token); localStorage.setItem('vexo_user', JSON.stringify(data.user)); updateAuthUI(); loadHomeDashboard(); screenCache.profile = false; screenCache.wallet = false; toast('Вход через Telegram выполнен!', 'success'); }
        } catch(e) { console.error('TG Auth Error:', e); }
      }
    }

    function initDeepLink() { const p = new URLSearchParams(window.location.search).get('screen'); if (p) setTimeout(() => show(p), 300); }
    initTelegramAuth(); initDeepLink();

    const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n || 0);
    const fmtDec = (n, d = 2) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);

    const ICONS = {
      pro: `<svg viewBox="0 0 24 24" fill="none" stroke="#FFD60A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
      merchant: `<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
      maker: `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`
    };

    function toast(msg, type = 'info') {
      try {
        const c = document.getElementById('toastContainer'); if (!c) return;
        const existing = Array.from(c.children).find(el => el.textContent === msg); if (existing) return;
        if (c.children.length >= 2) c.removeChild(c.firstElementChild);
        const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg; c.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, 3000);
      } catch(e) {}
    }

    function confirmAsync(title, message, okText = 'OK') {
      return new Promise(resolve => {
        const overlay = document.getElementById('dialogOverlay'); const content = document.getElementById('dialogContent');
        if (!overlay || !content) return resolve(false);
        content.innerHTML = `<h3 style="font-size:18px;font-weight:800;color:var(--txt)">${title}</h3><p style="font-size:15px;color:var(--dim);margin:10px 0;font-weight:500;">${message}</p><div style="display:flex;gap:12px;margin-top:16px"><button class="btn btn-ghost" style="flex:1;border:1px solid var(--glass-border);height:44px;font-size:14px;" id="dlgCancel">Отмена</button><button class="btn btn-primary" style="flex:1;height:44px;font-size:14px;" id="dlgOk">${okText}</button></div>`;
        overlay.classList.add('active');
        document.getElementById('dlgCancel').onclick = () => { overlay.classList.remove('active'); resolve(false); };
        document.getElementById('dlgOk').onclick = () => { overlay.classList.remove('active'); resolve(true); };
      });
    }

    function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }
    window.closeModal = closeModal;
    window.toggleSidebar = function(open) { const s = document.querySelector('.sidebar'); const b = document.getElementById('sidebarBackdrop'); if (open) { s.classList.add('mobile-open'); b.classList.add('active'); } else { s.classList.remove('mobile-open'); b.classList.remove('active'); } };
    document.getElementById('menuBtn')?.addEventListener('click', () => toggleSidebar(true));

    let volumeType = 'usdt'; let feeType = 'rub';
    function initSpreadCalculator() {
      if (window._spreadInited) return;
      const b = document.getElementById('calc-buy-price'), s = document.getElementById('calc-sell-price'), a = document.getElementById('calc-amount'), f = document.getElementById('calc-fee'), fBtn = document.getElementById('calc-fee-type'), vBtn = document.getElementById('calc-volume-type');
      if (!b) return; window._spreadInited = true;
      vBtn.onclick = () => { volumeType = volumeType === 'usdt' ? 'rub' : 'usdt'; vBtn.textContent = volumeType === 'usdt' ? 'USDT' : '₽'; vBtn.classList.toggle('active', volumeType === 'rub'); calc(); };
      fBtn.onclick = () => { feeType = feeType === 'rub' ? 'pct' : 'rub'; fBtn.textContent = feeType === 'rub' ? '₽' : '%'; fBtn.classList.toggle('active', feeType === 'pct'); calc(); };
      const calc = () => {
        const buy = parseFloat(b.value) || 0, sell = parseFloat(s.value) || 0, av = parseFloat(a.value) || 0, fv = parseFloat(f.value) || 0;
        const aUsdt = volumeType === 'rub' ? (buy > 0 ? av / buy : 0) : av;
        const spreadVal = sell - buy, spreadPct = buy > 0 ? (spreadVal / buy) * 100 : 0, totalSell = sell * aUsdt;
        let feeAmt = feeType === 'pct' ? totalSell * (fv / 100) : fv;
        const profit = (spreadVal * aUsdt) - feeAmt;
        document.getElementById('calc-spread-val').textContent = fmtDec(spreadVal, 2) + ' ₽';
        document.getElementById('calc-spread-pct').textContent = fmtDec(spreadPct, 2) + ' %';
        const pEl = document.getElementById('calc-profit'); pEl.textContent = fmtDec(profit, 2) + ' ₽';
        pEl.style.color = profit > 0 ? 'var(--grn)' : (profit < 0 ? 'var(--red)' : 'var(--txt)');
      };
      [b, s, a, f].forEach(i => i.addEventListener('input', calc));
    }

    async function loadHomeRate() { try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub'); const d = await r.json(); if (d?.tether?.rub) document.getElementById('homeUsdtRate').textContent = fmtDec(d.tether.rub, 2) + ' ₽'; } catch(e) { const el = document.getElementById('homeUsdtRate'); if (el) el.textContent = '90.00 ₽'; } }

    async function loadHomeDashboard() {
      const u = API.user();
      if (!u) { ['topbarName', 'homeBalanceValue', 'homeUserName', 'homeDealsCount', 'homeRating', 'homeAvatarLetter'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = id === 'homeBalanceValue' ? '0.00 ₽' : (id === 'topbarName' || id === 'homeUserName' ? 'Гость' : '—'); }); const a = document.getElementById('homeAvatar'); if (a) a.style.display = 'none'; return; }
      try {
        const { user, stats } = await API.req('GET', '/users/me'); localStorage.setItem('vexo_user', JSON.stringify(user));
        document.getElementById('topbarName').textContent = user.displayName || user.username;
        document.getElementById('greetingText').textContent = 'Готовы к работе!';
        let uRate = 90; try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub'); const rd = await r.json(); if (rd?.tether?.rub) uRate = rd.tether.rub; } catch(e) {}
        document.getElementById('homeBalanceValue').textContent = fmtDec(user.balanceRub + (user.balanceUsdt * uRate), 2) + ' ₽';
        document.getElementById('homeUserName').textContent = user.displayName || user.username;
        document.getElementById('homeDealsCount').textContent = stats.dealsTotal + ' сделок';
        document.getElementById('homeRating').textContent = stats.ratingAvg || '0';
        const avImg = document.getElementById('homeAvatar'), avLet = document.getElementById('homeAvatarLetter');
        if (avImg && avLet) { if (user.avatarUrl) { avImg.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`; avImg.style.display = 'block'; avLet.style.display = 'none'; } else { avImg.style.display = 'none'; avLet.style.display = 'flex'; avLet.textContent = (user.displayName || user.username || '?')[0].toUpperCase(); } }
      } catch(e) {}
    }

    let notifications = JSON.parse(localStorage.getItem('vexo_notifs')) || []; notifications = notifications.filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
    function addNotification(text, type = 'info') { const now = Date.now(); if (notifications.some(n => n.text === text && (now - new Date(n.date).getTime() < 3000))) return; notifications.unshift({ id: now, text, type, date: new Date().toISOString() }); if (notifications.length > 20) notifications.pop(); localStorage.setItem('vexo_notifs', JSON.stringify(notifications)); updateNotifUI(); }
    window.clearNotifications = () => { notifications = []; localStorage.setItem('vexo_notifs', JSON.stringify([])); updateNotifUI(); };
    function updateNotifUI() { const d = document.getElementById('notifDot'), l = document.getElementById('notificationsList'); if (d) d.classList.toggle('hidden', notifications.length === 0); if (l) l.innerHTML = notifications.length ? notifications.map(n => `<div class="notif-item ${n.type || 'info'}" style="padding:12px 0;border-bottom:1px solid var(--glass-border)"><div style="font-size:11px;color:var(--dim);font-weight:700;">${new Date(n.date).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</div><div style="font-size:14px;font-weight:600;color:var(--txt);">${n.text}</div></div>`).join('') : '<div class="empty-state">Нет новых уведомлений</div>'; }
    document.getElementById('notifBtn')?.addEventListener('click', () => { document.getElementById('notificationsModal').classList.add('active'); updateNotifUI(); });

    let previousScreen = 'home'; const screenCache = {};
    function initCreateScreen() {
      const u = API.user(); if (!u) return;
      const canBuy = ['admin', 'owner', 'deputy'].includes(u.role) || u.isMaker || u.isMerchant;
      const sBtn = document.querySelector('#f-side .seg-btn[data-val="sell"]'), bBtn = document.querySelector('#f-side .seg-btn[data-val="buy"]');
      if (!sBtn || !bBtn) return;
      if (!canBuy) { bBtn.disabled = true; bBtn.style.opacity = '0.4'; if (bBtn.classList.contains('active')) { bBtn.classList.remove('active'); sBtn.classList.add('active'); } } else { bBtn.disabled = false; bBtn.style.opacity = '1'; }
    }

    function show(name) {
      if (window.orderPollInterval) clearInterval(window.orderPollInterval); if (window.orderTimerInterval) clearInterval(window.orderTimerInterval);
      toggleSidebar(false);
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('screen-' + name)?.classList.add('active');
      document.querySelectorAll('.nav-btn, .bn-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll(`[data-screen="${name}"]`).forEach(b => b.classList.add('active'));
      try {
        if (name === 'market') { if (!screenCache.market) { loadMarket(); screenCache.market = true; } document.querySelector('.seg-btn[data-mode="p2p"]')?.click(); }
        if (name === 'profile' && !screenCache.profile) { loadProfile(); screenCache.profile = true; }
        if (name === 'home') { loadHomeRate(); loadHomeDashboard(); }
        if (name === 'wallet') { loadWallet(); screenCache.wallet = true; }
        if (name === 'admin') { loadAdmin(); } if (name === 'spread') { initSpreadCalculator(); } if (name === 'create') { initCreateScreen(); }
      } catch(e) {}
      window.scrollTo(0, 0);
    }
    window.show = show;

    document.querySelectorAll('[data-screen]').forEach(b => { b.onclick = e => { e.preventDefault(); const s = b.dataset.screen; if (!['order', 'admin'].includes(s)) previousScreen = s; show(s); }; });

    let currentTheme = localStorage.getItem('vexo_theme') || 'dark'; function applyTheme(t) { document.body.setAttribute('data-theme', t); localStorage.setItem('vexo_theme', t); } applyTheme(currentTheme);
    document.getElementById('themeBtn')?.addEventListener('click', () => { currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; applyTheme(currentTheme); toast('Тема изменена', 'info'); });

    document.querySelectorAll('#marketTopTabs .seg-btn').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('#marketTopTabs .seg-btn').forEach(t => t.classList.remove('active')); tab.classList.add('active');
        const target = tab.dataset.mtab; document.querySelectorAll('.market-tab-content').forEach(c => c.classList.remove('active')); document.getElementById('mtab-' + target)?.classList.add('active');
        if (target === 'ads') loadMyAds(); if (target === 'orders') loadOrders('active');
      };
    });

    let authMode = 'login'; function setAuthMode(mode) { authMode = mode; document.getElementById('tabLogin')?.classList.toggle('active', mode === 'login'); document.getElementById('tabRegister')?.classList.toggle('active', mode === 'register'); document.getElementById('emailField')?.classList.toggle('hidden', mode !== 'register'); const l = document.getElementById('loginLabel'); if (l) l.textContent = mode === 'register' ? 'Никнейм' : 'Логин или Email'; const b = document.getElementById('authSubmit'); if (b) b.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться'; document.getElementById('authError').textContent = ''; }
    document.getElementById('tabLogin')?.addEventListener('click', () => setAuthMode('login')); document.getElementById('tabRegister')?.addEventListener('click', () => setAuthMode('register')); document.getElementById('loginBtn')?.addEventListener('click', () => { setAuthMode('login'); document.getElementById('authModal')?.classList.add('active'); }); document.getElementById('avatarBtn')?.addEventListener('click', () => show('profile'));

    document.getElementById('authForm')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const errEl = document.getElementById('authError'), btn = document.getElementById('authSubmit'); errEl.textContent = ''; btn.disabled = true; btn.textContent = '...';
      try {
        const body = { password: document.getElementById('authPass')?.value || '' }; let path;
        if (authMode === 'login') { path = '/auth/login'; body.login = document.getElementById('authLogin')?.value || ''; } else { path = '/auth/register'; body.username = document.getElementById('authLogin')?.value || ''; body.email = document.getElementById('authEmail')?.value || ''; }
        const data = await API.req('POST', path, body); localStorage.setItem('vexo_token', data.token); localStorage.setItem('vexo_user', JSON.stringify(data.user)); closeModal('authModal'); updateAuthUI(); loadHomeDashboard(); toast('Успешно!', 'success'); screenCache.profile = false; show('market');
      } catch (err) { const map = { invalid_credentials: 'Неверный логин или пароль', user_exists: 'Никнейм занят', email_exists: 'Email занят', short_password: 'Пароль мин. 8 символов' }; errEl.textContent = map[err.code] || err.message; } finally { btn.disabled = false; btn.textContent = authMode === 'login' ? 'Войти' : 'Зарегистрироваться'; }
    });

    function updateAuthUI() {
      const u = API.user(); const lb = document.getElementById('loginBtn'), ab = document.getElementById('avatarBtn'), an = document.getElementById('adminNavBtn'), abn = document.getElementById('adminBnBtn');
      if (u) {
        if (lb) lb.style.display = 'none'; if (ab) { ab.classList.remove('hidden'); ab.style.background = 'var(--primary)'; ab.style.color = '#fff'; ab.style.width = '32px'; ab.style.height = '32px'; ab.style.borderRadius = '50%'; ab.style.display = 'flex'; ab.style.alignItems = 'center'; ab.style.justifyContent = 'center'; ab.style.fontWeight = '800'; ab.style.fontSize = '14px'; if (u.avatarUrl) ab.innerHTML = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'; this.parentElement.innerHTML='${(u.displayName || u.username || '?')[0].toUpperCase()}';">`; else ab.innerHTML = (u.displayName || u.username || '?')[0].toUpperCase(); }
        const isStaff = ['admin', 'owner', 'deputy'].includes(u.role);
        if (an) an.style.display = isStaff ? 'block' : 'none'; if (abn) abn.style.display = isStaff ? 'flex' : 'none';
      } else { if (lb) lb.style.display = 'inline-flex'; if (ab) ab.classList.add('hidden'); if (an) an.style.display = 'none'; if (abn) abn.style.display = 'none'; }
    }

    async function loadWallet() {
      const u = API.user(); const screen = document.getElementById('screen-wallet');
      if (!u) { screen.innerHTML = `<div class="empty-state" style="margin-top:20px;"><div style="font-size:30px;margin-bottom:10px;">🔒</div>Войдите в аккаунт.<br><br><button class="btn btn-primary btn-sm" onclick="document.getElementById('authModal').classList.add('active')">Войти</button></div>`; }
      else {
        screen.innerHTML = '<div class="empty-state">Загрузка...</div>'; let uRate = 90;
        try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub'); const d = await r.json(); if (d?.tether?.rub) uRate = d.tether.rub; } catch(e) {}
        API.req('GET', '/users/me').then(data => {
          localStorage.setItem('vexo_user', JSON.stringify(data.user)); const fU = data.user, estRub = fU.balanceUsdt * uRate, total = fU.balanceRub + estRub;
          screen.innerHTML = `
            <h2 style="margin-bottom: 6px; font-size: 22px; font-weight: 800;">Кошелёк</h2>
            <p style="color: var(--dim); font-size: 13px; margin-bottom: 16px;">Балансы и история</p>
            <div class="glass-card" style="padding: 24px; text-align: center; margin-bottom: 24px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none; color: #fff;">
              <div style="font-size: 13px; opacity: 0.8; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">Общий баланс</div>
              <div style="font-size: 38px; font-weight: 900; margin-bottom: 20px;">${fmtDec(total, 2)} <span>₽</span></div>
              <div style="display: flex; gap: 8px;"><button class="btn btn-sm" id="btnDeposit" style="flex:1; background: rgba(255,255,255,0.2); border: none; color: #fff; backdrop-filter: blur(10px);">Пополнить</button><button class="btn btn-sm" id="btnWithdraw" style="flex:1; background: rgba(255,255,255,0.2); border: none; color: #fff; backdrop-filter: blur(10px);">Вывести</button></div>
            </div>
            <h3 style="margin-top: 16px; font-size: 16px; margin-bottom: 12px; font-weight: 800;">Активы</h3>
            <div class="wallet-list">
              <div class="wallet-item"><div class="coin-icon rub">₽</div><div class="w-info"><div class="w-name">Российский рубль</div><div class="w-sub">RUB · фиат</div></div><div class="w-bal">${fmtDec(fU.balanceRub, 2)} ₽</div></div>
              <div class="wallet-item"><div class="coin-icon usdt" style="background: none; border: none; padding: 0;"><svg viewBox="0 0 32 32" width="40" height="40" style="margin-right: 8px;"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path d="M17.9 13.1v-2h5v-3H9.1v3h5v2c-4.1.2-7.1 1-7.1 2s3 1.8 7.1 2v7.2h3.8v-7.2c4.1-.2 7.1-1 7.1-2s-3-1.8-7.1-2zm0 3.4v-.1c-.1 0-.7.1-1.9.1-1 0-1.7 0-2-.1v.1c-3.3-.1-5.7-.7-5.7-1.4 0-.7 2.4-1.3 5.7-1.4v2.3c.3 0 1 .1 2 .1 1.2 0 1.7 0 1.9-.1v-2.3c3.3.1 5.7.7 5.7 1.4 0 .7-2.4 1.3-5.7 1.4z" fill="#fff"/></svg></div><div class="w-info"><div class="w-name">Tether</div><div class="w-sub">USDT · TRC-20</div></div><div class="w-bal">${fmtDec(fU.balanceUsdt, 2)} <span style="font-size:12px;color:var(--dim);">≈ ${fmtDec(estRub, 2)} ₽</span></div></div>
            </div>`;
          document.getElementById('btnDeposit').onclick = () => { walletActionType = 'deposit'; document.getElementById('walletActionTitle').textContent = 'Пополнение'; document.querySelectorAll('#walletAssetSelect .seg-btn').forEach(b => b.classList.remove('active')); document.querySelector('#walletAssetSelect .seg-btn[data-val="RUB"]').classList.add('active'); document.getElementById('walletActionModal').classList.add('active'); toggleWalletFields(); };
          document.getElementById('btnWithdraw').onclick = () => { walletActionType = 'withdraw'; document.getElementById('walletActionTitle').textContent = 'Вывод'; document.querySelectorAll('#walletAssetSelect .seg-btn').forEach(b => b.classList.remove('active')); document.querySelector('#walletAssetSelect .seg-btn[data-val="RUB"]').classList.add('active'); document.getElementById('walletActionModal').classList.add('active'); toggleWalletFields(); };
        });
      }
    }

    document.querySelectorAll('#walletAssetSelect .seg-btn').forEach(btn => { btn.onclick = () => { document.querySelectorAll('#walletAssetSelect .seg-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); toggleWalletFields(); }; });
    function toggleWalletFields() { const c = document.querySelector('#walletAssetSelect .seg-btn.active').dataset.val, bG = document.getElementById('walletBankGroup'), uF = document.getElementById('usdtWithdrawFields'); if (c === 'RUB') { bG.style.display = 'block'; uF.style.display = 'none'; } else { bG.style.display = 'none'; uF.style.display = 'block'; } }

    let walletActionType = 'deposit';
    document.getElementById('walletActionSubmit')?.addEventListener('click', async () => {
      const u = API.user(); if (!u) { closeModal('walletActionModal'); document.getElementById('authModal').classList.add('active'); return; }
      const amt = document.getElementById('walletActionAmount')?.value, tg = document.getElementById('walletActionTg')?.value.trim(), curr = document.querySelector('#walletAssetSelect .seg-btn.active').dataset.val, com = document.getElementById('walletActionComment')?.value.trim();
      if (!amt || Number(amt) <= 0) return toast('Введите сумму', 'error'); if (!tg) return toast('Введите Telegram', 'error');
      let payload = { type: walletActionType === 'deposit' ? `deposit_${curr.toLowerCase()}` : `withdraw_${curr.toLowerCase()}`, amount: Number(amt), currency: curr, tg_username: tg, user_id: u.id, comment: com };
      if (curr === 'RUB') { payload.requisites = document.getElementById('walletBankSelect').value; } else { const addr = document.getElementById('walletAddress').value.trim(); if (!addr) return toast('Введите адрес', 'error'); payload.requisites = addr; payload.network = document.getElementById('walletNetwork').value; }
      const btn = document.getElementById('walletActionSubmit'); btn.disabled = true; btn.textContent = '...';
      try { await API.req('POST', '/requests/finance', payload); toast('Заявка создана!', 'success'); addNotification('Заявка создана', 'info'); closeModal('walletActionModal'); } catch(e) { toast(e.message || 'Ошибка', 'error'); } finally { btn.disabled = false; btn.textContent = 'Отправить'; }
    });

    async function loadMarket() {
      const filters = {}; const activeTab = document.querySelector('#marketSideTabs .seg-btn.active');
      if (activeTab && activeTab.dataset.side) filters.side = activeTab.dataset.side === 'buy' ? 'sell' : 'buy';
      const assetChip = document.querySelector('#filterAsset .icon-chip.active'); if (assetChip && assetChip.dataset.val) filters.asset = assetChip.dataset.val;
      const faceChip = document.querySelector('#filterFace .icon-chip.active'); if (faceChip && faceChip.dataset.val) filters.face_type = faceChip.dataset.val;
      const payChip = document.querySelector('#filterPayment .icon-chip.active'); if (payChip && payChip.dataset.val) filters.payment = payChip.dataset.val;
      const priceSort = document.querySelector('#filterPriceSort .icon-chip.active'); if (priceSort && priceSort.dataset.val) filters.price_sort = priceSort.dataset.val;
      const fMin = document.getElementById('filterMinAmount')?.value; const fMax = document.getElementById('filterMaxAmount')?.value;
      if (fMin) filters.min_amount = fMin; if (fMax) filters.max_amount = fMax;
      const list = document.getElementById('adsList'); if (!list) return; list.innerHTML = '<div class="empty-state">Загрузка...</div>';
      try { const { items } = await API.req('GET', '/ads?' + new URLSearchParams(filters)); list.innerHTML = items.length ? items.map(renderAd).join('') : '<div class="empty-state">Объявлений не найдено</div>'; bindAdButtons(); } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка загрузки</div>'; }
    }

    document.querySelectorAll('#marketSideTabs .seg-btn').forEach(tab => { tab.onclick = () => { document.querySelectorAll('#marketSideTabs .seg-btn').forEach(t => t.classList.remove('active')); tab.classList.add('active'); screenCache.market = false; loadMarket(); }; });
    document.querySelectorAll('#filterAsset .icon-chip').forEach(chip => { chip.onclick = () => { document.querySelectorAll('#filterAsset .icon-chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); screenCache.market = false; loadMarket(); }; });
    document.getElementById('openFilterBtn')?.addEventListener('click', () => document.getElementById('filterModal').classList.add('active'));
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => { closeModal('filterModal'); screenCache.market = false; loadMarket(); });

    document.querySelectorAll('#marketModeSwitch .seg-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#marketModeSwitch .seg-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
        const pW = document.getElementById('p2p-wrapper'), fC = document.getElementById('fast-exchange-content'), tC = document.querySelectorAll('.market-tab-content');
        if (btn.dataset.mode === 'p2p') {
          if (pW) pW.style.display = 'block'; if (fC) fC.style.display = 'none';
          tC.forEach(c => c.classList.remove('active')); const aT = document.querySelector('#marketTopTabs .seg-btn.active'); if (aT) document.getElementById('mtab-' + aT.dataset.mtab)?.classList.add('active'); else document.getElementById('mtab-p2p').classList.add('active');
        } else { if (pW) pW.style.display = 'none'; tC.forEach(c => c.classList.remove('active')); if (fC) fC.style.display = 'block'; initFastExchange(); }
      };
    });

    let exMode = 'buy', basePrice = 90, isPriceLoaded = false, fastExchangeInited = false;
    async function initFastExchange() {
      if (fastExchangeInited) return; fastExchangeInited = true;
      try { const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub'); const d = await r.json(); if (d?.tether?.rub) basePrice = d.tether.rub; } catch(e) { basePrice = 92.50; } isPriceLoaded = true;
      
      // ИСПРАВЛЕНИЕ КУРСА: Бай 1.01, Селл = Бай - 0.5%
      const buyRate = basePrice * 1.01; 
      const sellRate = buyRate * 0.995; 

      const updateExchangeUI = () => {
        const i = document.getElementById('exAmount'); if (!i) return; const a = parseFloat(i.value) || 0; let rate = 0, res = 0;
        if (exMode === 'buy') { 
          rate = buyRate; 
          res = a / rate; 
          document.getElementById('exInputLabel').textContent = 'Сумма в RUB'; 
          document.getElementById('exResultDisplay').textContent = `${fmtDec(res, 4)} USDT`; 
          const b = document.getElementById('exSubmitBtn'); b.style.background = 'var(--grn)'; b.textContent = 'Купить USDT'; 
        } else { 
          rate = sellRate; 
          res = a * rate; 
          document.getElementById('exInputLabel').textContent = 'Сумма в USDT'; 
          document.getElementById('exResultDisplay').textContent = `${fmtDec(res, 2)} RUB`; 
          const b = document.getElementById('exSubmitBtn'); b.style.background = 'var(--red)'; b.textContent = 'Продать USDT'; 
        }
        document.getElementById('exRateDisplay').textContent = `1 USDT = ${fmtDec(rate, 2)} ₽`;
      };
      const btnB = document.getElementById('exTabBuy'), btnS = document.getElementById('exTabSell'), inp = document.getElementById('exAmount');
      if (btnB) btnB.onclick = () => { exMode = 'buy'; btnB.classList.add('btn-primary'); btnB.style.background = 'var(--grn)'; btnB.style.border = 'none'; if (btnS) { btnS.classList.remove('btn-primary'); btnS.style.background = 'transparent'; btnS.style.border = '1px solid var(--glass-border)'; } if (inp) inp.value = ''; updateExchangeUI(); };
      if (btnS) btnS.onclick = () => { exMode = 'sell'; btnS.classList.add('btn-primary'); btnS.style.background = 'var(--red)'; btnS.style.border = 'none'; if (btnB) { btnB.classList.remove('btn-primary'); btnB.style.background = 'transparent'; btnB.style.border = '1px solid var(--glass-border)'; } if (inp) inp.value = ''; updateExchangeUI(); };
      if (inp) inp.oninput = updateExchangeUI;
      const subBtn = document.getElementById('exSubmitBtn');
      if (subBtn) subBtn.onclick = async () => {
        if (!isPriceLoaded) return toast('Загрузка курса...', 'info'); const a = parseFloat(inp.value); if (!a || a <= 0) return toast('Введите сумму', 'error'); if (!API.user()) { document.getElementById('authModal').classList.add('active'); return; }
        subBtn.disabled = true; subBtn.textContent = '...';
        try { const fRate = exMode === 'buy' ? buyRate : sellRate; await API.req('POST', '/exchange', { type: exMode, amount: a, rate: fRate }); toast('Заявка создана!', 'success'); inp.value = ''; updateExchangeUI(); screenCache.wallet = false; screenCache.profile = false; } catch(e) { toast(e.message || 'Ошибка', 'error'); } finally { subBtn.disabled = false; updateExchangeUI(); }
      };
      updateExchangeUI();
    }

    function renderAd(ad) {
      const isSell = ad.side === 'sell'; const faceLabel = ad.faceType === 'first' ? '1-е лицо' : '3-е лицо'; window._ads = window._ads || {}; window._ads[ad.id] = ad;
      const pays = (ad.paymentMethods || []).map(p => `<span class="pay-tag" style="background:rgba(255,255,255,0.1); border:1px solid var(--card-border); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; color:var(--txt); display:inline-flex; align-items:center; gap:4px;">${getPayIcon(p)} ${p}</span>`).join('');
      let avHtml = `<div class="avatar">${ad.displayName[0].toUpperCase()}</div>`; if (ad.avatarUrl) avHtml = `<div class="avatar"><img src="${ad.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${ad.displayName[0].toUpperCase()}'"></div>`;
      const mB = ad.isMerchant ? `<span class="badge-merchant" title="Merchant">${ICONS.merchant}</span>` : '', mkB = ad.isMaker ? `<span class="badge-maker" title="Maker">${ICONS.maker}</span>` : '', pB = ad.isPro ? `<span class="badge-pro" title="PRO">${ICONS.pro}</span>` : '';
      return `<div class="ad-card"><div class="ad-head" onclick="openPublicProfile(${ad.userId})">${avHtml}<div class="ad-user"><div class="ad-name">${ad.displayName} ${mB} ${mkB} ${pB} <span class="badge-face">${faceLabel}</span></div><div class="ad-meta"><span>★ ${ad.ratingAvg || '—'}</span> <span>${ad.dealsCompleted || 0} сделок</span></div></div></div><div class="ad-body"><div class="ad-price-block"><div class="ad-price">${fmtDec(ad.price, 2)} ₽</div><div class="ad-limits">Лимиты: ${fmt(ad.minRub)} - ${fmt(ad.maxRub)} RUB</div><div class="ad-amount">Доступно: ${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div>${pays ? `<div class="ad-pay-methods" style="justify-content:flex-start;margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${pays}</div>` : ''}</div><div class="ad-action"><button class="btn ${isSell ? 'btn-buy' : 'btn-sell'} btn-sm" data-ad-id="${ad.id}" style="min-width:80px;">${isSell ? 'Купить' : 'Продать'}</button></div></div></div>`;
    }

    function bindAdButtons() { document.querySelectorAll('[data-ad-id]').forEach(b => { b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; } openOrderModal(+b.dataset.adId); }; }); }

    window.openPublicProfile = async function(userId) {
      const m = document.getElementById('publicProfileModal'), c = document.getElementById('publicProfileContent'); if (!m || !c) return; c.innerHTML = '<div class="empty-state">Загрузка...</div>'; m.classList.add('active');
      try {
        const { user, stats, isFavorite } = await API.req('GET', '/users/' + userId);
        let avHtml = `<div class="avatar lg" style="margin:0 auto 8px;">${user.displayName[0].toUpperCase()}</div>`; if (user.avatarUrl) avHtml = `<div class="avatar lg" style="margin:0 auto 8px;"><img src="${user.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${user.displayName[0].toUpperCase()}'"></div>`;
        let fB = ''; if (API.user() && API.user().id !== user.id) fB = `<button class="btn-fav ${isFavorite ? 'active' : ''}" onclick="toggleFavorite(${user.id}, this)" style="position:absolute;top:15px;right:15px;font-size:24px;background:none;border:none;">${isFavorite ? '❤️' : '🤍'}</button>`;
        const mB = user.isMerchant ? `<span class="badge-merchant" style="margin-left:4px; width:20px; height:20px;" title="Merchant">${ICONS.merchant}</span>` : '', mkB = user.isMaker ? `<span class="badge-maker" style="margin-left:4px; width:20px; height:20px;" title="Maker">${ICONS.maker}</span>` : '', pB = user.isPro ? `<span class="badge-pro" style="margin-left:4px; width:20px; height:20px;" title="PRO">${ICONS.pro}</span>` : '';
        c.innerHTML = `${fB}<div style="text-align:center; margin-bottom: 16px; margin-top:8px;">${avHtml}<h2 style="font-size:20px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;justify-content:center;color:var(--txt);">${user.displayName} ${mB} ${mkB} ${pB}</h2><div style="font-size:13px;color:var(--dim);font-weight:600;">@${user.username}</div></div><div class="stats" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div class="glass-card" style="padding:12px;text-align:center;border-radius:12px;"><div style="font-size:12px;color:var(--dim);">Сделок</div><div style="font-size:16px;font-weight:800;color:var(--txt);">${stats.dealsTotal}</div></div><div class="glass-card" style="padding:12px;text-align:center;border-radius:12px;"><div style="font-size:12px;color:var(--dim);">Успешных</div><div style="font-size:16px;font-weight:800;color:var(--txt);">${stats.successRate !== null ? stats.successRate + '%' : '—'}</div></div></div><div id="publicReviewsList" style="margin-top:16px;">Загрузка отзывов...</div>`;
        loadPublicReviews(user.id);
      } catch(e) { c.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    };

    window.toggleFavorite = async function(targetId, btnEl) { if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; } try { const res = await API.req('POST', '/users/' + targetId + '/favorite'); if (res.isFavorite) { btnEl.innerHTML = '❤️'; toast('В избранном', 'success'); } else { btnEl.innerHTML = '🤍'; toast('Удалено', 'info'); } } catch(e) { toast('Ошибка', 'error'); } };
    async function loadPublicReviews(userId) { const list = document.getElementById('publicReviewsList'); if (!list) return; try { const data = await API.req('GET', '/reviews/user/' + userId); const items = data.items || []; list.innerHTML = `<div style="font-size:14px;font-weight:800;margin-bottom:8px;color:var(--txt);text-transform:uppercase;">Отзывы</div>` + (items.length ? items.map(r => `<div class="glass-card" style="padding:12px;margin-bottom:8px;border-radius:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong style="font-size:14px;color:var(--txt);">${r.author}</strong><span style="color:var(--txt);font-size:14px;">${'★'.repeat(r.rating)}</span></div><p style="font-size:13px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p></div>`).join('') : '<div class="empty-state" style="padding:10px;">Отзывов пока нет</div>'); } catch(e) { list.innerHTML = ''; } }

    document.querySelectorAll('#f-payments .pay-chip').forEach(c => { c.onclick = () => c.classList.toggle('active'); });
    document.querySelectorAll('#f-time .pay-chip').forEach(c => { c.onclick = () => { document.querySelectorAll('#f-time .pay-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); }; });
    document.querySelectorAll('#f-asset-select .icon-chip').forEach(c => { c.onclick = () => { document.querySelectorAll('#f-asset-select .icon-chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); const lbl = document.getElementById('f-asset-label'); if (lbl) lbl.textContent = c.dataset.val; }; });
    document.querySelectorAll('#f-side .seg-btn').forEach(b => { b.onclick = () => { if (b.disabled) return; document.querySelectorAll('#f-side .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });
    document.querySelectorAll('#f-face .seg-btn').forEach(b => { b.onclick = () => { document.querySelectorAll('#f-face .seg-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; });

    document.getElementById('createBtn')?.addEventListener('click', async () => {
      const errEl = document.getElementById('createError'); errEl.textContent = ''; const u = API.user();
      if (!u) { errEl.textContent = 'Войдите в аккаунт'; setTimeout(() => document.getElementById('authModal')?.classList.add('active'), 500); return; }
      const pays = [...document.querySelectorAll('#f-payments .pay-chip.active')].map(c => c.dataset.val); if (!pays.length) { errEl.textContent = 'Выберите способ оплаты'; return; }
      const pr = document.getElementById('f-price')?.value, am = document.getElementById('f-amount')?.value, mn = document.getElementById('f-min')?.value, mx = document.getElementById('f-max')?.value;
      if (!pr || !am || !mn || !mx) { errEl.textContent = 'Заполните поля'; return; }
      const time = document.querySelector('#f-time .pay-chip.active')?.dataset.val || 30, side = document.querySelector('#f-side .seg-btn.active')?.dataset.val, asset = document.querySelector('#f-asset-select .icon-chip.active')?.dataset.val;
      if (side === 'buy') { const isStaff = ['admin', 'owner', 'deputy'].includes(u.role); if (!isStaff && !u.isMaker && !u.isMerchant) { toast('Только мейкеры и мерчанты могут создавать объявления о покупке', 'error'); return; } if (u.balanceRub < Number(mx)) { toast(`Недостаточно RUB на балансе (Нужно: ${fmt(mx)} ₽)`, 'error'); return; } }
      else if (side === 'sell') { if (u.balanceUsdt < Number(am)) { toast(`Недостаточно ${asset} на балансе (Нужно: ${fmtDec(am, 2)})`, 'error'); return; } }
      const btn = document.getElementById('createBtn'); btn.disabled = true; btn.textContent = '...';
      try {
        await API.req('POST', '/ads', { side: side, face_type: document.querySelector('#f-face .seg-btn.active')?.dataset.val, asset: asset, price: pr, amount_total: am, min_rub: mn, max_rub: mx, payment_methods: pays, terms: document.getElementById('f-terms')?.value || '', payment_time: Number(time) });
        toast('Объявление опубликовано!', 'success'); addNotification('Вы создали новое объявление.', 'success'); screenCache.market = false; screenCache.home = false; show('market'); setTimeout(() => document.querySelector('.seg-btn[data-mtab="ads"]')?.click(), 100);
      } catch (err) { const map = { max_exceeds_total: 'Макс. лимит больше объема', min_gt_max: 'Мин больше макс', bad_amounts: 'Проверьте числа' }; errEl.textContent = map[err.code] || err.message; } finally { btn.disabled = false; btn.textContent = 'Опубликовать'; }
    });

    async function loadOrders(filter) {
      const list = document.getElementById('ordersList'); if (!list) return; if (!API.user()) { list.innerHTML = '<div class="empty-state">Войдите</div>'; return; }
      try {
        const { items } = await API.req('GET', '/orders/my?status=' + filter);
        const sc = { pending: 'var(--yellow)', accepted: 'var(--blue)', paid: 'var(--grn)', completed: 'var(--grn)', cancelled: 'var(--red)', declined: 'var(--red)', dispute: 'var(--gold)' };
        list.innerHTML = items.length ? items.map(o => `<div class="ad-card" style="cursor:pointer;border-left:4px solid ${sc[o.status] || 'var(--dim)'}; padding:16px; margin-bottom:12px;" data-order-id="${o.id}"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong style="font-family:Inter,monospace;font-size:15px;color:var(--txt);">#${o.publicId}</strong><span style="color:${sc[o.status] || 'var(--txt)'};font-size:12px;font-weight:800">${o.statusLabel}</span></div><div class="ad-body"><div><div style="font-size:12px;color:var(--dim);">Сумма</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${fmtDec(o.amountRub, 2)} ₽</div></div><div><div style="font-size:12px;color:var(--dim);">Актив</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${fmtDec(o.amountAsset, 2)} ${o.asset}</div></div></div><div style="font-size:12px;color:var(--dim);display:flex;justify-content:space-between;font-weight:600;margin-top:12px;"><span>${new Date(o.createdAt).toLocaleString('ru-RU')}</span><span>${o.buyer.displayName} ↔ ${o.seller.displayName}</span></div></div>`).join('') : '<div class="empty-state">Ордеров нет</div>';
        list.querySelectorAll('[data-order-id]').forEach(el => { el.onclick = () => openOrderPage(+el.dataset.orderId); });
      } catch(e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    document.querySelectorAll('#ordersFilter .seg-btn').forEach(c => { c.onclick = () => { document.querySelectorAll('#ordersFilter .seg-btn').forEach(x => x.classList.remove('active')); c.classList.add('active'); loadOrders(c.dataset.val); }; });

    async function openOrderPage(orderId) {
      if (!API.user()) { document.getElementById('authModal')?.classList.add('active'); return; } previousScreen = 'market'; show('order');
      const container = document.getElementById('orderDetailContent'); container.innerHTML = '<div class="empty-state">Загрузка...</div>';
      try {
        const { order, history, terms } = await API.req('GET', '/orders/' + orderId); renderOrderPage(order, history, terms);
        if (window.orderPollInterval) clearInterval(window.orderPollInterval);
        window.orderPollInterval = setInterval(async () => { try { const freshData = await API.req('GET', '/orders/' + orderId); if (freshData.order.status !== order.status) { renderOrderPage(freshData.order, freshData.history, freshData.terms); toast(`Статус обновлен: ${freshData.order.statusLabel}`, 'info'); addNotification(`Статус ордера #${freshData.order.publicId} изменился на: ${freshData.order.statusLabel}`, 'info'); } } catch(e) {} }, 5000);
      } catch (e) { container.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }
    window.openAdminOrder = function(orderId) { previousScreen = 'admin'; openOrderPage(orderId); };
    window.viewReceipt = function(data) { if (!data) return toast('Чек не прикреплен', 'error'); const content = document.getElementById('receiptViewContent'); content.innerHTML = `<img src="${data}" style="max-width:100%; max-height:80vh; border-radius:8px;">`; document.getElementById('receiptViewModal').classList.add('active'); };

    function renderOrderPage(order, history, terms) {
      const u = API.user(), isBuyer = order.buyer_id === u.id, isSeller = order.seller_id === u.id, isAdmin = ['admin', 'owner', 'deputy'].includes(u.role), isAdCreator = u.id === order.adUserId;
      const sc = { pending: '#FFD60A', accepted: '#3b82f6', paid: '#22c55e', completed: '#22c55e', cancelled: '#ef4444', declined: '#ef4444', dispute: '#D4AF37' };
      let progress = order.status === 'accepted' ? 40 : order.status === 'paid' ? 70 : order.status === 'completed' ? 100 : ['cancelled', 'dispute', 'declined'].includes(order.status) ? 0 : 20;
      const counterparty = isBuyer ? order.seller : order.buyer; const cpRole = isBuyer ? 'Продавец' : 'Покупатель'; let actionsHtml = '';
      
      if (order.status === 'pending') { if (isAdCreator) actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="doAction(${order.id},'accept')" style="background:var(--grn);color:#fff;border:none;height:44px;font-size:14px;">Принять</button><button class="btn btn-ghost btn-sm" style="color:var(--red);border:1px solid var(--red);height:44px;font-size:14px;" onclick="doAction(${order.id},'decline')">Отклонить</button></div>`; else actionsHtml = `<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:14px;margin-bottom:10px;font-weight:600;">Ожидайте подтверждения</div><button class="btn btn-ghost btn-block btn-sm" style="color:var(--red);height:44px;font-size:14px;" onclick="doAction(${order.id},'cancel')">Отменить</button>`; } 
      else if (order.status === 'accepted') { if (isBuyer) actionsHtml = `<div style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);border-radius:12px;padding:16px;text-align:center;margin-bottom:12px;"><div style="font-size:13px;color:var(--dim);margin-bottom:8px;">Время на оплату:</div><div id="paymentTimerDisplay" style="font-size:24px;font-weight:900;color:var(--yellow);margin-bottom:12px;">--:--</div><input type="file" id="receiptFile" style="display:none;" accept="image/*,application/pdf"><button class="btn btn-primary btn-sm" onclick="document.getElementById('receiptFile').click()" style="margin-bottom:8px;height:36px;font-size:13px;">Прикрепить чек</button><div id="fileName" style="font-size:12px;color:var(--grn);margin-bottom:12px;font-weight:600;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><button class="btn btn-primary btn-sm" onclick="doAction(${order.id},'paid')" style="height:44px;font-size:14px;">Я оплатил</button><button class="btn btn-ghost btn-sm" style="color:var(--red);height:44px;font-size:14px;" onclick="doAction(${order.id},'cancel')">Отменить</button></div></div>`; else actionsHtml = `<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:14px;margin-bottom:10px;font-weight:600;">Ожидайте оплаты</div><button class="btn btn-ghost btn-block btn-sm" style="color:var(--gold);height:44px;font-size:14px;" onclick="doAction(${order.id},'dispute')">Спор</button>`; } 
      else if (order.status === 'paid') { if (isSeller) actionsHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="doAction(${order.id},'confirm')" style="height:44px;font-size:14px;">Оплата получена</button><button class="btn btn-ghost btn-sm" style="color:var(--red);height:44px;font-size:14px;" onclick="doAction(${order.id},'dispute')">Спор</button></div>`; else actionsHtml = `<div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;padding:14px;text-align:center;color:var(--dim);font-size:14px;margin-bottom:10px;font-weight:600;">Ожидайте подтверждения</div><button class="btn btn-ghost btn-block btn-sm" style="color:var(--red);height:44px;font-size:14px;" onclick="doAction(${order.id},'dispute')">Спор</button>`; } 
      else if (order.status === 'completed') actionsHtml = `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:14px;text-align:center;color:var(--grn);font-size:15px;font-weight:800;margin-bottom:12px">✓ Сделка завершена</div><button class="btn btn-primary btn-block btn-sm" onclick="openReview(${order.id})" style="margin-bottom:16px;height:44px;font-size:14px;">Оставить отзыв</button>`; 
      else if (['cancelled', 'declined'].includes(order.status)) actionsHtml = `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;text-align:center;color:var(--red);font-size:15px;margin-bottom:16px;font-weight:800;">Заявка ${order.status === 'declined' ? 'отклонена' : 'отменена'}</div>`; 
      else if (order.status === 'dispute') { if (isAdmin) actionsHtml = `<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:15px;margin-bottom:12px;font-weight:800;">Решите спор:</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px"><button class="btn btn-primary btn-sm" onclick="resolveDispute(${order.id}, 'completed')" style="height:44px;font-size:14px;">Завершить</button><button class="btn btn-ghost btn-sm" style="color:var(--red);height:44px;font-size:14px;" onclick="resolveDispute(${order.id}, 'cancelled')">Отменить</button></div>`; else actionsHtml = `<div style="background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);border-radius:12px;padding:14px;text-align:center;color:var(--gold);font-size:15px;margin-bottom:16px;font-weight:800;">Спор рассматривается</div>`; }

      let adminReceiptHtml = ''; if ((isAdmin || isSeller) && ['paid', 'dispute'].includes(order.status) && order.receipt_data) adminReceiptHtml = `<div class="glass-card" style="padding:14px;margin-bottom:16px;border:1px dashed var(--primary);"><div style="display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;color:var(--dim);font-weight:700;margin-bottom:4px;">Чек об оплате</div><div style="font-size:14px;font-weight:800;color:var(--txt);">Прикреплен</div></div><button class="btn btn-primary btn-sm" onclick="viewReceipt('${order.receipt_data}')" style="height:32px;font-size:12px;">Посмотреть</button></div></div>`;
      const timelineHtml = (history || []).map(h => `<div style="display:flex;gap:12px;padding:8px 0"><div style="width:12px;height:12px;border-radius:50%;background:var(--txt);flex-shrink:0;margin-top:4px"></div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:var(--txt);">${h.note || h.status}</div><div style="font-size:12px;color:var(--dim);font-weight:600;">${new Date(h.at).toLocaleString('ru-RU')}</div></div></div>`).join('');
      
      document.getElementById('orderDetailContent').innerHTML = `<div class="glass-card" style="padding: 20px; margin-bottom: 16px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:13px;color:var(--dim);font-family:monospace;font-weight:700;">#${order.public_id}</div><div style="background:var(--glass-bg);color:${sc[order.status]};font-size:13px;font-weight:800;padding:4px 10px;border-radius:6px">${order.statusLabel}</div></div><h2 style="font-size:22px;font-weight:900;margin-bottom:6px;color:var(--txt)">${isBuyer ? 'Покупка ' : 'Продажа '}${order.asset}</h2><div style="font-size:32px;font-weight:900;color:var(--txt);font-variant-numeric:tabular-nums;">${fmtDec(order.amount_rub, 2)}<span style="font-size:16px;color:var(--dim);font-weight:600;margin-left:4px">₽</span></div><div style="width:100%;height:6px;background:var(--glass-border);border-radius:3px;margin-top:16px;overflow:hidden"><div style="height:100%;width:${progress}%;background:${sc[order.status]};transition:0.3s"></div></div></div><div class="glass-card" style="padding:14px;margin-bottom:16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="openPublicProfile(${counterparty.id})"><div style="display:flex;align-items:center;gap:12px;"><div class="avatar" style="width:40px;height:40px;font-size:14px;">${counterparty.avatarUrl ? `<img src="${counterparty.avatarUrl}">` : counterparty.displayName[0].toUpperCase()}</div><div><div style="font-size:12px;color:var(--dim);font-weight:600;">${cpRole}</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${counterparty.displayName}</div></div></div><button class="btn btn-ghost btn-sm" style="border:1px solid var(--glass-border);height:32px;font-size:12px;">Профиль</button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px"><div class="glass-card" style="padding:14px;"><div style="font-size:12px;color:var(--dim);font-weight:700;margin-bottom:4px;">Количество</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${fmtDec(order.amount_asset, 2)} ${order.asset}</div></div><div class="glass-card" style="padding:14px;"><div style="font-size:12px;color:var(--dim);font-weight:700;margin-bottom:4px;">Курс</div><div style="font-size:15px;font-weight:800;color:var(--txt);">${fmtDec(order.price, 2)} ₽</div></div></div><div class="glass-card" style="padding:16px;margin-bottom:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><div style="font-size: 12px; font-weight: 800; color: var(--dim); text-transform: uppercase;">Время на оплату</div><div style="font-size: 13px; font-weight: 800; color: var(--yellow);">${order.paymentTime} мин</div></div><div style="font-size: 12px; font-weight: 800; color: var(--dim); text-transform: uppercase; margin-bottom: 6px;">Условия</div><div style="font-size: 14px; color: var(--txt); line-height: 1.4; font-weight: 500;">${terms || 'Стандартные условия.'}</div></div>${adminReceiptHtml}${actionsHtml}<button style="width:100%;display:flex;align-items:center;justify-content:space-between;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:14px;margin-bottom:16px;color:var(--txt);font-size:14px; cursor:pointer;" onclick="openChatModal(${order.id})"><div style="display:flex;align-items:center;gap:12px"><div class="avatar" style="width:32px;height:32px;font-size:16px">💬</div><div style="text-align:left;"><div style="font-weight:800; color:var(--txt);">Чат по сделке</div></div></div></button><div class="glass-card" style="padding:16px"><div style="font-size:13px;font-weight:800;margin-bottom:12px;color:var(--dim);text-transform:uppercase">История</div>${timelineHtml}</div>`;

      if (order.status === 'accepted') { const tEl = document.getElementById('paymentTimerDisplay'); if (tEl) { const cAt = new Date(order.createdAt).getTime(), exp = cAt + (order.paymentTime * 60000); if (window.orderTimerInterval) clearInterval(window.orderTimerInterval); window.orderTimerInterval = setInterval(() => { const diff = exp - Date.now(); if (diff <= 0) { clearInterval(window.orderTimerInterval); tEl.textContent = '00:00'; tEl.style.color = 'var(--red)'; } else { tEl.textContent = `${Math.floor(diff/60000).toString().padStart(2,'0')}:${Math.floor((diff%60000)/1000).toString().padStart(2,'0')}`; } }, 1000); } }
      
      let tempReceiptData = null; const fI = document.getElementById('receiptFile'); if (fI) { fI.onchange = async (e) => { const f = e.target.files[0]; if (f) { document.getElementById('fileName').textContent = 'Загрузка...'; try { tempReceiptData = await fileToBase64(f); document.getElementById('fileName').textContent = '✓ Чек прикреплен'; toast('Чек прикреплен!', 'success'); } catch(err) { toast('Ошибка', 'error'); } } }; }
      
      window.doAction = async function(oId, action) {
        if (action === 'cancel' && !await confirmAsync('Отмена', 'Отменить заявку?', 'Да')) return; if (action === 'confirm' && !await confirmAsync('Подтверждение', 'Подтвердить оплату?', 'Да')) return; if (action === 'dispute' && !await confirmAsync('Спор', 'Вы уверены?', 'Да')) return; if (action === 'decline' && !await confirmAsync('Отклонение', 'Отклонить заявку?', 'Да')) return;
        try { const body = {}; if (action === 'paid' && tempReceiptData) body.receipt_data = tempReceiptData; await API.req('POST', `/orders/${oId}/${action}`, body); toast('Статус обновлён', 'success'); const msgMap = { accept: 'Заявка принята', decline: 'Заявка отклонена', paid: 'Оплата отправлена', confirm: 'Сделка завершена', cancel: 'Заявка отменена', dispute: 'Спор открыт' }; addNotification(`Ордер #${order.publicId}: ${msgMap[action] || 'Действие'}`, 'info'); screenCache.orders = false; screenCache.wallet = false; openOrderPage(oId); } catch (e) { toast(e.message, 'error'); }
      };
    }
    window.resolveDispute = async function(orderId, resolution) { if (!await confirmAsync('Решение спора', 'Вы уверены?', 'Да')) return; try { await API.req('POST', `/orders/${orderId}/resolve`, { resolution }); toast('Спор решен', 'success'); openOrderPage(orderId); } catch (e) { toast(e.message, 'error'); } };

    let currentChatOrderId = null, chatPollTimer = null;
    window.openChatModal = async function(orderId) { currentChatOrderId = orderId; document.getElementById('chatModal')?.classList.add('active'); await loadChat(orderId, true); if (chatPollTimer) clearInterval(chatPollTimer); chatPollTimer = setInterval(() => loadChat(orderId, false), 3000); };
    window.closeChatModal = function() { document.getElementById('chatModal')?.classList.remove('active'); if (chatPollTimer) clearInterval(chatPollTimer); chatPollTimer = null; };
    document.getElementById('chatAttachBtn')?.addEventListener('click', () => document.getElementById('chatFileInput').click());
    document.getElementById('chatFileInput')?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f || !currentChatOrderId) return; try { const b64 = await fileToBase64(f); await API.req('POST', '/chat/' + currentChatOrderId, { media_data: b64, media_type: f.type, text: '' }); loadChat(currentChatOrderId, false); e.target.value = ''; } catch(err) { toast('Ошибка файла', 'error'); } });
    document.getElementById('chatSend')?.addEventListener('click', async () => { const i = document.getElementById('chatInput'), t = i?.value.trim(); if (!t || !currentChatOrderId) return; i.value = ''; try { await API.req('POST', '/chat/' + currentChatOrderId, { text: t }); loadChat(currentChatOrderId, false); } catch (e) { toast(e.message, 'error'); } });
    document.getElementById('chatInput')?.addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('chatSend')?.click(); });

    async function loadChat(orderId, reset = true) {
      try {
        const { items } = await API.req('GET', '/chat/' + orderId); const body = document.getElementById('chatBody'); if (!body) return;
        if (reset) body.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--dim);font-weight:600;margin-bottom:12px;">Сделка создана.</div>';
        const rendered = body.querySelectorAll('[data-msg-id]').length;
        items.slice(rendered).forEach(m => {
          const div = document.createElement('div'); div.className = 'msg' + (m.isMine ? ' me' : ''); div.dataset.msgId = m.id; let mHtml = '';
          if (m.media_data && m.media_type) { if (m.media_type.startsWith('image/')) mHtml = `<img src="${m.media_data}" style="max-width:100%; border-radius:8px; margin-bottom:6px; cursor:pointer;" onclick="viewReceipt('${m.media_data}')">`; else if (m.media_type.startsWith('video/')) mHtml = `<video src="${m.media_data}" controls style="max-width:100%; border-radius:8px; margin-bottom:6px;"></video>`; else if (m.media_type === 'application/pdf') mHtml = `<a href="${m.media_data}" download="document.pdf" style="display:inline-block; padding:10px; background:var(--btn-glass-bg); color:var(--txt); border-radius:10px; text-decoration:none; font-size:13px; margin-bottom:6px;">📄 Скачать PDF</a>`; }
          div.innerHTML = `<div class="avatar" style="width:32px;height:32px;font-size:14px">${m.senderUsername[0].toUpperCase()}</div><div><div class="msg-bubble" style="font-size:14px; padding:10px 14px;">${mHtml}${m.text ? m.text.replace(/</g, '&lt;') : ''}</div><div style="font-size:11px;color:var(--dim);margin-top:4px;font-weight:600; text-align: ${m.isMine ? 'right' : 'left'}">${new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
          body.appendChild(div);
        });
        body.scrollTop = body.scrollHeight;
      } catch (e) {}
    }

    let currentReviewOrderId = null, currentRating = 5;
    window.openReview = function(orderId) { currentReviewOrderId = orderId; currentRating = 5; document.getElementById('reviewComment').value = ''; document.getElementById('reviewError').textContent = ''; updateStars(); document.getElementById('reviewModal')?.classList.add('active'); };
    function updateStars() { document.querySelectorAll('#ratingStars .rating-star').forEach(s => s.classList.toggle('active', +s.dataset.r <= currentRating)); }
    document.querySelectorAll('#ratingStars .rating-star').forEach(s => { s.onclick = () => { currentRating = +s.dataset.r; updateStars(); document.querySelectorAll('#ratingStars .rating-star').forEach(el => el.style.color = +el.dataset.r <= currentRating ? '#FFD60A' : 'var(--dim)'); }; });
    document.getElementById('reviewSubmitBtn')?.addEventListener('click', async () => { const btn = document.getElementById('reviewSubmitBtn'); btn.disabled = true; try { await API.req('POST', '/reviews', { order_id: currentReviewOrderId, rating: currentRating, comment: document.getElementById('reviewComment')?.value || '' }); toast('Отзыв добавлен!', 'success'); closeModal('reviewModal'); screenCache.profile = false; loadProfile(); } catch (e) { document.getElementById('reviewError').textContent = e.message; } finally { btn.disabled = false; } });

    let profileTab = 'history'; 
    async function loadProfile() {
      const u = API.user(), content = document.getElementById('profileContent');
      if (!u) { content.innerHTML = '<div class="empty-state"><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'authModal\').classList.add(\'active\')">Войти</button></div>'; return; }
      try {
        const { user, stats } = await API.req('GET', '/users/me'); localStorage.setItem('vexo_user', JSON.stringify(user));
        const pB = user.isPro ? `<span class="badge-pro" title="PRO">${ICONS.pro}</span>` : '', mB = user.isMerchant ? `<span class="badge-merchant" title="Merchant">${ICONS.merchant}</span>` : '', mkB = user.isMaker ? `<span class="badge-maker" title="Maker">${ICONS.maker}</span>` : '';
        const sR = stats.successRate !== null ? `${stats.successRate}%` : '0%', rA = stats.ratingAvg !== null ? stats.ratingAvg : '—';
        let cHtml = ''; if (profileTab === 'history') cHtml = '<div id="myHistoryList"><div class="empty-state">Загрузка...</div></div>'; else if (profileTab === 'reviews') cHtml = '<div id="myReviewsList"><div class="empty-state">Загрузка...</div></div>'; else if (profileTab === 'requests') cHtml = '<div id="myRequestsList"><div class="empty-state">Загрузка...</div></div>';
        let avHtml = `<div class="avatar lg">${user.displayName[0].toUpperCase()}</div>`; if (user.avatarUrl) avHtml = `<div class="avatar lg"><img src="${user.avatarUrl}" onerror="this.style.display='none'; this.parentElement.innerHTML='${user.displayName[0].toUpperCase()}'"></div>`;
        
        content.innerHTML = `
          <div class="glass-card profile-header-card">
            <div class="profile-info-left">
              ${avHtml}
              <div style="flex:1;min-width:0">
                <h2 class="profile-name-row">${user.displayName} ${mB} ${mkB} ${pB}</h2>
                <div style="font-size:13px;color:var(--dim);font-weight:600;">@${user.username} (ID: ${user.id})</div>
              </div>
            </div>
            <button class="profile-settings-btn" onclick="openSettings()">⚙️</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:14px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Сделок</div><div style="font-size:18px;font-weight:800;">${stats.dealsTotal}</div></div>
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:14px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Успешных</div><div style="font-size:18px;font-weight:800;">${sR}</div></div>
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:14px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Отзывов</div><div style="font-size:18px;font-weight:800;">${stats.reviewsCount}</div></div>
            <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:14px;text-align:center;"><div style="font-size:12px;color:var(--dim);font-weight:600;margin-bottom:4px;">Рейтинг</div><div style="font-size:18px;font-weight:800;">${rA}</div></div>
          </div>
          <div class="profile-tabs">
            <button class="profile-tab ${profileTab === 'history' ? 'active' : ''}" onclick="switchProfileTab('history')">История</button>
            <button class="profile-tab ${profileTab === 'reviews' ? 'active' : ''}" onclick="switchProfileTab('reviews')">Отзывы</button>
            <button class="profile-tab ${profileTab === 'requests' ? 'active' : ''}" onclick="switchProfileTab('requests')">Заявки</button>
          </div>
          <div id="profileTabContent">${cHtml}</div>
          <div style="margin-top:24px"><button class="btn btn-ghost btn-block btn-sm" onclick="logoutAction()" style="color:#ef4444 !important;border:1px solid rgba(239,68,68,.3) !important; height:44px; font-size:14px;">Выйти</button></div>`;
        if (profileTab === 'history') loadMyHistory(); else if (profileTab === 'reviews') loadMyReviews(); else if (profileTab === 'requests') loadMyRequests();
      } catch (e) { content.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }
    window.switchProfileTab = function(tab) { profileTab = tab; loadProfile(); };

    async function loadMyAds() {
      const list = document.getElementById('myAdsList'); if (!list) return; if (!API.user()) { list.innerHTML = '<div class="empty-state">Войдите</div>'; return; }
      try { const { items } = await API.req('GET', '/ads/my'); const act = items.filter(a => a.active); list.innerHTML = act.length ? act.map(ad => `<div class="glass-card" style="margin-bottom:12px; padding:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><strong style="font-size:16px;">${ad.side === 'sell' ? 'Продажа' : 'Покупка'} ${ad.asset}</strong><span style="color:var(--grn);font-size:12px;font-weight:700;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;">Активно</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;"><div><div style="font-size:12px;color:var(--dim);font-weight:600;">Курс</div><div style="font-size:15px;font-weight:800;">${fmt(ad.price)} ₽</div></div><div><div style="font-size:12px;color:var(--dim);font-weight:600;">Остаток</div><div style="font-size:15px;font-weight:800;">${fmtDec(ad.amountLeft, 2)} ${ad.asset}</div></div></div><div style="display:flex;gap:8px;"><button class="btn btn-ghost btn-sm" style="flex:1; border:1px solid var(--glass-border); height:40px; font-size:13px;" onclick="toggleAdStatus(${ad.id}, ${ad.active})">Снять</button><button class="btn btn-primary btn-sm" style="flex:1; height:40px; font-size:13px;" onclick="openEditAdModal(${ad.id})">Изменить</button><button class="btn btn-ghost btn-sm" style="width:40px; border:1px solid var(--red); height:40px; color: var(--red); padding:0;" onclick="deleteAd(${ad.id})">🗑</button></div></div>`).join('') : '<div class="empty-state">Нет активных объявлений</div>'; } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }
    window.deleteAd = async function(adId) { if (!await confirmAsync('Удаление', 'Удалить объявление? Действие необратимо.', 'Удалить')) return; try { await API.req('DELETE', '/ads/' + adId); toast('Удалено', 'success'); loadMyAds(); screenCache.market = false; } catch(e) { toast(e.message || 'Ошибка', 'error'); } };
    window.toggleAdStatus = async function(adId, curr) { try { await API.req('PATCH', '/ads/' + adId, { active: !curr }); toast(curr ? 'Снято' : 'Активировано', 'success'); screenCache.market = false; loadMyAds(); } catch(e) { toast('Ошибка', 'error'); } };

    window.openEditAdModal = function(adId) {
      API.req('GET', '/ads/' + adId).then(ad => {
        document.getElementById('edit-price').value = ad.price; document.getElementById('edit-amount').value = ad.amountTotal; document.getElementById('edit-min').value = ad.minRub; document.getElementById('edit-max').value = ad.maxRub; document.getElementById('edit-terms').value = ad.terms || '';
        const pB = document.getElementById('edit-payments'); pB.innerHTML = ''; ['СБП', 'Тинькофф', 'Сбербанк', 'Альфа-Банк'].forEach(p => { const el = document.createElement('div'); el.className = 'pay-chip' + (ad.paymentMethods.includes(p) ? ' active' : ''); el.innerHTML = `${getPayIcon(p)} ${p}`; el.style.display = 'inline-flex'; el.style.alignItems = 'center'; el.style.gap = '4px'; el.onclick = () => el.classList.toggle('active'); pB.appendChild(el); });
        document.getElementById('editError').textContent = '';
        document.getElementById('editSaveBtn').onclick = async () => {
          const btn = document.getElementById('editSaveBtn'); btn.disabled = true; btn.textContent = '...';
          const sel = [...pB.querySelectorAll('.pay-chip.active')].map(c => c.dataset.val || c.textContent.trim()); if (!sel.length) { document.getElementById('editError').textContent = 'Выберите способ оплаты'; btn.disabled = false; btn.textContent = 'Сохранить'; return; }
          try { await API.req('PATCH', '/ads/' + adId, { price: document.getElementById('edit-price').value, amount_total: document.getElementById('edit-amount').value, min_rub: document.getElementById('edit-min').value, max_rub: document.getElementById('edit-max').value, payment_methods: sel, terms: document.getElementById('edit-terms').value }); toast('Обновлено!', 'success'); closeModal('editAdModal'); screenCache.market = false; loadMyAds(); } catch (err) { document.getElementById('editError').textContent = err.message; } finally { btn.disabled = false; btn.textContent = 'Сохранить'; }
        };
        document.getElementById('editAdModal').classList.add('active');
      });
    };

    async function loadMyHistory() { const list = document.getElementById('myHistoryList'); if (!list) return; try { const { items } = await API.req('GET', '/orders/my?status=completed'); list.innerHTML = items.length ? items.map(o => `<div class="glass-card" style="margin-bottom:12px; border-left:4px solid var(--grn); padding:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong style="font-size:15px;">#${o.publicId}</strong><span style="color:var(--grn);font-size:12px;font-weight:700;">Завершен</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div><div style="font-size:12px;color:var(--dim);font-weight:600;">Сумма</div><div style="font-size:15px;font-weight:800;">${fmtDec(o.amountRub, 2)} ₽</div></div><div><div style="font-size:12px;color:var(--dim);font-weight:600;">Актив</div><div style="font-size:15px;font-weight:800;">${fmtDec(o.amountAsset, 2)} ${o.asset}</div></div></div></div>`).join('') : '<div class="empty-state">Пусто</div>'; } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; } }
    async function loadMyReviews() { const list = document.getElementById('myReviewsList'); if (!list) return; try { const u = API.user(); const data = await API.req('GET', '/reviews/user/' + u.id); const items = data.items || []; list.innerHTML = items.length ? items.map(r => `<div class="glass-card" style="margin-bottom:12px; padding:14px;"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong style="font-size:14px;">${r.author}</strong><span style="color:var(--yellow);font-size:14px;">${'★'.repeat(r.rating)}</span></div><p style="font-size:13px;color:var(--dim);font-weight:500;">${r.comment || 'Без комментария'}</p></div>`).join('') : '<div class="empty-state">Нет отзывов</div>'; } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; } }

    async function loadMyRequests() {
      const list = document.getElementById('myRequestsList'); if (!list) return;
      try {
        const { items } = await API.req('GET', '/requests/my'); const sM = { pending: { l: 'Обработка', c: 'var(--yellow)' }, approved: { l: 'Выплачено', c: 'var(--grn)' }, rejected: { l: 'Отказ', c: 'var(--red)' }, cancelled: { l: 'Отменено', c: 'var(--dim)' }, completed: { l: 'Выполнено', c: 'var(--grn)' } };
        list.innerHTML = items.length ? items.map(r => {
          const st = sM[r.status] || { l: r.status, c: 'var(--txt)' }; let tL = r.type;
          if (r.type === 'exchange') tL = r.details?.exchange_type === 'buy' ? 'Покупка USDT' : 'Продажа USDT'; if (r.type === 'deposit_rub') tL = 'Пополнение RUB'; if (r.type === 'withdraw_rub') tL = 'Вывод RUB'; if (r.type === 'deposit_usdt') tL = 'Пополнение USDT'; if (r.type === 'withdraw_usdt') tL = 'Вывод USDT';
          const rD = encodeURIComponent(JSON.stringify(r));
          return `<div class="glass-card" style="margin-bottom:12px; border-left:4px solid ${st.c}; padding:16px; cursor:pointer;" onclick="openRequestDetails('${rD}')"><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><strong style="font-size:15px; color:var(--txt);">#${r.id + 1000} <span style="font-size:12px;color:var(--dim);font-weight:500;">${tL}</span></strong><span style="color:${st.c}; font-size:12px; font-weight:800; text-transform:uppercase;">${st.l}</span></div><div style="display:flex;justify-content:space-between;align-items:flex-end;"><div style="font-size:14px; color:var(--txt); font-weight:700;">${fmtDec(r.amount, 2)} ${r.currency}</div><div style="font-size:11px; color:var(--dim);">${new Date(r.created_at).toLocaleDateString('ru-RU')}</div></div></div>`;
        }).join('') : '<div class="empty-state">Нет заявок</div>';
      } catch (e) { list.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    window.openRequestDetails = function(encodedData) {
      const r = JSON.parse(decodeURIComponent(encodedData)), d = r.details || {}, m = document.getElementById('requestDetailModal'), c = document.getElementById('requestDetailContent');
      const sM = { pending: { l: 'Обработка', c: '#f59e0b' }, approved: { l: 'Выплачено', c: '#10b981' }, rejected: { l: 'Отказ', c: '#ef4444' }, cancelled: { l: 'Отменено', c: '#9ca3af' }, completed: { l: 'Выполнено', c: '#10b981' } };
      const st = sM[r.status] || sM.pending; let tL = r.type.toUpperCase().replace('_', ' '); if (r.type === 'exchange') tL = 'ОБМЕН';
      c.innerHTML = `
        <div class="receipt-wrapper">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"><div style="font-size:14px; font-weight:800; color:${st.c}; background:${st.c}15; padding:4px 10px; border-radius:8px;">${st.l}</div><div style="font-size:13px; font-weight:800; color:#6b7280;">#${r.id + 1000}</div></div>
          <div style="margin-bottom: 4px;"><div style="font-size:12px; color:#6b7280; text-transform:uppercase; font-weight:700;">Вы отдаёте</div><div style="font-size:28px; font-weight:900; color:#000; line-height:1.1;">${fmtDec(r.amount, 2)} <span style="font-size:16px; color:#6b7280;">${r.currency}</span></div></div>
          <div style="margin-bottom: 20px; margin-top: 12px;"><div style="font-size:12px; color:#6b7280; text-transform:uppercase; font-weight:700;">Сумма заявки</div><div style="font-size:20px; font-weight:800; color:#6b7280;">${fmtDec(r.amount, 2)} ${r.currency}</div></div>
          <div class="receipt-dashed"></div>
          <div class="receipt-row"><span class="receipt-label">заявка</span><span class="receipt-value">#${r.id + 1000}</span></div>
          <div class="receipt-row"><span class="receipt-label">тип</span><span class="receipt-value">${tL}</span></div>
          ${d.network ? `<div class="receipt-row"><span class="receipt-label">сеть</span><span class="receipt-value">${d.network}</span></div>` : ''}
          ${d.requisites ? `<div class="receipt-row"><span class="receipt-label">оплата</span><span class="receipt-value">${d.requisites}</span></div>` : ''}
          ${d.tg_username ? `<div class="receipt-row"><span class="receipt-label">telegram</span><span class="receipt-value">${d.tg_username}</span></div>` : ''}
          <div class="receipt-row"><span class="receipt-label">оператор</span><span class="receipt-value">${r.processed_by || 'Ожидание'}</span></div>
          <div class="receipt-row"><span class="receipt-label">дата</span><span class="receipt-value">${new Date(r.created_at).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</span></div>
          <div style="font-size:12px; color:#6b7280; margin-top:20px; font-weight:600; text-align:center;">${st.l === 'Выплачено' ? 'Средства зачислены на баланс.' : st.l === 'Обработка' ? 'Заявка обрабатывается...' : 'Средства не были списаны'}</div>
        </div>
        <div style="margin-top: 16px;"><button class="btn btn-ghost btn-block" style="height:48px; border-radius:12px;" onclick="closeModal('requestDetailModal')">Закрыть</button></div>`;
      m.classList.add('active');
    };

    window.openSettings = async function() {
      const u = API.user(); if (!u) return;
      document.getElementById('settingsAvatarUrl').value = u.avatarUrl || ''; document.getElementById('settingsName').value = u.displayName || ''; document.getElementById('settingsEmail').value = u.email; document.getElementById('settingsCurrentPass').value = ''; document.getElementById('settingsNewPass').value = ''; document.getElementById('settingsError').textContent = '';
      try {
        const { user, stats } = await API.req('GET', '/users/me'); const container = document.getElementById('statusProgressContainer'); let pHtml = '';
        if (user.isMaker) pHtml += `<div style="font-size:14px; color:var(--txt); font-weight:700; display:flex; align-items:center; gap:8px;"><span class="badge-maker" style="width:24px;height:24px;">${ICONS.maker}</span> Мейкер активен</div>`;
        else pHtml += `<div style="background:var(--glass-bg); padding:12px; border-radius:12px; border:1px solid var(--card-border);"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div style="font-size:13px; font-weight:800; color:var(--gold);">Статус Мейкера</div><button class="btn btn-primary btn-sm" onclick="applyStatus('maker')" style="padding:4px 8px; font-size:12px; height:28px;">Подать</button></div><div style="font-size:12px; color:var(--dim); margin-bottom:2px;">Оборот: $${fmtDec(stats.volumeUsd, 2)} / $3k</div><div style="font-size:12px; color:var(--dim);">Успешных: ${stats.successRate}% / 80%</div></div>`;
        if (user.isMerchant) pHtml += `<div style="font-size:14px; color:var(--txt); font-weight:700; display:flex; align-items:center; gap:8px;"><span class="badge-merchant" style="width:24px;height:24px;">${ICONS.merchant}</span> Мерчант активен</div>`;
        else pHtml += `<div style="background:var(--glass-bg); padding:12px; border-radius:12px; border:1px solid var(--card-border);"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div style="font-size:13px; font-weight:800; color:var(--blue);">Статус Мерчанта</div><button class="btn btn-primary btn-sm" onclick="applyStatus('merchant')" style="padding:4px 8px; font-size:12px; height:28px;">Подать</button></div></div>`;
        container.innerHTML = pHtml;
      } catch (e) {}
      document.getElementById('settingsModal').classList.add('active');
    };
    window.applyStatus = async function(type) { try { await API.req('POST', '/users/apply', { type }); toast('Заявка отправлена!', 'success'); closeModal('settingsModal'); } catch(e) { toast(e.message, 'error'); } };
    document.getElementById('settingsSaveBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('settingsSaveBtn'); btn.disabled = true; btn.textContent = '...';
      try {
        const payload = { displayName: document.getElementById('settingsName').value, avatarUrl: document.getElementById('settingsAvatarUrl').value, email: document.getElementById('settingsEmail').value };
        const cPass = document.getElementById('settingsCurrentPass').value, nPass = document.getElementById('settingsNewPass').value;
        if (nPass) { if (!cPass) throw new Error('Введите текущий пароль'); payload.currentPassword = cPass; payload.password = nPass; }
        const { user } = await API.req('PATCH', '/users/me', payload); localStorage.setItem('vexo_user', JSON.stringify(user)); closeModal('settingsModal'); toast('Сохранено', 'success'); addNotification('Настройки обновлены.', 'success'); updateAuthUI(); screenCache.profile = false; loadProfile();
      } catch (e) { document.getElementById('settingsError').textContent = e.message === 'wrong_password' ? 'Неверный пароль' : e.message; } finally { btn.disabled = false; btn.textContent = 'Сохранить'; }
    });

    let currentAd = null, selectedPay = null, priceTimerInterval = null;
    window.openOrderModal = function(adId) {
      const ad = (window._ads || {})[adId]; if (!ad) return; currentAd = ad; selectedPay = ad.paymentMethods?.[0] || null; window.currentAd = ad; const isBuy = ad.side === 'sell';
      const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
      setText('orderTitle', (isBuy ? 'Покупка ' : 'Продажа ') + ad.asset); setText('orderUsername', ad.displayName); setText('orderUserMeta', (ad.faceType === 'first' ? '1-е лицо' : '3-е лицо') + ' · ★ ' + (ad.ratingAvg || '—')); setText('orderRate', fmt(ad.price) + ' ₽'); setText('orderAvailable', fmtDec(ad.amountLeft, 2) + ' ' + ad.asset); setText('orderLimit', `Лимит: ${fmt(ad.minRub)} - ${fmt(ad.maxRub)} ₽`); setText('orderResultLabel', isBuy ? 'Вы получите' : 'Вы отдадите'); setText('orderResult', '0 ' + ad.asset); setText('orderTotalBottom', '0 RUB'); setText('orderTerms', ad.terms || 'Стандартные условия сделки.'); setText('orderError', '');
      const aInp = document.getElementById('orderAmount');
      if (aInp) {
        aInp.value = ''; const rMax = Math.min(ad.maxRub, ad.amountLeft * ad.price); setText('orderLimit', `Лимит: ${fmt(ad.minRub)} - ${fmt(rMax)} ₽`);
        aInp.oninput = e => {
          const rub = parseFloat(e.target.value) || 0; setText('orderResult', fmtDec(rub / ad.price, 4) + ' ' + ad.asset); setText('orderTotalBottom', fmt(rub) + ' RUB');
          const errEl = document.getElementById('orderError'), btn = document.getElementById('orderSubmit');
          if (rub > 0 && (rub < ad.minRub || rub > rMax)) { if (errEl) errEl.textContent = `Сумма от ${fmt(ad.minRub)} до ${fmt(rMax)} ₽`; if (btn) { btn.style.opacity = '0.5'; btn.disabled = true; } aInp.style.borderColor = 'var(--red)'; }
          else { if (errEl) errEl.textContent = ''; if (btn) { btn.style.opacity = '1'; btn.disabled = false; } aInp.style.borderColor = 'var(--primary)'; }
        };
      }
      document.getElementById('btnOrderMax').onclick = () => { const rMax = Math.min(ad.maxRub, ad.amountLeft * ad.price); aInp.value = rMax.toFixed(2); aInp.dispatchEvent(new Event('input')); };
      const pB = document.getElementById('orderPayments'); if (!pB) return; pB.innerHTML = '';
      (ad.paymentMethods || []).forEach(p => { const el = document.createElement('div'); el.className = 'pay-chip' + (p === selectedPay ? ' active' : ''); el.innerHTML = `${getPayIcon(p)} ${p}`; el.style.display = 'inline-flex'; el.style.alignItems = 'center'; el.style.gap = '4px'; el.onclick = () => { pB.querySelectorAll('.pay-chip').forEach(x => x.classList.remove('active')); el.classList.add('active'); selectedPay = p; }; pB.appendChild(el); });
      const btn = document.getElementById('orderSubmit'); btn.className = 'btn ' + (isBuy ? 'btn-buy' : 'btn-sell'); btn.textContent = isBuy ? 'Купить' : 'Продать'; btn.disabled = false; btn.style.opacity = '1'; btn.onclick = submitOrder;
      let tLeft = 60; const tEl = document.getElementById('priceTimer'); if (tEl) tEl.textContent = tLeft + 's'; if (priceTimerInterval) clearInterval(priceTimerInterval);
      priceTimerInterval = setInterval(async () => {
        tLeft--; if (tEl) tEl.textContent = tLeft + 's';
        if (tLeft <= 0) { clearInterval(priceTimerInterval); if (tEl) tEl.textContent = 'Обновление...'; try { const fAd = await API.req('GET', '/ads/' + ad.id); if (fAd.price !== ad.price) { currentAd = fAd; window._ads[ad.id] = fAd; ad.price = fAd.price; setText('orderRate', fmt(ad.price) + ' ₽'); toast('Курс обновился!', 'error'); if (aInp.value) aInp.dispatchEvent(new Event('input')); } } catch(e) {} tLeft = 60; if (tEl) tEl.textContent = tLeft + 's'; }
      }, 1000);
      document.getElementById('orderModal').classList.add('active');
    };

    async function submitOrder() {
      const errEl = document.getElementById('orderError'); if (errEl) errEl.textContent = '';
      const rub = parseFloat(document.getElementById('orderAmount').value) || 0; if (!selectedPay) { if (errEl) errEl.textContent = 'Выберите способ оплаты'; return; }
      const rMax = Math.min(currentAd.maxRub, currentAd.amountLeft * currentAd.price);
      if (rub < currentAd.minRub) { if (errEl) errEl.textContent = 'Минимум ' + fmt(currentAd.minRub) + ' ₽'; return; }
      if (rub > rMax) { if (errEl) errEl.textContent = 'Максимум ' + fmt(rMax) + ' ₽'; return; }
      const btn = document.getElementById('orderSubmit'); btn.disabled = true; btn.textContent = '...';
      try { const order = await API.req('POST', '/orders', { ad_id: currentAd.id, amount_rub: rub, payment_method: selectedPay }); closeModal('orderModal'); toast('Заявка создана!', 'success'); addNotification(`Создана новая заявка #${order.publicId}`, 'success'); screenCache.orders = false; screenCache.market = false; openOrderPage(order.id); } catch (err) { if (errEl) errEl.textContent = err.message; } finally { btn.disabled = false; btn.textContent = currentAd ? (currentAd.side === 'sell' ? 'Купить' : 'Продать') : 'OK'; }
    }

    window.logoutAction = async function() { if (await confirmAsync('Выход', 'Выйти из аккаунта?', 'Выйти')) { localStorage.removeItem('vexo_token'); localStorage.removeItem('vexo_user'); location.reload(); } };

    let adminTab = 'users'; let currentAdminUserId = null; let allAdminUsers = [];
    async function loadAdmin() {
      const u = API.user(); if (!['admin', 'owner', 'deputy'].includes(u.role)) return;
      const content = document.getElementById('adminContent'), searchInput = document.getElementById('adminUserSearch'); if (!content) return;
      try {
        if (adminTab === 'users') {
          searchInput.style.display = 'block'; content.innerHTML = 'Загрузка...';
          const { items } = await API.req('GET', '/admin/users'); allAdminUsers = items;
          const renderUsers = (query = '') => {
            let f = allAdminUsers; if (query) { const q = query.toLowerCase(); f = allAdminUsers.filter(user => user.id.toString() === q || user.username.toLowerCase().includes(q) || (user.displayName || '').toLowerCase().includes(q)); }
            if (!f.length) { content.innerHTML = '<div class="empty-state">Не найдено</div>'; return; }
            content.innerHTML = f.map(user => `<div class="admin-user-card"><div class="admin-user-info"><div class="admin-user-name">ID: ${user.id} | ${user.displayName} (@${user.username})</div><div class="admin-user-meta">Роль: ${user.role} | Бал: ${fmtDec(user.balanceRub, 2)} ₽</div></div><button class="btn btn-primary btn-sm" style="border-radius: 8px; padding: 6px 12px; height:32px; font-size:13px;" onclick="openAdminUserModal(${user.id})">⚙️</button></div>`).join('');
          };
          renderUsers(searchInput.value); searchInput.oninput = () => renderUsers(searchInput.value);
        } 
        else if (adminTab === 'disputes') {
          searchInput.style.display = 'none'; content.innerHTML = 'Загрузка...';
          const { items } = await API.req('GET', '/admin/orders');
          if (!items.length) { content.innerHTML = '<div class="empty-state">Нет споров</div>'; return; }
          content.innerHTML = items.map(o => `<div class="ad-card" style="cursor:pointer; border-left:4px solid ${o.status === 'dispute' ? 'var(--gold)' : 'var(--blue)'}; padding:14px; margin-bottom:12px;" onclick="openAdminOrder(${o.id})"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong style="font-family:Inter,monospace;font-size:15px;">#${o.publicId}</strong><span style="color:var(--txt);font-size:12px;font-weight:800">${o.statusLabel}</span></div><div class="ad-body"><div><div style="font-size:12px;color:var(--dim);">Сумма</div><div style="font-size:15px;font-weight:800;">${fmtDec(o.amountRub, 2)} ₽</div></div><div><div style="font-size:12px;color:var(--dim);">Актив</div><div style="font-size:15px;font-weight:800;">${fmtDec(o.amountAsset, 2)} ${o.asset}</div></div></div></div>`).join('');
        }
        else if (adminTab === 'requests') {
          searchInput.style.display = 'none'; content.innerHTML = 'Загрузка...';
          const { items } = await API.req('GET', '/admin/requests');
          if (!items.length) { content.innerHTML = '<div class="empty-state">Нет заявок</div>'; return; }
          content.innerHTML = items.map(req => {
            const sM = { pending: { l: 'В ожидании', c: 'var(--yellow)' }, approved: { l: 'Одобрено', c: 'var(--grn)' }, rejected: { l: 'Отклонено', c: 'var(--red)' }, cancelled: { l: 'Отменено', c: 'var(--dim)' }, completed: { l: 'Выполнено', c: 'var(--grn)' } };
            const st = sM[req.status] || { l: req.status, c: 'var(--txt)' }, isFinal = ['rejected', 'cancelled', 'completed'].includes(req.status); let tL = req.type;
            if (req.type === 'maker_req') tL = 'Мейкер'; if (req.type === 'merchant_req') tL = 'Мерчант'; if (req.type === 'exchange') tL = 'Обмен'; if (req.type === 'deposit_rub') tL = 'Деп RUB'; if (req.type === 'withdraw_rub') tL = 'Выв RUB'; if (req.type === 'deposit_usdt') tL = 'Деп USDT'; if (req.type === 'withdraw_usdt') tL = 'Выв USDT';
            const d = req.details || {};
            return `<div class="glass-card" style="padding:14px; margin-bottom:12px; border-left:4px solid ${st.c};"><div style="display:flex; justify-content:space-between; margin-bottom:6px;"><strong style="font-size:15px; color:var(--txt);">${tL} (ID: ${req.user_id})</strong><span style="font-size:12px; font-weight:800; color:${st.c}; text-transform:uppercase;">${st.l}</span></div><div style="font-size:13px; color:var(--dim); margin-bottom:6px;">@${req.username}</div>${req.amount ? `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;"><div style="font-size:12px; color:var(--dim);">Сумма:</div><div style="font-size:15px; font-weight:800; color:var(--txt);">${fmtDec(req.amount, 2)} ${req.currency}</div></div>` : ''}${d.requisites ? `<div style="font-size:12px; color:var(--dim); margin-bottom:4px;">Рек: <span style="color:var(--txt); font-weight:600;">${d.requisites}</span></div>` : ''}${d.network ? `<div style="font-size:12px; color:var(--dim); margin-bottom:4px;">Сеть: <span style="color:var(--txt); font-weight:600;">${d.network}</span></div>` : ''}${d.tg_username ? `<div style="font-size:12px; color:var(--dim); margin-bottom:8px;">TG: <span style="color:var(--txt); font-weight:600;">${d.tg_username}</span></div>` : ''}${!isFinal ? `<div class="field" style="margin-bottom: 8px;"><input type="text" class="input" id="adminComment-${req.id}" placeholder="Комментарий" style="height: 36px; font-size: 12px;" value="${req.admin_comment || ''}"></div><div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top:8px;"><button class="btn btn-primary btn-sm" style="background:var(--grn); padding:6px; font-size:12px; border-radius:8px; height:32px;" onclick="updateRequestStatus(${req.id}, 'approved')">✓</button><button class="btn btn-ghost btn-sm" style="color:var(--red); border:1px solid var(--red); padding:6px; font-size:12px; border-radius:8px; height:32px;" onclick="updateRequestStatus(${req.id}, 'rejected')">✕</button><button class="btn btn-ghost btn-sm" style="color:var(--dim); border:1px solid var(--glass-border); padding:6px; font-size:12px; border-radius:8px; height:32px;" onclick="updateRequestStatus(${req.id}, 'cancelled')">-</button></div>` : `<div style="font-size:12px; color:var(--dim); margin-top:8px;">Обработал: @${req.processed_by || 'admin'}</div>`}</div>`;
          }).join('');
        }
        else if (adminTab === 'stats') {
          searchInput.style.display = 'none';
          content.innerHTML = `<div class="segmented" id="statsFilter" style="margin-bottom: 16px;"><button class="seg-btn active" data-val="day">День</button><button class="seg-btn" data-val="week">Неделя</button><button class="seg-btn" data-val="month">Месяц</button><button class="seg-btn" data-val="all">Все</button></div><div id="statsResult" class="glass-card" style="padding: 20px;"><div class="empty-state">Загрузка...</div></div>`;
          document.querySelectorAll('#statsFilter .seg-btn').forEach(t => { t.onclick = () => { document.querySelectorAll('#statsFilter .seg-btn').forEach(x => x.classList.remove('active')); t.classList.add('active'); fetchStats(t.dataset.val); } });
          fetchStats('day');
        }
      } catch(e) { content.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    async function fetchStats(period) {
      const resEl = document.getElementById('statsResult'); if (!resEl) return; resEl.innerHTML = 'Загрузка...';
      try { const { count, total, avg } = await API.req('GET', '/admin/stats?period=' + period); resEl.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><div style="font-size:14px; font-weight:700; color:var(--dim);">Кол-во выводов:</div><div style="font-size:24px; font-weight:900; color:var(--txt);">${count}</div></div><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;"><div style="font-size:14px; font-weight:700; color:var(--dim);">Общая сумма:</div><div style="font-size:20px; font-weight:900; color:var(--grn);">${fmt(total)}</div></div><div style="display:flex; justify-content:space-between; align-items:center;"><div style="font-size:14px; font-weight:700; color:var(--dim);">Среднее в день:</div><div style="font-size:20px; font-weight:900; color:var(--blue);">${fmtDec(avg, 2)}</div></div>`; } catch(e) { resEl.innerHTML = '<div class="empty-state">Ошибка</div>'; }
    }

    window.openAdminUserModal = async function(userId) {
      currentAdminUserId = userId; const m = document.getElementById('adminUserModal'), info = document.getElementById('adminUserInfo'); if (!m || !info) return; info.innerHTML = 'Загрузка...'; m.classList.add('active');
      try {
        const { user } = await API.req('GET', '/users/' + userId); let avHtml = `<div class="avatar" style="width:36px;height:36px;font-size:16px;">${user.displayName[0].toUpperCase()}</div>`; if (user.avatarUrl) avHtml = `<div class="avatar" style="width:36px;height:36px;"><img src="${user.avatarUrl}"></div>`;
        info.innerHTML = `<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">${avHtml}<div><h3 style="font-size:16px; font-weight:800; margin:0;">${user.displayName} (ID: ${user.id})</h3><div style="font-size:12px; color:var(--dim);">@${user.username}</div></div></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;"><div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:10px;"><div style="font-size:11px; color:var(--dim);">RUB</div><div style="font-size:14px; font-weight:800; color:var(--txt);">${fmtDec(user.balanceRub, 2)} ₽</div></div><div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:10px;"><div style="font-size:11px; color:var(--dim);">USDT</div><div style="font-size:14px; font-weight:800; color:var(--txt);">${fmtDec(user.balanceUsdt, 2)} ₮</div></div></div>`;
        const updBtn = (id, isAct) => { const b = document.getElementById(id); if (!b) return; if (isAct) { b.classList.add('btn-primary'); b.classList.remove('btn-ghost'); b.style.background = 'var(--grn)'; b.style.color = '#fff'; } else { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); b.style.background = ''; b.style.color = ''; } };
        updBtn('admTogglePro', user.isPro); updBtn('admToggleMerchant', user.isMerchant); updBtn('admToggleMaker', user.isMaker);
      } catch (e) { info.innerHTML = 'Ошибка'; }
    };
    window.toggleAdminUserStatus = async function(field) { if (!currentAdminUserId) return; const u = await API.req('GET', '/users/' + currentAdminUserId); const payload = {}; payload[field] = !u.user[field === 'is_pro' ? 'isPro' : field === 'is_merchant' ? 'isMerchant' : 'isMaker']; try { await API.req('PATCH', '/admin/users/' + currentAdminUserId + '/status', payload); toast('Статус обновлен', 'success'); openAdminUserModal(currentAdminUserId); } catch(e) { toast('Ошибка', 'error'); } };
    window.adminChangeBalance = async function(action) { if (!currentAdminUserId) return; const curr = document.getElementById('admBalanceCurrency').value, amt = parseFloat(document.getElementById('admBalanceAmount').value); if (!amt || amt <= 0) return toast('Введите сумму', 'error'); try { await API.req('POST', '/admin/users/' + currentAdminUserId + '/balance', { currency: curr, amount: amt, action }); toast('Баланс изменен', 'success'); document.getElementById('admBalanceAmount').value = ''; openAdminUserModal(currentAdminUserId); } catch(e) { toast(e.message || 'Ошибка', 'error'); } };
    document.querySelectorAll('#adminTabs .seg-btn').forEach(c => { c.onclick = () => { document.querySelectorAll('#adminTabs .seg-btn').forEach(x => x.classList.remove('active')); c.classList.add('active'); adminTab = c.dataset.val; loadAdmin(); }; });
    window.updateRequestStatus = async function(reqId, status) { const comVal = document.getElementById(`adminComment-${reqId}`)?.value || ''; if (!await confirmAsync('Изменение', `Отметить как "${status}"?`, 'Да')) return; try { await API.req('PATCH', '/admin/requests/' + reqId, { status, admin_comment: comVal }); toast('Обновлено', 'success'); loadAdmin(); screenCache.profile = false; screenCache.wallet = false; } catch(e) { toast(e.message || 'Ошибка', 'error'); } };

    const bC = document.getElementById('homeBannerCarousel'); if (bC) { bC.addEventListener('scroll', () => { const sL = bC.scrollLeft, w = bC.offsetWidth, dots = document.querySelectorAll('.banner-dots .dot'); if (!dots.length || w === 0) return; const idx = Math.round(sL / w); dots.forEach((d, i) => d.classList.toggle('active', i === idx)); }); }

    initSpreadCalculator(); updateAuthUI(); loadHomeDashboard(); updateNotifUI(); try { loadHomeRate(); } catch(e) { console.error('Initial load error:', e); }
  } catch (err) { console.error('VEXO: КРИТИЧЕСКАЯ ОШИБКА', err); }
});