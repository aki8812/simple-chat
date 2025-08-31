/** 省略說明：見檔案頂部註解 **/
(function () {
  if (window.__CHAT_NOTIFICATIONS_INSTALLED__) return;
  window.__CHAT_NOTIFICATIONS_INSTALLED__ = true;

  const SETTINGS_KEY = 'chat.notif.settings';
  const DEFAULTS = { desktop: false, sound: true, mentionsOnly: false };
  const state = {
    settings: loadSettings(),
    unread: 0,
    focused: !document.hidden,
    baseTitle: document.title,
    baseFaviconHref: null,
    audioCtx: null,
    msgRoot: null,
    myUid: null,
    myName: null,
  };

  injectStyles();
  const ui = buildUI();
  document.addEventListener('visibilitychange', handleVisibility, false);
  window.addEventListener('focus', onFocusReset, false);
  window.addEventListener('blur', () => state.focused = false, false);
  setTimeout(resolveSelfIdentity, 0);

  waitForMessageRoot().then(root => {
    state.msgRoot = root;
    observeMessages(root);
  });

  ['click','touchstart'].forEach(evt =>
    window.addEventListener(evt, primeAudioCtx, { once: true, passive: true })
  );

  function observeMessages(root) {
    const observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type !== 'childList') continue;
        m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          handlePotentialMessage(node);
          node.querySelectorAll?.(':scope > *').forEach(child => {
            if (child instanceof HTMLElement) handlePotentialMessage(child);
          });
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function handlePotentialMessage(node) {
    const cls = node.className || '';
    if (cls.match(/(date|divider|typing|spinner|system|placeholder)/i)) return;

    const msg = extractMessage(node);
    if (!msg || !msg.text) return;

    const mine = isOwnMessage(node, msg);
    if (mine) return;

    const nick = getMyName();
    const mentioned = nick ? mentionsNick(msg.text, nick) || mentionsEveryone(msg.text) : mentionsEveryone(msg.text);

    const shouldNotify = state.settings.mentionsOnly ? mentioned : (!state.focused || mentioned);
    if (!shouldNotify) return;

    const title = msg.sender || '新訊息';
    const body = limitLen(msg.text.replace(/\s+/g, ' '), 140);
    if (state.settings.sound) beep();
    showToast({ title, body, avatar: msg.avatar });
    desktopNotify(title, body, msg.avatar);

    if (document.hidden) incUnread();
  }

  function extractMessage(node) {
    const textEl = node.querySelector?.('[data-role="text"], .message-text, .content, .body, .text, .msg-text, .message__content, .markdown, .chat-message');
    const userEl = node.querySelector?.('[data-username], .username, .author, .sender, .message__author');
    const avatarEl = node.querySelector?.('img[alt*="avatar"], img.avatar, .avatar img, img[ref="avatar"], img.user-avatar');

    const text = (node.dataset?.text || textEl?.innerText || node.innerText || '').trim();
    const sender = (node.dataset?.senderName || userEl?.textContent || '').trim();
    const avatar = (node.dataset?.avatar || avatarEl?.src || getDefaultAvatar());
    const senderId = node.dataset?.senderId || '';
    return { text, sender, avatar, senderId };
  }

  function isOwnMessage(node, msg) {
    const classes = ['mine','me','self','own','from-self','from-me'];
    if (classes.some(c => node.classList?.contains(c))) return true;
    if (msg.senderId && state.myUid && msg.senderId === state.myUid) return true;
    const nick = getMyName();
    if (nick && msg.sender && normalize(nick) === normalize(msg.sender)) return true;
    return false;
  }

  function mentionsNick(text, nick) {
    try {
      const re = new RegExp(`(^|\\W)@${escapeRegExp(nick)}(\\W|$)`, 'i');
      return re.test(text);
    } catch {
      return text.includes('@' + nick);
    }
  }
  function mentionsEveryone(text) {
    return /(^|\W)@everyone(\W|$)/i.test(text);
  }

  function incUnread() {
    state.unread++;
    updateTitle();
    updateFavicon(state.unread);
    ui.badge.hidden = false;
    ui.badge.textContent = String(state.unread);
  }
  function clearUnread() {
    state.unread = 0;
    updateTitle();
    updateFavicon(0);
    ui.badge.hidden = true;
  }
  function updateTitle() {
    document.title = state.unread > 0 ? `(${state.unread}) ${state.baseTitle}` : state.baseTitle;
  }
  function handleVisibility() {
    state.focused = !document.hidden;
    if (state.focused) clearUnread();
  }
  function onFocusReset() {
    state.focused = true;
    clearUnread();
  }

  function desktopNotify(title, body, icon) {
    if (!state.settings.desktop) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        const n = new Notification(title, { body, icon, silent: true });
        n.onclick = () => { window.focus(); n.close(); };
      } catch {}
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') desktopNotify(title, body, icon);
        else {
          state.settings.desktop = false;
          persistSettings();
          ui.chkDesktop.checked = false;
          showToast({ title: '桌面通知未啟用', body: '你拒絕了瀏覽器權限，日後可在瀏覽器設定中手動開啟。' });
        }
      });
    }
  }

  function showToast({ title, body, avatar }) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div class="toast__avatar">${avatar ? `<img src="${escapeAttr(avatar)}" alt="">` : '🔔'}</div>
      <div class="toast__main">
        <div class="toast__title">${escapeHTML(title)}</div>
        <div class="toast__text">${escapeHTML(body)}</div>
      </div>
      <button class="toast__close" aria-label="關閉">×</button>
    `.trim();
    el.querySelector('.toast__close').addEventListener('click', () => el.remove());
    el.addEventListener('click', () => { window.focus(); el.remove(); }, { passive: true });
    ui.stack.prepend(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 300);
    }, 4200);
  }

  function primeAudioCtx() {
    if (!state.settings.sound) return;
    try {
      state.audioCtx = state.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    } catch {}
  }

  function beep() {
    if (!state.settings.sound) return;
    try {
      primeAudioCtx();
      const ctx = state.audioCtx;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 1046; // C6
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.28);
      if ('vibrate' in navigator && document.hidden) navigator.vibrate?.(10);
    } catch {}
  }

  function updateFavicon(count) {
    try {
      const link = document.querySelector('link[rel~="icon"]');
      if (!state.baseFaviconHref) {
        if (!link) {
          const l = document.createElement('link');
          l.rel = 'icon';
          l.href = '/favicon.ico';
          document.head.appendChild(l);
          state.baseFaviconHref = l.href;
        } else {
          state.baseFaviconHref = link.href;
        }
      }
      if (count <= 0) {
        if (link) link.href = state.baseFaviconHref;
        return;
      }
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);
        drawBadge(ctx, size, count);
        applyIcon(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(0, 0, size, size);
        ctx.font = '42px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔔', size/2, size/2 + 4);
        drawBadge(ctx, size, count);
        applyIcon(canvas.toDataURL('image/png'));
      };
      img.src = state.baseFaviconHref;
    } catch {
      updateTitle();
    }
  }

  function drawBadge(ctx, size, count) {
    const r = 18;
    ctx.beginPath();
    ctx.arc(size - r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e11900';
    ctx.fill();
    ctx.font = 'bold 20px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(count > 99 ? '99+' : count), size - r, r + 1);
  }

  function applyIcon(dataUrl) {
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  }

  function buildUI() {
    const stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);

    const fab = document.createElement('button');
    fab.id = 'notif-bell';
    fab.className = 'notif-fab';
    fab.title = '通知設定';
    fab.setAttribute('aria-label','通知設定');
    fab.innerHTML = `
      <span class="notif-fab__icon">🔔</span>
      <span id="notif-badge" class="notif-fab__badge" hidden>0</span>
    `;
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.className = 'notif-panel';
    panel.setAttribute('aria-hidden','true');
    panel.innerHTML = `
      <div class="notif-panel__header">
        <div class="notif-panel__title">通知設定</div>
        <button class="notif-panel__close" aria-label="關閉">×</button>
      </div>
      <label class="notif-row">
        <input id="opt-desktop" type="checkbox">
        <span>啟用桌面通知</span>
      </label>
      <label class="notif-row">
        <input id="opt-sound" type="checkbox">
        <span>啟用聲音提醒</span>
      </label>
      <label class="notif-row">
        <input id="opt-mentions" type="checkbox">
        <span>僅在 @ 我時通知</span>
      </label>
      <div class="notif-hint">提示：第一次啟用桌面通知會跳出瀏覽器授權視窗。</div>
    `;
    document.body.appendChild(panel);

    const backdrop = document.createElement('div');
    backdrop.className = 'notif-backdrop';
    document.body.appendChild(backdrop);

    const chkDesktop = panel.querySelector('#opt-desktop');
    const chkSound = panel.querySelector('#opt-sound');
    const chkMentions = panel.querySelector('#opt-mentions');
    chkDesktop.checked = !!state.settings.desktop;
    chkSound.checked = !!state.settings.sound;
    chkMentions.checked = !!state.settings.mentionsOnly;

    const badge = fab.querySelector('#notif-badge');

    function openPanel() {
      panel.classList.add('open');
      backdrop.classList.add('open');
      panel.setAttribute('aria-hidden','false');
    }
    function closePanel() {
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      panel.setAttribute('aria-hidden','true');
    }

    fab.addEventListener('click', () => openPanel());
    panel.querySelector('.notif-panel__close').addEventListener('click', () => closePanel());
    backdrop.addEventListener('click', () => closePanel());

    chkDesktop.addEventListener('change', async e => {
      state.settings.desktop = e.target.checked;
      persistSettings();
      if (state.settings.desktop && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }
    });
    chkSound.addEventListener('change', e => {
      state.settings.sound = e.target.checked;
      persistSettings();
      if (state.settings.sound) primeAudioCtx();
    });
    chkMentions.addEventListener('change', e => {
      state.settings.mentionsOnly = e.target.checked;
      persistSettings();
    });

    return { stack, fab, panel, badge, chkDesktop, chkSound, chkMentions };
  }

  function injectStyles() {
    if (document.getElementById('notif-styles')) return;
    const css = `
