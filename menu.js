/* menu.js — Dropdown-basiertes Topbar-Menü
   - ersetzt Popups durch Dropdowns (Guide, Settings, Account, Admin, TOC)
   - Dropdowns öffnen rechts am Bildschirm unter dem zugehörigen Button
   - Outside-click, ESC, Close-Buttons funktionieren
   - Account-Impersonation (View-as) zyklisch/back-to-admin repariert
   - Erstellt fehlende Dropdown-Container automatisch
*/

(function () {
  'use strict';

  /* --------- Konfiguration / Keys --------- */
  const IMPERSONATE_KEY = 'codexmysteria_impersonate';
  const THEME_KEY = (window.CodexMysteria && window.CodexMysteria.THEME_KEY) || 'codexmysteria_theme';
  const ACCOUNTS_KEY = (window.CodexMysteria && window.CodexMysteria.ACCOUNTS_KEY) || 'codexmysteria_accounts';
  const SESSION_KEY  = (window.CodexMysteria && window.CodexMysteria.SESSION_KEY) || 'codexmysteria_session';
  const ROLES_CYCLE = ['admin', 'dm', 'player', 'guest'];

  /* --------- Hilfsfunktionen --------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

  function safeGetSession() {
    try {
      if (window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function') return window.CodexMysteria.getSession();
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (e) { return null; }
  }

  function getImpersonation() { return localStorage.getItem(IMPERSONATE_KEY) || null; }
  function setImpersonation(role) { if (!role) localStorage.removeItem(IMPERSONATE_KEY); else localStorage.setItem(IMPERSONATE_KEY, role); window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role } })); }
  function clearImpersonation() { localStorage.removeItem(IMPERSONATE_KEY); window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role: null } })); }

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

  async function hashPassword(pw) {
    const enc = new TextEncoder();
    const buf = enc.encode(pw || '');
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* --------- Dropdown-Utility (erstellt Container falls nötig) --------- */
  function ensureDropdown(id) {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = 'cm-dropdown';
    el.setAttribute('aria-hidden', 'true');
    // simple default content placeholder; real content will be filled later where needed
    el.innerHTML = '<div class="cm-dropdown-inner">...</div>';
    document.body.appendChild(el); // append to body so z-index/stacking is safe
    return el;
  }

  function showDropdown(dropEl, anchorBtn) {
    if (!dropEl) return;
    // close other dropdowns
    closeAllDropdowns(dropEl);
    ensureDropdown(dropEl.id);
    dropEl.setAttribute('aria-hidden', 'false');
    anchorBtn && anchorBtn.setAttribute('aria-expanded', 'true');

    // position: always aligned to RIGHT side of screen, below button
    const rect = anchorBtn ? anchorBtn.getBoundingClientRect() : { bottom: 8, right: 8 };
    const top = Math.max(8, rect.bottom + window.scrollY + 8);
    const right = 8; // fixed right margin
    Object.assign(dropEl.style, {
      position: 'fixed',
      top: `${top}px`,
      right: `${right}px`,
      left: 'auto',
      zIndex: '99999',
      display: 'block'
    });

    // auto adjust height if it would go off screen
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
    // reset anchor expanded attributes where possible
    const toggles = Array.from(document.querySelectorAll(`[aria-controls="${dropEl.id}"]`));
    toggles.forEach(t => t.setAttribute('aria-expanded', 'false'));
  }

  function closeAllDropdowns(except = null) {
    const drops = Array.from(document.querySelectorAll('.cm-dropdown, .cm-popover, .cm-toc-dropdown'));
    drops.forEach(d => { if (d !== except) hideDropdown(d); });
  }

  /* Close on outside click — robust */
  document.addEventListener('click', (ev) => {
    // if click is inside any open dropdown or its toggle, do nothing; otherwise close
    const allDropdowns = Array.from(document.querySelectorAll('.cm-dropdown, .cm-popover, .cm-toc-dropdown'));
    let clickedInsideAny = false;
    for (const dd of allDropdowns) {
      if (dd.getAttribute('aria-hidden') === 'false' && (dd.contains(ev.target) || (document.querySelector(`[aria-controls="${dd.id}"]`) || {}).contains && document.querySelector(`[aria-controls="${dd.id}"]`).contains(ev.target))) {
        clickedInsideAny = true; break;
      }
    }
    if (!clickedInsideAny) closeAllDropdowns();
  }, true);

  // ESC closes dropdowns
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeAllDropdowns();
  });

  /* --------- TOC (Inhaltsverzeichnis) bauen --------- */
  let tocObserver = null;
  function buildTOC(rootSelector = 'main') {
    const tocContainer = document.getElementById('toc-list') || ensureDropdown('toc-list');
    tocContainer.innerHTML = ''; // clear
    const root = document.querySelector(rootSelector) || document.body;
    let sections = Array.from(root.querySelectorAll('[data-section]'));
    if (!sections.length) sections = Array.from(root.querySelectorAll('h2, h3'));
    if (!sections.length) {
      const no = document.createElement('div'); no.className = 'cm-toc-inner'; no.textContent = 'Keine Abschnitte gefunden.'; tocContainer.appendChild(no);
      return;
    }
    sections.forEach((s, i) => {
      if (!s.id) s.id = `cm-sec-${i}-${s.textContent.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,'')}`;
      const a = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.textContent.trim();
      a.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById(s.id).scrollIntoView({ behavior: 'smooth', block: 'start' }); hideDropdown(tocContainer); });
      const wrap = document.createElement('div'); wrap.appendChild(a);
      tocContainer.appendChild(wrap);
    });

    // scrollspy: observe sections and update center title + active link
    if (tocObserver) tocObserver.disconnect();
    const links = Array.from(tocContainer.querySelectorAll('a'));
    if ('IntersectionObserver' in window) {
      tocObserver = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.target.id) return;
          const link = tocContainer.querySelector(`a[href="#${en.target.id}"]`);
          if (!link) return;
          if (en.isIntersecting) {
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const titleEl = document.getElementById('current-page-title');
            if (titleEl) titleEl.textContent = en.target.textContent.trim();
          }
        });
      }, { root: null, rootMargin: '0px 0px -60% 0px', threshold: 0.15 });
      sections.forEach(s => tocObserver.observe(s));
    } else {
      const titleEl = document.getElementById('current-page-title');
      if (titleEl) titleEl.textContent = document.title || '';
    }
  }

  /* --------- Einstellungen (Dropdown Inhalt) --------- */
  function buildSettingsDropdown(dropEl) {
    dropEl.innerHTML = ''; // clear
    const wrap = document.createElement('div');
    wrap.className = 'cm-settings-inner';
    const cur = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute('data-theme') || (document.body.classList.contains('dark') ? 'dark' : 'dark');
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
    // preselect
    dropEl.querySelectorAll('input[name="cm-theme"]').forEach(r => { if (r.value === cur) r.checked = true; });
    // handlers
    on(dropEl.querySelector('#cm-settings-cancel'), 'click', () => hideDropdown(dropEl));
    on(dropEl.querySelector('#cm-settings-apply'), 'click', () => {
      const sel = dropEl.querySelector('input[name="cm-theme"]:checked');
      const theme = sel ? sel.value : 'dark';
      if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function') {
        window.CodexMysteria.applyTheme(theme);
      } else {
        document.documentElement.setAttribute('data-theme', theme);
        // keep body classes backward-compatible
        document.body.classList.remove('light','dark','mystic','fantasy');
        if (theme === 'light') document.body.classList.add('light');
        else if (theme === 'fantasy') document.body.classList.add('mystic');
        else document.body.classList.add('dark');
        localStorage.setItem(THEME_KEY, theme);
      }
      hideDropdown(dropEl);
    });
  }

  /* --------- Guide (Dropdown Inhalt) --------- */
  function buildGuideDropdown(dropEl) {
    dropEl.innerHTML = '';
    const html = `
      <div style="padding:8px 12px; min-width:220px;">
        <div style="font-weight:700; margin-bottom:6px;">Kurzanleitung</div>
        <div style="font-size:0.95rem; margin-bottom:8px;">
          <div><strong>Start:</strong> Führt zur Startseite für deinen Account-Typ.</div>
          <div><strong>Inhaltsverzeichnis:</strong> Zeigt Abschnitte der aktuellen Seite.</div>
          <div><strong>Einstellungen:</strong> Theme wählen (Dark/Light/Fantasy).</div>
          <div><strong>Account:</strong> Username ändern, Passwort setzen, Abmelden.</div>
        </div>
        <div style="text-align:right;"><button id="cm-guide-close" class="cm-popbtn">Schließen</button></div>
      </div>
    `;
    dropEl.insertAdjacentHTML('beforeend', html);
    on(dropEl.querySelector('#cm-guide-close'), 'click', () => hideDropdown(dropEl));
  }

  /* --------- Account Dropdown (Inline edit) --------- */
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
    // handlers
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
      // update local accounts list if exists
      let accounts = [];
      try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) { accounts = []; }
      const idx = accounts.findIndex(a => a.username && a.username.toLowerCase() === (s.username||'').toLowerCase());
      if (idx === -1) {
        // update session object if present
        try {
          const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
          if (newName) sessRaw.username = newName;
          localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw));
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
        try { accounts[idx].passwordHash = await hashPassword(newPass); } catch(e) { alert('Fehler beim Speichern des Passworts'); return; }
      }
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      // also update session username
      try { const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); if (newName) sessRaw.username = newName; localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw)); } catch(e){}
      alert('Account aktualisiert.');
      hideDropdown(dropEl);
      refreshHomeAndAccount();
    });
  }

  /* --------- Admin Dropdown Inhalt (View-as cycle + goto admin start) --------- */
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
      // cycle impersonation: admin -> dm -> player -> guest -> admin ...
      const current = getImpersonation() || realSessionRole();
      const idx = ROLES_CYCLE.indexOf(current) >= 0 ? ROLES_CYCLE.indexOf(current) : 0;
      const next = ROLES_CYCLE[(idx + 1) % ROLES_CYCLE.length];
      setImpersonation(next);
      alert('Ansicht gewechselt: ' + next);
      refreshHomeAndAccount();
      // keep dropdown open but update contents if necessary
    });
    on(dropEl.querySelector('#cm-admin-clear'), 'click', () => {
      clearImpersonation();
      alert('Impersonation entfernt. Rückkehr zur echten Sitzung.');
      refreshHomeAndAccount();
    });
  }

  /* --------- Refresh Home link + account label + admin visibility --------- */
  function refreshHomeAndAccount() {
    const home = document.getElementById('home-btn');
    if (home) home.setAttribute('href', roleToHomeHref(effectiveRole()));
    const sess = safeGetSession();
    const unameEl = document.getElementById('account-username');
    if (unameEl) unameEl.textContent = sess ? (sess.username || 'Gast') : 'Gast';
    const popUser = document.getElementById('popover-username'); if (popUser) popUser.textContent = sess ? (sess.username || 'Gast') : 'Gast';
    const popRole = document.getElementById('popover-role'); if (popRole) popRole.textContent = effectiveRole();

    // admin controls visible only if real session role is admin
    const adminCtrl = document.querySelector('.admin-control');
    if (adminCtrl) adminCtrl.style.display = (realSessionRole() === 'admin') ? '' : 'none';
  }

    /* --------- Init wiring (buttons -> dropdowns) --------- */
  function initDropdowns() {
    // ensure containers exist (reuse ids used in your HTML)
    const toc = ensureDropdown('toc-list');
    const accountDrop = document.getElementById('account-popover') || ensureDropdown('account-popover');
    const adminDrop = document.getElementById('admin-popover') || ensureDropdown('admin-popover');
    const guideDrop = ensureDropdown('dropdown-guide');
    const settingsDrop = ensureDropdown('dropdown-settings');

    // build content (nur befüllen, nicht öffnen!)
    buildTOC();
    buildAccountDropdown(accountDrop);
    buildAdminDropdown(adminDrop);
    buildGuideDropdown(guideDrop);
    buildSettingsDropdown(settingsDrop);

    // **ALLE Dropdowns initial sicher geschlossen**
    [toc, accountDrop, adminDrop, guideDrop, settingsDrop].forEach(d => hideDropdown(d));

    // wire toggles
    const bindToggle = (btnId, dropEl) => {
      const btn = document.getElementById(btnId);
      if (!btn || !dropEl) return;
      btn.setAttribute('aria-controls', dropEl.id);
      on(btn, 'click', (ev) => {
        ev.stopPropagation();
        const isOpen = dropEl.getAttribute('aria-hidden') === 'false';
        closeAllDropdowns();
        if (!isOpen) showDropdown(dropEl, btn);
      });
    };

    bindToggle('toc-toggle', toc);
    bindToggle('account-toggle', accountDrop);
    bindToggle('admin-view-btn', adminDrop);
    bindToggle('menu-guide-btn', guideDrop);
    bindToggle('settings-btn', settingsDrop);

    // Add close buttons if missing
    ['dropdown-guide','dropdown-settings','account-popover','admin-popover','toc-list'].forEach(id => {
      const d = document.getElementById(id);
      if (!d) return;
      if (!d.querySelector('.cm-dropdown-close')) {
        const btn = document.createElement('button');
        btn.className = 'cm-dropdown-close';
        btn.textContent = '×';
        Object.assign(btn.style, {
          position: 'absolute',
          top: '6px',
          right: '8px',
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '1.1rem'
        });
        btn.addEventListener('click', () => hideDropdown(d));
        d.style.position = d.style.position || 'fixed';
        d.style.zIndex = d.style.zIndex || '99999';
        d.insertBefore(btn, d.firstChild);
      }
    });

    refreshHomeAndAccount();
  }

  /* --------- Bootstrapping (DOM ready) --------- */
  function bootstrap() {
    const start = () => {
      const topbar = document.getElementById('site-topbar') || document.getElementById('main-header');
      if (!topbar) return false;
      initDropdowns();

      // reposition open dropdowns on resize/scroll
      const repositionOpen = () => {
        Array.from(document.querySelectorAll('.cm-dropdown')).forEach(d => {
          if (d.getAttribute('aria-hidden') === 'false') {
            const toggle = document.querySelector(`[aria-controls="${d.id}"]`);
            if (toggle) showDropdown(d, toggle);
          }
        });
      };
      window.addEventListener('resize', repositionOpen);
      window.addEventListener('scroll', repositionOpen, true);

      // update when impersonation changes (cross-tab)
      window.addEventListener('storage', (ev) => {
        if (ev.key === IMPERSONATE_KEY || ev.key === SESSION_KEY) {
          refreshHomeAndAccount();
          buildTOC();
        }
      });
      window.addEventListener('codex:impersonation-changed', () => {
        refreshHomeAndAccount();
        buildTOC();
      });

      return true;
    };

    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', () => { if (!start()) setTimeout(start, 200); });
    else if (!start()) setTimeout(start, 200);
  }
