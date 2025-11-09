/*
  menu.js — Topbar controller for Codex Mysteria
  - floats popovers to body, sets z-index, positions them
  - Home link role-aware (uses impersonation if set)
  - TOC builder + ScrollSpy
  - Guide modal, Settings modal (theme)
  - Account modal (username + password change) with password visibility toggle
  - Admin "view-as" impersonation
  - Robust: outside-click close, ESC close, storage syncing
*/

(function () {
  'use strict';

  /* ---------- Config / keys ---------- */
  const IMPERSONATE_KEY = 'codexmysteria_impersonate';
  const THEME_KEY = (window.CodexMysteria && window.CodexMysteria.THEME_KEY) || 'codexmysteria_theme';
  const ACCOUNTS_KEY = (window.CodexMysteria && window.CodexMysteria.ACCOUNTS_KEY) || 'codexmysteria_accounts';
  const SESSION_KEY  = (window.CodexMysteria && window.CodexMysteria.SESSION_KEY) || 'codexmysteria_session';
  const TOC_ROOT = 'main'; // default root selector for TOC generation

  /* ---------- tiny helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function log(...a){ console.debug('[menu.js]', ...a); }

  /* ---------- session / impersonation helpers ---------- */
  function safeGetSession(){
    try { return window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function' ? window.CodexMysteria.getSession() : (JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')); }
    catch(e){ return null; }
  }
  function getImpersonation(){ return localStorage.getItem(IMPERSONATE_KEY) || null; }
  function setImpersonation(role){ if (!role) localStorage.removeItem(IMPERSONATE_KEY); else localStorage.setItem(IMPERSONATE_KEY, role); window.dispatchEvent(new CustomEvent('codex:impersonation-changed',{detail:{role}})); }
  function clearImpersonation(){ localStorage.removeItem(IMPERSONATE_KEY); window.dispatchEvent(new CustomEvent('codex:impersonation-changed',{detail:{role:null}})); }
  function effectiveRole(){
    const imp = getImpersonation();
    if (imp) return imp;
    const s = safeGetSession();
    return s ? (s.role || 'guest') : 'guest';
  }
  function realSessionRole(){
    const s = safeGetSession();
    return s ? (s.role || 'guest') : 'guest';
  }
  function roleToHome(role){
    role = (role || '').toLowerCase();
    if (role === 'admin') return 'home_admin.html';
    if (role === 'dm') return 'home_dm.html';
    return 'home.html';
  }

  /* ---------- modal builder ---------- */
  function buildModal(id, title, bodyHtml){
    let m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id;
    m.className = 'cm-modal';
    m.setAttribute('aria-hidden','true');
    m.innerHTML = `
      <div class="cm-modal-backdrop" data-role="backdrop"></div>
      <div class="cm-modal-panel card" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <button class="cm-modal-close" aria-label="Schließen">×</button>
        <h3 id="${id}-title" class="cm-modal-title">${escapeHtml(title)}</h3>
        <div class="cm-modal-body">${bodyHtml}</div>
        <div class="cm-modal-actions"></div>
      </div>
    `;
    // Append to modal root if exists, else body
    const root = document.getElementById('cm-modals-root') || document.body;
    root.appendChild(m);

    // handlers
    m.querySelector('.cm-modal-close').addEventListener('click', ()=> hideModal(id));
    m.querySelector('[data-role="backdrop"]').addEventListener('click', ()=> hideModal(id));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.getAttribute('aria-hidden') === 'false') hideModal(id); });
    return m;
  }
  function showModal(id){
    const m = document.getElementById(id); if (!m) return;
    m.setAttribute('aria-hidden','false');
    // focus first interactive element
    const focus = m.querySelector('input,button,a,select,textarea') || m;
    focus.focus();
  }
  function hideModal(id){
    const m = document.getElementById(id); if (!m) return;
    m.setAttribute('aria-hidden','true');
  }

  /* ---------- password hashing helper (for storing) ---------- */
  async function hashPassword(pw){
    const enc = new TextEncoder(); const buf = enc.encode(pw||'');
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ---------- floating popovers helpers ---------- */
  function ensureInBody(el){
    if (!el) return;
    if (el.parentElement !== document.body) document.body.appendChild(el);
    // set base styles so JS can position
    el.style.position = 'fixed';
    el.style.zIndex = el.style.zIndex || '99999';
  }

  function ensureCloseButton(popEl){
    if (!popEl) return;
    if (popEl.querySelector('.cm-popover-close')) return;
    const btn = document.createElement('button');
    btn.className = 'cm-popover-close';
    btn.setAttribute('aria-label','Schließen');
    btn.textContent = '×';
    // simple inline style to make it visible; CSS file should also style it
    btn.style.cursor = 'pointer';
    popEl.insertBefore(btn, popEl.firstChild);
    btn.addEventListener('click', ()=> { hidePopover(popEl); });
  }

  function showPopover(popEl, anchorEl){
    if (!popEl || !anchorEl) { if(popEl) popEl.setAttribute('aria-hidden','false'); return; }
    ensureInBody(popEl);
    ensureCloseButton(popEl);
    popEl.setAttribute('aria-hidden','false');

    // position under anchor; prefer aligning right edge of pop to anchor right edge
    const rect = anchorEl.getBoundingClientRect();
    // allow popEl to be measured (if display none prior; ensure visible)
    popEl.style.left = '0px';
    popEl.style.top = '0px';
    popEl.style.transform = 'translate(0,0)';
    popEl.style.opacity = '1';
    // measure
    const popRect = popEl.getBoundingClientRect();
    const desiredLeft = Math.min(window.innerWidth - popRect.width - 8, Math.max(8, rect.right - popRect.width));
    const desiredTop = Math.min(window.innerHeight - popRect.height - 8, rect.bottom + 8);
    popEl.style.left = desiredLeft + 'px';
    popEl.style.top  = desiredTop + 'px';
  }

  function hidePopover(popEl){
    if (!popEl) return;
    popEl.setAttribute('aria-hidden','true');
    // clear inline position
    popEl.style.left = '';
    popEl.style.top = '';
  }

  // close all popovers on outside click (registered once)
  function initGlobalClickClose(){
    document.addEventListener('click', (ev) => {
      // if click is inside any open popover or its toggle, ignore; else close them
      const allPopovers = Array.from(document.querySelectorAll('.cm-popover, .cm-toc-dropdown'));
      allPopovers.forEach(pop => {
        if (pop.getAttribute('aria-hidden') === 'false') {
          const toggle = document.querySelector(`[aria-controls="${pop.id}"]`);
          const insidePop = pop.contains(ev.target);
          const isToggle = toggle && toggle.contains(ev.target);
          if (!insidePop && !isToggle) hidePopover(pop);
        }
      });
    }, true);
    // ESC close
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        Array.from(document.querySelectorAll('.cm-popover[aria-hidden="false"], .cm-toc-dropdown[aria-hidden="false"]'))
          .forEach(p => hidePopover(p));
      }
    });
  }

  /* ---------- TOC builder & scrollspy ---------- */
  let tocObserver = null;
  function buildTOC(rootSelector = TOC_ROOT){
    const toc = document.getElementById('toc-list');
    if (!toc) return;
    toc.innerHTML = '';
    const root = document.querySelector(rootSelector) || document.body;
    let sections = Array.from(root.querySelectorAll('[data-section]'));
    if (!sections.length) sections = Array.from(root.querySelectorAll('h2, h3'));
    if (!sections.length){
      const placeholder = document.createElement('div'); placeholder.className = 'cm-toc-inner'; placeholder.textContent = 'Keine Abschnitte gefunden.';
      toc.appendChild(placeholder); return;
    }
    sections.forEach((s, idx) => {
      if (!s.id) s.id = `cm-sec-${idx}-${s.textContent.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,'')}`;
      const a = document.createElement('a');
      a.href = `#${s.id}`;
      a.textContent = s.textContent.trim();
      a.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById(s.id).scrollIntoView({behavior:'smooth', block:'start'}); hideTOC(); });
      const li = document.createElement('div'); li.appendChild(a);
      toc.appendChild(li);
    });

    // IntersectionObserver for highlighting and updating center title
    if (tocObserver) tocObserver.disconnect();
    const links = Array.from(toc.querySelectorAll('a'));
    if ('IntersectionObserver' in window){
      const opts = { root: null, rootMargin: '0px 0px -60% 0px', threshold: 0.15 };
      tocObserver = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.target.id) return;
          const link = toc.querySelector(`a[href="#${en.target.id}"]`);
          if (!link) return;
          if (en.isIntersecting) {
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const titleEl = document.getElementById('current-page-title');
            if (titleEl) titleEl.textContent = en.target.textContent.trim();
          }
        });
      }, opts);
      sections.forEach(s => tocObserver.observe(s));
    } else {
      // fallback: set page title from document.title
      const titleEl = document.getElementById('current-page-title');
      if (titleEl) titleEl.textContent = document.title || '';
    }
  }
  function toggleTOC(){
    const btn = document.getElementById('toc-toggle'); const toc = document.getElementById('toc-list');
    if (!btn || !toc) return;
    const open = toc.getAttribute('aria-hidden') === 'false';
    if (!open) { buildTOC(TOC_ROOT); showPopover(toc, btn); btn.setAttribute('aria-expanded','true'); }
    else { hidePopover(toc); btn.setAttribute('aria-expanded','false'); }
  }
  function hideTOC(){ const btn=document.getElementById('toc-toggle'), toc=document.getElementById('toc-list'); if (!toc) return; toc.setAttribute('aria-hidden','true'); if (btn) btn.setAttribute('aria-expanded','false'); }

  /* ---------- Guide modal ---------- */
  function openGuide(){
    const mapping = {
      'Start': 'Leitet zur Startseite passend zu deinem Accounttyp (Admin/DM/Spieler).',
      'Inhaltsverzeichnis': 'Zeigt die Abschnitte dieser Seite, damit du direkt springen kannst.',
      'Guide': 'Öffnet diese Kurzanleitung.',
      'Einstellungen': 'Ändere das Farbschema (Dark / Light / Fantasy).',
      'Account': 'Account-Informationen anzeigen oder Abmelden.',
      'Admin': 'Nur für Admins: Ansicht eines anderen Accounttyps simulieren (View-as).'
    };
    // include page-provided data-desc
    $$('[data-desc]').forEach(el => { const key = el.dataset.descKey || el.id || el.tagName; mapping[key] = el.dataset.desc; });

    let html = '<div class="cm-guide-list">';
    for (const k in mapping) html += `<div class="cm-guide-item"><strong>${escapeHtml(k)}</strong><div class="cm-guide-desc">${escapeHtml(mapping[k])}</div></div>`;
    html += '</div>';
    const m = buildModal('cm-guide-modal', 'Kurzanleitung', html);
    const actions = m.querySelector('.cm-modal-actions'); actions.innerHTML = '';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'OK'; ok.addEventListener('click', ()=> hideModal('cm-guide-modal'));
    actions.appendChild(ok);
    showModal('cm-guide-modal');
  }

  /* ---------- Settings modal (theme) ---------- */
  function openSettings(){
    const bodyHtml = `
      <p class="hint">Wähle ein Farbschema:</p>
      <label><input type="radio" name="cm-theme" value="dark"> Dark</label><br>
      <label><input type="radio" name="cm-theme" value="light"> Light</label><br>
      <label><input type="radio" name="cm-theme" value="fantasy"> Fantasy</label>
    `;
    const m = buildModal('cm-settings-modal','Einstellungen', bodyHtml);
    const actions = m.querySelector('.cm-modal-actions'); actions.innerHTML = '';
    const cancel = document.createElement('button'); cancel.className='ghost'; cancel.textContent='Abbrechen';
    const apply = document.createElement('button'); apply.className='primary'; apply.textContent='Anwenden';
    actions.appendChild(cancel); actions.appendChild(apply);

    // set current selection
    const cur = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute('data-theme') || (document.body.classList.contains('dark') ? 'dark' : 'dark');
    m.querySelectorAll('input[name="cm-theme"]').forEach(r => { if (r.value === cur) r.checked = true; });

    cancel.addEventListener('click', ()=> hideModal('cm-settings-modal'));
    apply.addEventListener('click', ()=> {
      const sel = m.querySelector('input[name="cm-theme"]:checked');
      const theme = sel ? sel.value : 'dark';
      if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function') {
        window.CodexMysteria.applyTheme(theme);
      } else {
        // fallback: set body class and localStorage
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.remove('light','dark','mystic','fantasy');
        document.body.classList.add(theme === 'light' ? 'light' : (theme === 'fantasy' ? 'mystic' : 'dark'));
        localStorage.setItem(THEME_KEY, theme);
      }
      hideModal('cm-settings-modal');
    });

    showModal('cm-settings-modal');
  }

  /* ---------- Account modal (username + password with visibility toggle) ---------- */
  function openAccountModal(){
    const sess = safeGetSession();
    const role = effectiveRole();
    const currentName = sess ? (sess.username || '') : '';
    const body = `
      <div>
        <label>Benutzername<br><input id="cm-account-name" type="text" value="${escapeHtml(currentName)}"></label>
      </div>
      <div style="margin-top:8px;">
        <label>Passwort (neu)<br>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="cm-account-pass" type="password" placeholder="Leer lassen = unverändert">
            <button id="cm-account-pass-toggle" class="cm-btn" type="button" title="Passwort anzeigen">👁️</button>
          </div>
        </label>
      </div>
      <div style="margin-top:10px;color:var(--muted)">Rolle: <strong id="cm-account-role">${escapeHtml(role)}</strong></div>
    `;
    const m = buildModal('cm-account-modal','Account-Informationen', body);
    const actions = m.querySelector('.cm-modal-actions'); actions.innerHTML = '';
    const cancel = document.createElement('button'); cancel.className='ghost'; cancel.textContent='Abbrechen';
    const save = document.createElement('button'); save.className='primary'; save.textContent='Speichern';
    actions.appendChild(cancel); actions.appendChild(save);

    cancel.addEventListener('click', ()=> hideModal('cm-account-modal'));
    // toggle eye
    on(m.querySelector('#cm-account-pass-toggle'), 'click', () => {
      const ip = m.querySelector('#cm-account-pass'); if (!ip) return;
      ip.type = ip.type === 'password' ? 'text' : 'password';
    });

    save.addEventListener('click', async () => {
      const newName = m.querySelector('#cm-account-name').value.trim();
      const newPass = m.querySelector('#cm-account-pass').value;
      const s = safeGetSession();
      if (!s) { alert('Kein aktives Konto.'); hideModal('cm-account-modal'); return; }

      // update local accounts store if applicable; otherwise update session object
      let accounts = [];
      try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch(e){ accounts = []; }
      const idx = accounts.findIndex(a => a.username && a.username.toLowerCase() === (s.username||'').toLowerCase());
      if (idx === -1) {
        // fallback: update session only
        try {
          const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
          if (newName) sessRaw.username = newName;
          localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw));
        } catch(e){}
        alert('Session aktualisiert.');
        hideModal('cm-account-modal');
        refreshHomeAndAccount();
        return;
      }
      // check name change
      if (newName && newName.toLowerCase() !== accounts[idx].username.toLowerCase()){
        const dup = accounts.some((a,i)=> i!==idx && a.username.toLowerCase() === newName.toLowerCase());
        if (dup) { alert('Benutzername bereits vergeben.'); return; }
        accounts[idx].username = newName;
      }
      if (newPass){
        try { accounts[idx].passwordHash = await hashPassword(newPass); } catch(e){ alert('Fehler beim Speichern des Passworts'); return; }
      }
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      // update session username if changed
      try { const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); if (newName) sessRaw.username = newName; localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw)); } catch(e){}
      alert('Account aktualisiert.');
      hideModal('cm-account-modal');
      refreshHomeAndAccount();
    });

    showModal('cm-account-modal');
  }

  /* ---------- Logout ---------- */
  function doLogout(){
    if (window.CodexMysteria && typeof window.CodexMysteria.logout === 'function') {
      window.CodexMysteria.logout();
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    clearImpersonation();
    // redirect to index/login
    window.location.href = 'index.html';
  }

  /* ---------- Admin popover init ---------- */
  function initAdmin(){
    const adminBtn = document.getElementById('admin-view-btn');
    const adminPop = document.getElementById('admin-popover');
    if (!adminBtn || !adminPop) return;
    // ensure floating + close button
    ensureInBody(adminPop);
    ensureCloseButton(adminPop);
    // toggle
    adminBtn.addEventListener('click', (e) => {
      const open = adminPop.getAttribute('aria-hidden') === 'false';
      if (!open) showPopover(adminPop, adminBtn); else hidePopover(adminPop);
    });
    // actions
    adminPop.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const action = btn.getAttribute('data-action');
        if (action === 'view-as-admin') setImpersonation('admin');
        else if (action === 'view-as-dm') setImpersonation('dm');
        else if (action === 'view-as-player') setImpersonation('player');
        else if (action === 'view-as-guest') setImpersonation('guest');
        // after impersonation: refresh UI
        refreshHomeAndAccount();
        hidePopover(adminPop);
      });
    });
  }

  /* ---------- Account popover init ---------- */
  function initAccount(){
    const accBtn = document.getElementById('account-toggle');
    const accPop = document.getElementById('account-popover');
    if (!accBtn || !accPop) return;
    ensureInBody(accPop);
    ensureCloseButton(accPop);
    // toggle
    accBtn.addEventListener('click', (e) => {
      const open = accPop.getAttribute('aria-hidden') === 'false';
      if (!open) showPopover(accPop, accBtn); else hidePopover(accPop);
    });
    // bind actions inside popover
    accPop.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const a = btn.getAttribute('data-action');
        if (a === 'account-info') openAccountModal();
        else if (a === 'settings') openSettings();
        else if (a === 'logout') doLogout();
        hidePopover(accPop);
      });
    });
  }

  /* ---------- Home & account refresh ---------- */
  function refreshHomeAndAccount(){
    // set home link according to effective role (includes impersonation)
    const home = document.getElementById('home-btn');
    if (home) home.setAttribute('href', roleToHome(effectiveRole()));
    // update username
    const sess = safeGetSession();
    const uname = document.getElementById('account-username');
    if (uname) uname.textContent = sess ? (sess.username || '—') : '—';
    const popUser = document.getElementById('popover-username');
    if (popUser) popUser.textContent = sess ? (sess.username || '—') : '—';
    const popRole = document.getElementById('popover-role');
    if (popRole) popRole.textContent = effectiveRole();

    // admin-control visibility: show only if real session is admin
    const adminControl = document.querySelector('.admin-control');
    if (adminControl) {
      adminControl.style.display = (realSessionRole() === 'admin') ? '' : 'none';
    }
  }

  /* ---------- init topbar wiring ---------- */
  function initTopbar(){
    // wire home (click will follow href)
    const home = document.getElementById('home-btn');
    if (home) home.addEventListener('click', ()=> { /* no-op; native navigation */ });

    // TOC toggle
    on(document.getElementById('toc-toggle'), 'click', ()=> toggleTOC());

    // guide & settings
    on(document.getElementById('menu-guide-btn'), 'click', ()=> openGuide());
    on(document.getElementById('settings-btn'), 'click', ()=> openSettings());

    // account & admin
    initAccount();
    initAdmin();

    // global click close
    initGlobalClickClose();

    // initial population
    refreshHomeAndAccount();
    buildTOC(TOC_ROOT);

    // reposition popovers on resize/scroll so they remain visible
    window.addEventListener('resize', () => {
      Array.from(document.querySelectorAll('.cm-popover[aria-hidden="false"], .cm-toc-dropdown[aria-hidden="false"]')).forEach(pop => {
        const ctrlId = Array.from(document.querySelectorAll('[aria-controls]')).find(el => el.getAttribute('aria-controls') === pop.id);
        if (ctrlId) showPopover(pop, ctrlId);
      });
    });
    window.addEventListener('scroll', () => {
      // keep popover below the toggle if open
      Array.from(document.querySelectorAll('.cm-popover[aria-hidden="false"], .cm-toc-dropdown[aria-hidden="false"]')).forEach(pop => {
        const ctrl = Array.from(document.querySelectorAll('[aria-controls]')).find(el => el.getAttribute('aria-controls') === pop.id);
        if (ctrl) showPopover(pop, ctrl);
      });
    }, true);

    // sync on storage changes (other tab)
    window.addEventListener('storage', (ev) => {
      if (ev.key === IMPERSONATE_KEY || ev.key === SESSION_KEY) {
        refreshHomeAndAccount();
        buildTOC(TOC_ROOT);
      }
    });

    // listen to our custom impersonation event to refresh quickly
    window.addEventListener('codex:impersonation-changed', ()=> { refreshHomeAndAccount(); buildTOC(TOC_ROOT); });

    // small accessibility: ensure any .cm-popover-close works
    $$('.cm-popover-close').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const pop = btn.closest('.cm-popover, .cm-toc-dropdown');
        if (pop) hidePopover(pop);
      });
    });
  }

  /* ---------- bootstrap when DOM ready ---------- */
  function bootstrap(){
    const start = () => {
      const topbar = document.getElementById('site-topbar') || document.getElementById('main-header');
      if (!topbar) return false;
      try { initTopbar(); return true; } catch(e){ console.error('menu.js init error', e); return false; }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { if (!start()) setTimeout(start, 200); });
    } else { if (!start()) setTimeout(start, 200); }
  }

  // Expose small API
  window.CodexMysteria = window.CodexMysteria || {};
  window.CodexMysteria.menuRefresh = function(){ refreshHomeAndAccount(); buildTOC(TOC_ROOT); };
  window.CodexMysteria.clearImpersonation = clearImpersonation;
  window.CodexMysteria.setImpersonation = setImpersonation;

  // Start
  bootstrap();

})();