#toast-stack {
  position: fixed;
  z-index: 2147483000;
  right: 12px; top: 12px;
  display: flex; flex-direction: column; gap: 10px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 10px;
  max-width: min(92vw, 380px);
  padding: 10px 12px; border-radius: 10px;
  background: rgba(32,32,36,0.96);
  color: #fff; box-shadow: 0 8px 20px rgba(0,0,0,.35);
  transform: translateY(0); opacity: 1; transition: all .24s ease;
}
.toast.leaving { transform: translateY(-8px); opacity: 0; }
.toast__avatar { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex: none; display: grid; place-items: center; background: #282a2e; }
.toast__avatar img { width: 100%; height: 100%; object-fit: cover; }
.toast__main { min-width: 0; }
.toast__title { font-weight: 700; font-size: 14px; line-height: 1.2; margin-bottom: 2px; }
.toast__text { font-size: 13px; color: #cfd3da; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
.toast__close { margin-left: 4px; background: transparent; border: 0; color: #9aa4b2; font-size: 18px; cursor: pointer; }
.toast__close:hover { color: #fff; }

.notif-fab {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
  width: 48px; height: 48px; border-radius: 50%;
  background: #5865F2; color: #fff; border: none; cursor: pointer;
  display: grid; place-items: center; box-shadow: 0 10px 24px rgba(0,0,0,.35);
}
.notif-fab:active { transform: translateY(1px); }
.notif-fab__badge {
  position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; padding: 0 4px;
  background: #e11900; color: #fff; font-weight: 700; font-size: 12px;
  border-radius: 10px; display: grid; place-items: center;
}

.notif-panel {
  position: fixed; right: 18px; bottom: 78px; z-index: 2147483000;
  width: min(92vw, 320px); background: #1e1f22; color: #e5e7eb;
  border: 1px solid #2a2c30; border-radius: 12px; box-shadow: 0 24px 48px rgba(0,0,0,.45);
  transform: translateY(8px); opacity: 0; pointer-events: none; transition: all .22s ease;
}
.notif-panel.open { transform: translateY(0); opacity: 1; pointer-events: auto; }
.notif-panel__header { display:flex; align-items:center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #2a2c30; }
.notif-panel__title { font-weight: 800; }
.notif-panel__close { background: transparent; border:0; color: #9aa4b2; font-size: 20px; cursor:pointer; }
.notif-row { display:flex; align-items:center; gap: 10px; padding: 10px 14px; }
.notif-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: #5865F2; }
.notif-hint { padding: 0 14px 14px; font-size: 12px; color: #9aa4b2; }
.notif-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.0); z-index: 2147482999;
  opacity: 0; pointer-events: none; transition: all .2s ease;
}
.notif-panel.open + .notif-backdrop, .notif-backdrop.open {
  opacity: 1; background: rgba(0,0,0,.18); pointer-events: auto;
}

/* 可選：若你已有 @mention 樣式，這段可忽略 */
.mention { color: #5CA7FF; font-weight: 700; }
    `;
    const style = document.createElement('style');
    style.id = 'notif-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function resolveSelfIdentity() {
    try {
      if (window.firebase?.auth?.currentUser) {
        state.myUid = window.firebase.auth.currentUser.uid;
        state.myName = window.firebase.auth.currentUser.displayName || null;
      }
    } catch {}
    if (!state.myName) {
      state.myName = localStorage.getItem('nickname')
        || document.body.getAttribute('data-current-user')
        || document.querySelector('[data-current-user-name]')?.getAttribute('data-current-user-name')
        || null;
    }
  }

  function getMyName() {
    if (!state.myName) resolveSelfIdentity();
    return state.myName;
  }

  function waitForMessageRoot() {
    const selectors = [
      '[data-role="messages"]',
      '#messages',
      '.messages',
      '.chat-messages',
      '#messageList',
      '.message-list',
      '#chat-messages',
      '.scrollable-messages'
    ];
    return new Promise(resolve => {
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return resolve(el);
      }
      const ito = setInterval(() => {
        for (const s of selectors) {
          const el = document.querySelector(s);
          if (el) { clearInterval(ito); return resolve(el); }
        }
      }, 500);
    });
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULTS };
      const obj = JSON.parse(raw);
      return { ...DEFAULTS, ...obj };
    } catch { return { ...DEFAULTS }; }
  }
  function persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
  }

  function normalize(s) { return (s || '').trim().toLowerCase(); }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function limitLen(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function getDefaultAvatar() { return ''; }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

})();