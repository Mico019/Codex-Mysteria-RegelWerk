/* menu.js
   Lightweight menu controller for the single-line topbar (menu.html).
   Implements:
    - Home button (role-aware)
    - Guide popup (explains each topbar control)
    - TOC dropdown (builds from main h2/h3 or [data-section])
    - Settings modal (Theme selection: dark/light/fantasy)
    - Account popover: Account info modal + logout
    - Admin view switch (Impersonation stored in localStorage, UI-only)
   Notes:
    - Requires menu.html structure (IDs: home-btn, page-desc-btn/menu-guide-btn,
      toc-toggle, toc-list, settings-btn, account-toggle, account-popover, admin-view-btn, admin-popover)
    - Uses window.CodexMysteria.getSession(), applyTheme(), logout(), and keys if available.
*/

(function () {
  'use strict';

  // ---- Config / keys ----
  const IMPERSONATE_KEY = 'codexmysteria_impersonate';
  const DEFAULT_TOC_ROOT = 'main';
  const THEME_KEY = (window.CodexMysteria && window.CodexMysteria.THEME_KEY) || 'codexmysteria_theme';
  const ACCOUNTS_KEY = (window.CodexMysteria && window.CodexMysteria.ACCOUNTS_KEY) || 'codexmysteria_accounts';
  const SESSION_KEY = (window.CodexMysteria && window.CodexMysteria.SESSION_KEY) || 'codexmysteria_session';

  // ---- tiny helpers ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function safeGetSession() {
    try { return window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function' ? window.CodexMysteria.getSession() : null; }
    catch (e) { console.warn('menu.js: safeGetSession error', e); return null; }
  }

  function getImpersonation() {
    return localStorage.getItem(IMPERSONATE_KEY) || null;
  }
  function setImpersonation(role) {
    if (!role) localStorage.removeItem(IMPERSONATE_KEY);
    else localStorage.setItem(IMPERSONATE_KEY, role);
    window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role } }));
  }
  function clearImpersonation() { setImpersonation(null); }

  function effectiveRole() {
    const imp = getImpersonation();
    if (imp) return imp;
    const s = safeGetSession();
    return s ? (s.role || 'guest') : 'guest';
  }

  function roleToHomeHref(role) {
    role = (role || '').toLowerCase();
    if (role === 'admin') return 'home_admin.html';
    if (role === 'dm') return 'home_dm.html';
    return 'home.html';
  }

  // Simple modal builder (small, accessible)
  function buildModal(id, title, bodyHtml) {
    let m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id;
    m.className = 'cm-modal';
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = `
      <div class="cm-modal-backdrop" data-role="backdrop"></div>
      <div class="cm-modal-panel card" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <button class="cm-modal-close" aria-label="Schließen">×</button>
        <h3 id="${id}-title" class="cm-modal-title">${escapeHtml(title)}</h3>
        <div class="cm-modal-body">${bodyHtml}</div>
        <div class="cm-modal-actions"></div>
      </div>
    `;
    document.body.appendChild(m);
    // close handlers
    m.querySelector('.cm-modal-close').addEventListener('click', () => hideModal(id));
    m.querySelector('[data-role="backdrop"]').addEventListener('click', () => hideModal(id));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && m.getAttribute('aria-hidden') === 'false') hideModal(id); });
    return m;
  }
  function showModal(id) { const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden', 'false'); const focusEl = m.querySelector('button, [href], input, select, textarea') || m; focusEl.focus(); }
  function hideModal(id) { const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden', 'true'); }

  // Password hash helper using SHA-256 (same approach as script.js)
  async function hashPassword(password) {
    const enc = new TextEncoder();
    const buf = enc.encode(password || '');
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ---- UI elements (expected to exist in menu.html) ----
  const elHome = () => $('#home-btn');
  const elTOCToggle = () => $('#toc-toggle');
  const elTOCList = () => $('#toc-list');
  const elGuideBtn = () => $('#menu-guide-btn');
  const elSettingsBtn = () => $('#settings-btn');
  const elAccountToggle = () => $('#account-toggle');
  const elAccountPopover = () => $('#account-popover');
  const elAccountUsername = () => $('#account-username');
  const elAdminBtn = () => $('#admin-view-btn');
  const elAdminPopover = () => $('#admin-popover');
  const elCurrentPageTitle = () => $('#current-page-title');

  // ---- Populate Home button href + username + admin visibility ----
  function updateHomeAndAccount() {
    const role = effectiveRole();
    const href = roleToHomeHref(role);
    const home = elHome();
    if (home) {
      home.setAttribute('href', href);
      // also ensure it doesn't open in new window etc
      home.addEventListener('click', (e) => {
        // normal navigation; nothing special
      });
    }
    // update username
    const sess = safeGetSession();
    const unameEl = elAccountUsername();
    if (unameEl) {
      unameEl.textContent = sess ? (sess.username || '—') : '—';
    }
    // show admin control if effectiveRole is admin
    const adminCtrl = document.querySelector('.admin-control');
    if (adminCtrl) adminCtrl.style.display = (effectiveRole() === 'admin') ? '' : 'none';
  }

  // ---- Build TOC list from main h2/h3 or [data-section] ----
  function buildTOC(rootSelector = DEFAULT_TOC_ROOT) {
    const toc = elTOCList();
    if (!toc) return;
    toc.innerHTML = ''; // clear
    const root = document.querySelector(rootSelector) || document.body;
    // prefer data-section
    let sections = Array.from(root.querySelectorAll('[data-section]'));
    if (!sections.length) sections = Array.from(root.querySelectorAll('h2, h3'));
    if (!sections.length) {
      const no = document.createElement('div');
      no.className = 'hint';
      no.textContent = 'Keine Abschnitte gefunden.';
      toc.appendChild(no);
      return;
    }
    sections.forEach((el, i) => {
      if (!el.id) {
        // create safe id
        const base = (el.textContent || 'section').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
        el.id = `cm-sec-${i}-${base}`;
      }
      const a = document.createElement('a');
      a.href = `#${el.id}`;
      a.textContent = el.textContent.trim();
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        document.getElementById(el.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
        // close toc dropdown
        closeTOC();
      });
      toc.appendChild(a);
    });

    // IntersectionObserver to update center title / highlight active TOC entry
    const links = Array.from(toc.querySelectorAll('a'));
    if ('IntersectionObserver' in window) {
      const opts = { root: null, rootMargin: '0px 0px -60% 0px', threshold: 0.15 };
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            const id = en.target.id;
            const link = toc.querySelector(`a[href="#${id}"]`);
            if (!link) return;
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            // update center title
            const titleEl = elCurrentPageTitle();
            if (titleEl) titleEl.textContent = en.target.textContent.trim();
          }
        });
      }, opts);
      // observe each section
      sections.forEach(s => obs.observe(s));
    } else {
      // fallback: set page title to document.title
      const titleEl = elCurrentPageTitle();
      if (titleEl) titleEl.textContent = document.title || '';
    }
  }

  // ---- TOC open/close helpers ----
  function toggleTOC() {
    const btn = elTOCToggle();
    const toc = elTOCList();
    if (!btn || !toc) return;
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', (!open).toString());
    toc.setAttribute('aria-hidden', open ? 'true' : 'false');
  }
  function closeTOC() {
    const btn = elTOCToggle();
    const toc = elTOCList();
    if (!btn || !toc) return;
    btn.setAttribute('aria-expanded', 'false');
    toc.setAttribute('aria-hidden', 'true');
  }

  // ---- Guide modal (explains topbar controls) ----
  function openGuide() {
    // try to collect data-desc attributes in page if any
    const descItems = {};
    // predefined basic entries
    descItems['Start'] = 'Leitet zur Startseite, passend zu deinem Accounttyp (Admin / DM / Spieler).';
    descItems['Inhaltsverzeichnis'] = 'Öffnet die Übersicht der Abschnitte dieser Seite (TOC), damit du direkt springen kannst.';
    descItems['Guide'] = 'Öffnet diese Kurzanleitung. CTRL-/CMD-Klick auf diesen Button kann erweitert sein.';
    descItems['Einstellungen'] = 'Öffnet die Einstellungen (z. B. Farbschema: Dark / Light / Fantasy).';
    descItems['Account'] = 'Account-Informationen anzeigen oder abmelden.';
    descItems['Admin'] = 'Nur für Admins: hier kannst du die Sicht eines anderen Accounttyps simulieren (View-as).';

    // also gather any page-provided data-desc attributes for additional context
    $$('[data-desc]').forEach(el => {
      const k = (el.dataset.descKey || el.id || el.tagName).toString().slice(0, 40);
      descItems[k] = el.dataset.desc;
    });

    // build modal content
    let html = '<div class="cm-guide-list">';
    for (const k in descItems) {
      html += `<div class="cm-guide-item"><strong>${escapeHtml(k)}</strong><div class="cm-guide-desc">${escapeHtml(descItems[k])}</div></div>`;
    }
    html += '</div>';
    const modal = buildModal('cm-guide-modal', 'Kurzanleitung', html);
    const actions = modal.querySelector('.cm-modal-actions');
    actions.innerHTML = '';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'OK';
    ok.addEventListener('click', () => hideModal('cm-guide-modal'));
    actions.appendChild(ok);
    showModal('cm-guide-modal');
  }

  // ---- Settings modal (Theme) ----
  function openSettings() {
    const body = `
      <p class="hint">Wähle ein Farbschema:</p>
      <div class="cm-settings-options">
        <label><input type="radio" name="cm-theme" value="dark"> Dark</label><br>
        <label><input type="radio" name="cm-theme" value="light"> Light</label><br>
        <label><input type="radio" name="cm-theme" value="fantasy"> Fantasy</label>
      </div>
    `;
    const modal = buildModal('cm-settings-modal', 'Einstellungen', body);
    const actions = modal.querySelector('.cm-modal-actions');
    actions.innerHTML = '';
    const cancel = document.createElement('button'); cancel.className = 'ghost'; cancel.textContent = 'Abbrechen';
    const apply = document.createElement('button'); apply.className = 'primary'; apply.textContent = 'Anwenden';
    actions.appendChild(cancel);
    actions.appendChild(apply);

    // set current selection
    const current = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute('data-theme') || 'dark';
    modal.querySelectorAll('input[name="cm-theme"]').forEach(r => { if (r.value === current) r.checked = true; });

    cancel.addEventListener('click', () => hideModal('cm-settings-modal'));
    apply.addEventListener('click', () => {
      const sel = modal.querySelector('input[name="cm-theme"]:checked');
      const theme = sel ? sel.value : 'dark';
      if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function') {
        window.CodexMysteria.applyTheme(theme);
      } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
      }
      hideModal('cm-settings-modal');
    });

    showModal('cm-settings-modal');
  }

  // ---- Account info modal (view + change password + show role) ----
  function openAccountInfo() {
    const sess = safeGetSession();
    const role = effectiveRole();
    const body = `
      <div>
        <label>Benutzername<br><input id="cm-account-name" type="text" value="${escapeHtml(sess ? (sess.username || '') : '')}"></label>
      </div>
      <div style="margin-top:8px;">
        <label>Neues Passwort (leer = unverändert)<br><input id="cm-account-pass" type="password"></label>
      </div>
      <div style="margin-top:8px;color:var(--cm-muted)">Rolle: <strong id="cm-account-role">${escapeHtml(role)}</strong></div>
    `;
    const modal = buildModal('cm-account-modal', 'Account-Informationen', body);
    const actions = modal.querySelector('.cm-modal-actions');
    actions.innerHTML = '';
    const cancel = document.createElement('button'); cancel.className = 'ghost'; cancel.textContent = 'Abbrechen';
    const save = document.createElement('button'); save.className = 'primary'; save.textContent = 'Speichern';
    actions.appendChild(cancel); actions.appendChild(save);

    cancel.addEventListener('click', () => hideModal('cm-account-modal'));
    save.addEventListener('click', async () => {
      const newName = document.getElementById('cm-account-name').value.trim();
      const newPass = document.getElementById('cm-account-pass').value;
      const s = safeGetSession();
      if (!s) { alert('Kein aktives Konto.'); hideModal('cm-account-modal'); return; }

      // update accounts in localStorage if available (script.js stores accounts in ACCOUNTS_KEY)
      let accounts = [];
      try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) { accounts = []; }
      const idx = accounts.findIndex(a => a.username && a.username.toLowerCase() === s.username.toLowerCase());
      if (idx === -1) {
        // fallback: nothing to update except session rename
        if (newName) {
          try {
            const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
            sessRaw.username = newName;
            localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw));
          } catch (e) { console.warn(e); }
        }
        hideModal('cm-account-modal');
        updateHomeAndAccount();
        return;
      }

      if (newName && newName.toLowerCase() !== accounts[idx].username.toLowerCase()) {
        // check duplicates
        const dup = accounts.some((a,i) => i !== idx && a.username.toLowerCase() === newName.toLowerCase());
        if (dup) { alert('Benutzername bereits vergeben.'); return; }
        accounts[idx].username = newName;
      }
      if (newPass) {
        try {
          const h = await hashPassword(newPass);
          accounts[idx].passwordHash = h;
        } catch (e) { console.error(e); alert('Fehler beim Speichern des Passworts'); return; }
      }
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      // update session if name changed
      try {
        const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
        if (newName) sessRaw.username = newName;
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw));
      } catch (e) { /* ignore */ }
      alert('Account aktualisiert.');
      hideModal('cm-account-modal');
      updateHomeAndAccount();
    });

    showModal('cm-account-modal');
  }

  // ---- Logout handler ----
  function doLogout() {
    if (window.CodexMysteria && typeof window.CodexMysteria.logout === 'function') {
      window.CodexMysteria.logout();
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    clearImpersonation();
    // redirect to login
    window.location.href = 'index.html';
  }

  // ---- Admin view switch handlers (UI-only impersonation) ----
  function openAdminView() {
    // toggle popover
    const pop = elAdminPopover();
    if (!pop) return;
    const isOpen = pop.getAttribute('aria-hidden') === 'false';
    pop.setAttribute('aria-hidden', (!isOpen).toString());
  }
  function setupAdminActions() {
    const pop = elAdminPopover();
    if (!pop) return;
    pop.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        if (action === 'view-as-admin') { setImpersonation('admin'); }
        else if (action === 'view-as-dm') { setImpersonation('dm'); }
        else if (action === 'view-as-player') { setImpersonation('player'); }
        else if (action === 'view-as-guest') { setImpersonation('guest'); }
        // after setting impersonation, update UI
        updateHomeAndAccount();
        // close popover
        pop.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // ---- wire account popover toggle and actions ----
  function setupAccountPopover() {
    const toggle = elAccountToggle();
    const pop = elAccountPopover();
    if (!toggle || !pop) return;
    toggle.addEventListener('click', (e) => {
      const opened = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', (!opened).toString());
      pop.setAttribute('aria-hidden', opened ? 'true' : 'false');
    });
    // actions inside popover
    pop.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const a = btn.getAttribute('data-action');
        if (a === 'account-info') openAccountInfo();
        else if (a === 'logout') doLogout();
        // close after action
        pop.setAttribute('aria-hidden', 'true');
        elAccountToggle().setAttribute('aria-expanded', 'false');
      });
    });
    // close on outside click
    document.addEventListener('click', (ev) => {
      const tog = elAccountToggle();
      const p = elAccountPopover();
      if (!tog || !p) return;
      if (!tog.contains(ev.target) && !p.contains(ev.target)) {
        p.setAttribute('aria-hidden', 'true');
        tog.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---- small init function to wire everything ----
  function initMenuTopbar() {
    // update links/user/admin visibility
    updateHomeAndAccount();

    // build TOC now
    buildTOC(DEFAULT_TOC_ROOT);

    // wire TOC toggle
    const tocBtn = elTOCToggle();
    if (tocBtn) {
      tocBtn.addEventListener('click', (e) => {
        const open = tocBtn.getAttribute('aria-expanded') === 'true';
        tocBtn.setAttribute('aria-expanded', (!open).toString());
        const toc = elTOCList();
        if (toc) toc.setAttribute('aria-hidden', open ? 'true' : 'false');
      });
    }

    // guide button
    const guide = elGuideBtn();
    if (guide) on(guide, 'click', () => openGuide());

    // settings
    const settings = elSettingsBtn();
    if (settings) on(settings, 'click', () => openSettings());

    // account popover actions
    setupAccountPopover();

    // admin actions
    const adminBtn = elAdminBtn();
    if (adminBtn) {
      on(adminBtn, 'click', () => openAdminView());
      setupAdminActions();
    }

    // keep UI in sync if session / impersonation changes in other tabs
    window.addEventListener('storage', (ev) => {
      if (ev.key === SESSION_KEY || ev.key === IMPERSONATE_KEY) {
        updateHomeAndAccount();
        buildTOC(DEFAULT_TOC_ROOT);
      }
    });

    // also listen to custom impersonation event
    window.addEventListener('codex:impersonation-changed', () => {
      updateHomeAndAccount();
      buildTOC(DEFAULT_TOC_ROOT);
    });

    // set current page title initially (if there is a #page-meta or document.title)
    const meta = document.getElementById('page-meta');
    const titleEl = elCurrentPageTitle();
    if (titleEl) {
      if (meta && meta.dataset && meta.dataset.pageDescriptionTitle) titleEl.textContent = meta.dataset.pageDescriptionTitle;
      else titleEl.textContent = document.title || '';
    }
  }

  // ---- bootstrap: wait until DOM is ready and topbar exists ----
  function bootstrapWhenReady() {
    // we expect menu.html already injected (via loader)
    const attemptInit = () => {
      const topbar = document.getElementById('site-topbar');
      if (!topbar) return false;
      // wire everything
      try {
        initMenuTopbar();
        return true;
      } catch (e) {
        console.error('menu.js init error', e);
        return false;
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (!attemptInit()) {
          // try again a bit later (if menu injected async)
          setTimeout(() => attemptInit(), 200);
        }
      });
    } else {
      if (!attemptInit()) setTimeout(() => attemptInit(), 200);
    }
  }

  // Expose small API for external use
  window.CodexMysteria = window.CodexMysteria || {};
  window.CodexMysteria.menuRebuild = function () {
    updateHomeAndAccount();
    buildTOC(DEFAULT_TOC_ROOT);
  };
  window.CodexMysteria.clearImpersonation = clearImpersonation;

  // Start
  bootstrapWhenReady();

})();
