/* codexmysteria.bundle.js
   Kombinierte Version von:
   - script.js (zentrale Engine)
   - menu.js   (Menü-System)
   -------------------------------------
   Ziel: keine Funktionalitätsverluste, stabilere Integration, keine doppelten Namen.
*/
(function () {
  'use strict';

  /* ===========================
     ===  Zentrale Konfiguration
     =========================== */
  const ACCOUNTS_KEY = 'codexmysteria_accounts';
  const SESSION_KEY  = 'codexmysteria_session';
  const THEME_KEY    = 'codexmysteria_theme';
  const IMPERSONATE_KEY = 'codexmysteria_impersonate';

  // Code -> Rolle mapping (kann angepasst werden)
  const allowedCodes = {
    'ADMIN-ROOT-001': 'admin',
    'DM-ARCANA-001': 'dm',
    'PLAYER-START-001': 'player'
  };

  /* ===========================
     ===  Core Helpers & Storage
     =========================== */
  function safeJsonParse(raw, fallback = null) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function loadAccounts() {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    return safeJsonParse(raw, []) || [];
  }
  function saveAccounts(list) {
    try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list || [])); } catch (e) { console.warn('[Codex] saveAccounts failed', e); }
  }
  function saveSession(obj) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj || null)); } catch (e) { console.warn('[Codex] saveSession failed', e); }
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function loadSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return safeJsonParse(raw, null);
  }
  function findAccountByUsername(username) {
    username = (username || '').toString();
    return loadAccounts().find(a => (a.username || '').toLowerCase() === username.toLowerCase()) || null;
  }

  /* ===========================
     ===  Crypt / Password Hash
     =========================== */
  async function hashPassword(password) {
    const enc = new TextEncoder();
    const data = enc.encode(password || '');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ===========================
     ===  Core API
     =========================== */
  async function createAccount(username, password, accountCode) {
    username = (username || '').trim();
    password = (password || '');
    accountCode = (accountCode || '').trim().toUpperCase();

    if (!username || !password || !accountCode) {
      return { success: false, message: 'Bitte alle Felder ausfüllen.' };
    }

    if (findAccountByUsername(username)) {
      return { success: false, message: 'Benutzername bereits vergeben.' };
    }

    const role = allowedCodes[accountCode];
    if (!role) {
      return { success: false, message: 'Ungültiger Account-Code.' };
    }

    let pwHash;
    try { pwHash = await hashPassword(password); } catch (e) { return { success:false, message:'Fehler beim Hashen des Passworts.' }; }

    const accounts = loadAccounts();
    const accountObj = {
      username,
      passwordHash: pwHash,
      role,
      code: accountCode,
      createdAt: new Date().toISOString()
    };
    accounts.push(accountObj);
    saveAccounts(accounts);

    // set session (stay=true für bessere UX)
    const session = { username, role, createdAt: new Date().toISOString(), isGuest: false, stay: true };
    saveSession(session);

    // notify listeners
    window.dispatchEvent(new CustomEvent('codex:session-changed', { detail: { session } }));
    return { success: true, account: accountObj };
  }

  async function authenticate(username, password, stay = false) {
    username = (username || '').trim();
    password = (password || '');
    if (!username || !password) return { success:false, message:'Benutzername und Passwort erforderlich.' };

    const account = findAccountByUsername(username);
    if (!account) return { success:false, message:'Benutzer nicht gefunden.' };

    let pwHash;
    try { pwHash = await hashPassword(password); } catch (e) { return { success:false, message:'Fehler beim Hashen des Passworts.' }; }

    if (pwHash !== account.passwordHash) return { success:false, message:'Falsches Passwort.' };

    const session = { username: account.username, role: account.role, createdAt: new Date().toISOString(), isGuest: false, stay: !!stay };
    saveSession(session);
    window.dispatchEvent(new CustomEvent('codex:session-changed', { detail: { session } }));
    return { success:true, session };
  }

  function guestLogin() {
    const session = { username: 'Gast', role: 'guest', createdAt: new Date().toISOString(), isGuest: true, stay: false };
    saveSession(session);
    window.dispatchEvent(new CustomEvent('codex:session-changed', { detail: { session } }));
    return { success:true, session };
  }

  function logout() {
    clearSession();
    window.dispatchEvent(new CustomEvent('codex:session-changed', { detail: { session: null } }));
  }

  function getSession() {
    return loadSession();
  }

  function listAccounts() {
    return loadAccounts();
  }

  // sehr simple permission-map (kann erweitert werden)
  function isAllowed(role, permissionKey) {
    const map = {
      'guest': ['view_rules'],
      'player': ['view_rules','use_tools'],
      'dm': ['view_rules','use_tools','dm_tools'],
      'admin': ['view_rules','use_tools','dm_tools','admin_panel']
    };
    const allowed = map[(role || 'guest')] || [];
    return allowed.includes(permissionKey);
  }

  // Theme application helper (Menu nutzt das)
  function applyTheme(theme) {
    theme = (theme || 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.remove('light','dark','mystic','fantasy');
    if (theme === 'light') document.body.classList.add('light');
    else if (theme === 'fantasy') document.body.classList.add('mystic');
    else document.body.classList.add('dark');
    try { localStorage.setItem(THEME_KEY, theme); } catch(e){}
    window.dispatchEvent(new CustomEvent('codex:theme-changed', { detail: { theme } }));
  }

  /* Auto-load last theme on init */
  (function loadThemeOnStart(){
    const t = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(t);
  })();

  /* ===========================
     ===  Menü-Modul (eingebettet)
     =========================== */
  const MenuModule = (function () {
    // config
    const ROLES_CYCLE = ['admin','dm','player','guest'];

    // DOM helpers
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
    const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

    // reuse core functions / keys via outer scope
    const THEME_KEY_LOCAL = THEME_KEY;
    const ACCOUNTS_KEY_LOCAL = ACCOUNTS_KEY;
    const SESSION_KEY_LOCAL = SESSION_KEY;
    const IMPERSONATE_KEY_LOCAL = IMPERSONATE_KEY;

    // small helpers
    function safeGetSession() {
      try {
        if (window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function') return window.CodexMysteria.getSession();
        return safeJsonParse(localStorage.getItem(SESSION_KEY_LOCAL) || 'null');
      } catch (e) { return null; }
    }
    function getImpersonation() { return localStorage.getItem(IMPERSONATE_KEY_LOCAL) || null; }
    function setImpersonation(role) {
      if (!role) localStorage.removeItem(IMPERSONATE_KEY_LOCAL);
      else localStorage.setItem(IMPERSONATE_KEY_LOCAL, role);
      window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role } }));
    }
    function clearImpersonation() {
      localStorage.removeItem(IMPERSONATE_KEY_LOCAL);
      window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role: null } }));
    }
    function effectiveRole() {
      const imp = getImpersonation(); if (imp) return imp;
      const s = safeGetSession(); return s ? (s.role || 'guest') : 'guest';
    }
    function realSessionRole() { const s = safeGetSession(); return s ? (s.role || 'guest') : 'guest'; }

    function roleToHomeHref(role) {
      role = (role || '').toLowerCase();
      if (role === 'admin') return 'home_admin.html';
      if (role === 'dm') return 'home_dm.html';
      return 'home.html';
    }

    function escapeHtml(str) { return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    // Reuse core hashPassword function
    async function _hashPassword(pw) { return await hashPassword(pw); }

    /* Dropdown utilities */
    function ensureDropdown(id) {
      let el = document.getElementById(id);
      if (el) return el;
      el = document.createElement('div');
      el.id = id;
      el.className = 'cm-dropdown';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="cm-dropdown-inner">…</div>';
      document.body.appendChild(el);
      return el;
    }
    function showDropdown(dropEl, anchorBtn) {
      if (!dropEl) return;
      closeAllDropdowns(dropEl);
      ensureDropdown(dropEl.id);
      dropEl.setAttribute('aria-hidden', 'false');
      anchorBtn && anchorBtn.setAttribute('aria-expanded', 'true');

      const rect = anchorBtn ? anchorBtn.getBoundingClientRect() : { bottom: 8, right: 8 };
      const top = Math.max(8, rect.bottom + window.scrollY + 8);
      const right = 8;
      Object.assign(dropEl.style, {
        position: 'fixed',
        top: `${top}px`,
        right: `${right}px`,
        left: 'auto',
        zIndex: '99999',
        display: 'block'
      });

      const popupRect = dropEl.getBoundingClientRect();
      const bottomSpace = window.innerHeight - rect.bottom - 16;
      if (popupRect.height > bottomSpace) {
        dropEl.style.maxHeight = (window.innerHeight - rect.bottom - 24) + 'px';
        dropEl.style.overflowY = 'auto';
      } else {
        dropEl.style.maxHeight = '';
        dropEl.style.overflowY = '';
      }
    }
    function hideDropdown(dropEl) {
      if (!dropEl) return;
      dropEl.setAttribute('aria-hidden', 'true');
      dropEl.style.display = 'none';
      const toggles = Array.from(document.querySelectorAll(`[aria-controls="${dropEl.id}"]`));
      toggles.forEach(t => t.setAttribute('aria-expanded', 'false'));
    }
    function closeAllDropdowns(except = null) {
      const drops = Array.from(document.querySelectorAll('.cm-dropdown, .cm-popover, .cm-toc-dropdown'));
      drops.forEach(d => { if (d !== except) hideDropdown(d); });
    }

    // outside click/esc (robust)
    document.addEventListener('click', (ev) => {
      const allDropdowns = Array.from(document.querySelectorAll('.cm-dropdown, .cm-popover, .cm-toc-dropdown'));
      let clickedInsideAny = false;
      for (const dd of allDropdowns) {
        if (dd.getAttribute('aria-hidden') === 'false' && (dd.contains(ev.target) || (document.querySelector(`[aria-controls="${dd.id}"]`) || {}).contains && document.querySelector(`[aria-controls="${dd.id}"]`).contains(ev.target))) {
          clickedInsideAny = true; break;
        }
      }
      if (!clickedInsideAny) closeAllDropdowns();
    }, true);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeAllDropdowns(); });

    /* TOC intentionally disabled */
    function buildTOC() {
      const tocEl = document.getElementById('toc-list');
      if (tocEl) { tocEl.style.display = 'none'; tocEl.setAttribute('aria-hidden','true'); }
      const tocToggle = document.getElementById('toc-toggle');
      if (tocToggle) tocToggle.style.display = 'none';
      return;
    }

    /* Settings dropdown */
    function buildSettingsDropdown(dropEl) {
      dropEl.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'cm-settings-inner';
      const cur = localStorage.getItem(THEME_KEY_LOCAL) || document.documentElement.getAttribute('data-theme') || 'dark';
      wrap.innerHTML = `
        <div style="padding:8px 12px; min-width:200px;">
          <div style="font-weight:600; margin-bottom:8px;">Einstellungen</div>
          <div style="margin-bottom:8px;">
            <label><input type="radio" name="cm-theme" value="dark"> Dark</label><br>
            <label><input type="radio" name="cm-theme" value="light"> Light</label><br>
            <label><input type="radio" name="cm-theme" value="fantasy"> Fantasy</label>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="cm-settings-cancel" class="cm-popbtn">Abbrechen</button>
            <button id="cm-settings-apply" class="cm-popbtn">Anwenden</button>
          </div>
        </div>
      `;
      dropEl.appendChild(wrap);
      dropEl.querySelectorAll('input[name="cm-theme"]').forEach(r => { if (r.value === cur) r.checked = true; });
      on(dropEl.querySelector('#cm-settings-cancel'), 'click', () => hideDropdown(dropEl));
      on(dropEl.querySelector('#cm-settings-apply'), 'click', () => {
        const sel = dropEl.querySelector('input[name="cm-theme"]:checked');
        const theme = sel ? sel.value : 'dark';
        if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function') {
          window.CodexMysteria.applyTheme(theme);
        } else {
          applyTheme(theme);
        }
        hideDropdown(dropEl);
      });
    }

    /* Guide dropdown */
    function buildGuideDropdown(dropEl) {
      dropEl.innerHTML = '';
      const html = `
        <div style="padding:8px 12px; min-width:220px;">
          <div style="font-weight:700; margin-bottom:6px;">Kurzanleitung</div>
          <div style="font-size:0.95rem; margin-bottom:8px;">
            <div><strong>Start:</strong> Führt zur Startseite für deinen Account-Typ.</div>
            <div><strong>Inhaltsverzeichnis:</strong> (deaktiviert)</div>
            <div><strong>Einstellungen:</strong> Theme wählen (Dark/Light/Fantasy).</div>
            <div><strong>Account:</strong> Username ändern, Passwort setzen, Abmelden.</div>
          </div>
          <div style="text-align:right;"><button id="cm-guide-close" class="cm-popbtn">Schließen</button></div>
        </div>
      `;
      dropEl.insertAdjacentHTML('beforeend', html);
      on(dropEl.querySelector('#cm-guide-close'), 'click', () => hideDropdown(dropEl));
    }

    /* Account dropdown */
    function buildAccountDropdown(dropEl) {
      dropEl.innerHTML = '';
      const sess = safeGetSession();
      const uname = sess ? (sess.username || '') : '';
      const role = effectiveRole();
      const html = `
        <div style="padding:8px 12px; min-width:240px;">
          <div style="font-weight:700; margin-bottom:6px;">Account</div>
          <label style="display:block; margin-bottom:6px;">Benutzername<br>
            <input id="cm-acc-name" type="text" value="${escapeHtml(uname)}" style="width:100%; padding:6px; margin-top:4px;">
          </label>
          <label style="display:block; margin-bottom:6px;">Neues Passwort<br>
            <div style="display:flex; gap:6px; align-items:center; margin-top:4px;">
              <input id="cm-acc-pass" type="password" placeholder="Leer = unverändert" style="flex:1; padding:6px;">
              <button id="cm-acc-pass-toggle" class="cm-btn" title="Passwort zeigen">👁️</button>
            </div>
          </label>
          <div style="margin:6px 0; color:var(--muted)">Rolle: <strong>${escapeHtml(role)}</strong></div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
            <button id="cm-acc-cancel" class="cm-popbtn">Abbrechen</button>
            <button id="cm-acc-save" class="cm-popbtn">Speichern</button>
          </div>
        </div>
      `;
      dropEl.insertAdjacentHTML('beforeend', html);
      on(dropEl.querySelector('#cm-acc-pass-toggle'), 'click', (ev) => {
        const ip = dropEl.querySelector('#cm-acc-pass'); if (!ip) return;
        ip.type = ip.type === 'password' ? 'text' : 'password';
      });
      on(dropEl.querySelector('#cm-acc-cancel'),'click', ()=> hideDropdown(dropEl));
      on(dropEl.querySelector('#cm-acc-save'),'click', async () => {
        const newName = dropEl.querySelector('#cm-acc-name').value.trim();
        const newPass = dropEl.querySelector('#cm-acc-pass').value;
        const s = safeGetSession();
        if (!s) { alert('Kein aktives Konto.'); hideDropdown(dropEl); return; }
        let accounts = [];
        try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY_LOCAL) || '[]'); } catch (e) { accounts = []; }
        const idx = accounts.findIndex(a => a.username && a.username.toLowerCase() === (s.username||'').toLowerCase());
        if (idx === -1) {
          try {
            const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY_LOCAL) || '{}');
            if (newName) sessRaw.username = newName;
            localStorage.setItem(SESSION_KEY_LOCAL, JSON.stringify(sessRaw));
          } catch(e){}
          alert('Session aktualisiert.');
          hideDropdown(dropEl);
          refreshHomeAndAccount();
          return;
        }
        if (newName && newName.toLowerCase() !== accounts[idx].username.toLowerCase()) {
          const dup = accounts.some((a,i)=> i!==idx && a.username.toLowerCase() === newName.toLowerCase());
          if (dup) { alert('Benutzername bereits vergeben.'); return; }
          accounts[idx].username = newName;
        }
        if (newPass) {
          try { accounts[idx].passwordHash = await _hashPassword(newPass); } catch(e) { alert('Fehler beim Speichern des Passworts'); return; }
        }
        localStorage.setItem(ACCOUNTS_KEY_LOCAL, JSON.stringify(accounts));
        try { const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY_LOCAL) || '{}'); if (newName) sessRaw.username = newName; localStorage.setItem(SESSION_KEY_LOCAL, JSON.stringify(sessRaw)); } catch(e){}
        alert('Account aktualisiert.');
        hideDropdown(dropEl);
        refreshHomeAndAccount();
      });
    }

    /* Admin dropdown */
    function buildAdminDropdown(dropEl) {
      dropEl.innerHTML = '';
      const html = `
        <div style="padding:8px 12px; min-width:220px;">
          <div style="font-weight:700; margin-bottom:8px;">Admin-Optionen</div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <button id="cm-admin-view-cycle" class="cm-popbtn">Ansicht wechseln (Cycle)</button>
            <button id="cm-admin-clear" class="cm-popbtn">Impersonation zurücksetzen</button>
            <a id="cm-admin-start" href="home_admin.html" class="cm-popbtn" style="text-decoration:none; display:inline-block;">Admin-Startseite</a>
          </div>
        </div>
      `;
      dropEl.insertAdjacentHTML('beforeend', html);
      on(dropEl.querySelector('#cm-admin-view-cycle'), 'click', () => {
        const current = getImpersonation() || realSessionRole();
        const idx = ROLES_CYCLE.indexOf(current) >= 0 ? ROLES_CYCLE.indexOf(current) : 0;
        const next = ROLES_CYCLE[(idx + 1) % ROLES_CYCLE.length];
        setImpersonation(next);
        alert('Ansicht gewechselt: ' + next);
        refreshHomeAndAccount();
      });
      on(dropEl.querySelector('#cm-admin-clear'), 'click', () => {
        clearImpersonation();
        alert('Impersonation entfernt. Rückkehr zur echten Sitzung.');
        refreshHomeAndAccount();
      });
    }

    /* Refresh UI elements (home link, account label, admin visibility) */
    function refreshHomeAndAccount() {
      const home = document.getElementById('home-btn');
      if (home) home.setAttribute('href', roleToHomeHref(effectiveRole()));
      const sess = safeGetSession();
      const unameEl = document.getElementById('account-username');
      if (unameEl) unameEl.textContent = sess ? (sess.username || 'Gast') : 'Gast';
      const popUser = document.getElementById('popover-username'); if (popUser) popUser.textContent = sess ? (sess.username || 'Gast') : 'Gast';
      const popRole = document.getElementById('popover-role'); if (popRole) popRole.textContent = effectiveRole();

      const adminCtrl = document.querySelector('.admin-control');
      if (adminCtrl) adminCtrl.style.display = (realSessionRole() === 'admin') ? '' : 'none';
    }

    /* Init wiring */
    function initDropdowns() {
      const accountDrop = document.getElementById('account-popover') || ensureDropdown('account-popover');
      const adminDrop = document.getElementById('admin-popover') || ensureDropdown('admin-popover');
      const guideDrop = ensureDropdown('dropdown-guide');
      const settingsDrop = ensureDropdown('dropdown-settings');

      buildAccountDropdown(accountDrop);
      buildAdminDropdown(adminDrop);
      buildGuideDropdown(guideDrop);
      buildSettingsDropdown(settingsDrop);

      // wire toggles
      const btnAccount = document.getElementById('account-toggle');
      if (btnAccount) { btnAccount.setAttribute('aria-controls', accountDrop.id); on(btnAccount, 'click', () => { showDropdown(accountDrop, btnAccount); }); }

      const btnAdmin = document.getElementById('admin-view-btn');
      if (btnAdmin) { btnAdmin.setAttribute('aria-controls', adminDrop.id); on(btnAdmin, 'click', () => { showDropdown(adminDrop, btnAdmin); }); }

      const btnGuide = document.getElementById('menu-guide-btn');
      if (btnGuide) { btnGuide.setAttribute('aria-controls', guideDrop.id); on(btnGuide, 'click', () => { showDropdown(guideDrop, btnGuide); }); }

      const btnSettings = document.getElementById('settings-btn');
      if (btnSettings) { btnSettings.setAttribute('aria-controls', settingsDrop.id); on(btnSettings, 'click', () => { showDropdown(settingsDrop, btnSettings); }); }

      // add close buttons inside each created dropdown (exclude toc-list)
      ['dropdown-guide','dropdown-settings','account-popover','admin-popover'].forEach(id => {
        const d = document.getElementById(id);
        if (!d) return;
        if (!d.querySelector('.cm-dropdown-close')) {
          const btn = document.createElement('button');
          btn.className = 'cm-dropdown-close';
          btn.textContent = '×';
          btn.style.position = 'absolute';
          btn.style.top = '6px';
          btn.style.right = '8px';
          btn.style.background = 'transparent';
          btn.style.border = 'none';
          btn.style.color = 'inherit';
          btn.style.cursor = 'pointer';
          btn.addEventListener('click', () => hideDropdown(d));
          d.style.position = d.style.position || 'fixed';
          d.style.zIndex = d.style.zIndex || '99999';
          d.insertBefore(btn, d.firstChild);
        }
      });

      refreshHomeAndAccount();
    }

    /* Bootstrap */
    function bootstrap() {
      const start = () => {
        const topbar = document.getElementById('site-topbar') || document.getElementById('main-header');
        if (!topbar) return false;
        initDropdowns();
        window.addEventListener('resize', () => { Array.from(document.querySelectorAll('.cm-dropdown')).forEach(d => { if (d.getAttribute('aria-hidden') === 'false') { const toggle = document.querySelector(`[aria-controls="${d.id}"]`); if (toggle) showDropdown(d, toggle); } }); });
        window.addEventListener('scroll', () => { Array.from(document.querySelectorAll('.cm-dropdown')).forEach(d => { if (d.getAttribute('aria-hidden') === 'false') { const toggle = document.querySelector(`[aria-controls="${d.id}"]`); if (toggle) showDropdown(d, toggle); } }); }, true);
        window.addEventListener('storage', (ev) => { if (ev.key === IMPERSONATE_KEY_LOCAL || ev.key === SESSION_KEY_LOCAL) { refreshHomeAndAccount(); }});
        window.addEventListener('codex:impersonation-changed', () => { refreshHomeAndAccount(); });
        window.addEventListener('codex:session-changed', () => { refreshHomeAndAccount(); });
        return true;
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (!start()) setTimeout(start, 200); });
      else if (!start()) setTimeout(start, 200);
    }

    // public API of MenuModule
    return {
      bootstrap,
      initDropdowns,
      refreshHomeAndAccount,
      setImpersonation, clearImpersonation
    };
  })();

  /* ===========================
     ===  Auto-loader für menu.html / menu.css
     =========================== */
  (function autoLoadMenu() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('login') || path.includes('register')) {
      console.log('[Codex Mysteria] Menü wird auf dieser Seite übersprungen.');
      return;
    }

    // Load CSS if not present
    if (!document.querySelector('link[href="menu.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'menu.css';
      document.head.appendChild(link);
      console.log('[Codex Mysteria] menu.css geladen.');
    }

    // Ensure container
    let container = document.getElementById('menu-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'menu-container';
      document.body.insertBefore(container, document.body.firstChild);
    }

    // If menu.html already in DOM (server-side included), just bootstrap menu
    if (container.innerHTML && container.innerHTML.trim().length > 0) {
      // Give small delay to ensure DOM nodes exist
      setTimeout(() => MenuModule.bootstrap(), 50);
      return;
    }

    // Fetch menu.html and insert, then bootstrap embedded MenuModule
    fetch('menu.html').then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }).then(html => {
      container.innerHTML = html;
      console.log('[Codex Mysteria] menu.html eingefügt.');
      // don't append a separate menu.js (we already have it embedded) — just bootstrap
      setTimeout(() => {
        try { MenuModule.bootstrap(); console.log('[Codex Mysteria] Menü initialisiert (embedded).'); } catch (e) { console.warn('[Codex Mysteria] Menü-Init fehlgeschlagen', e); }
      }, 50);
    }).catch(err => {
      console.warn('[Codex Mysteria] Menü konnte nicht geladen werden:', err);
    });
  })();

  /* ===========================
     ===  Expose API / Namespace
     =========================== */
  window.CodexMysteria = window.CodexMysteria || {};
  Object.assign(window.CodexMysteria, {
    // core
    createAccount,
    authenticate,
    guestLogin,
    logout,
    getSession,
    listAccounts,
    isAllowed,
    applyTheme,

    // keys (exportiert für Menu + andere Seiten)
    ACCOUNTS_KEY, SESSION_KEY, THEME_KEY, IMPERSONATE_KEY,

    // admin/debug
    _internal_allowedCodes: allowedCodes,

    // menu helpers
    setImpersonation: MenuModule.setImpersonation,
    clearImpersonation: MenuModule.clearImpersonation,
    menuRefresh: MenuModule.refreshHomeAndAccount
  });

  // Listen auf theme/session-änderungen, um UI ggf. zu aktualisieren
  window.addEventListener('codex:theme-changed', () => { /* weiterleiten / Platzhalter */ });
  window.addEventListener('codex:session-changed', () => { /* weiterleiten / Platzhalter */ });

  // Boot hint für Entwickler
  console.log('[Codex Mysteria] Core + Menu Module geladen.');

})();
