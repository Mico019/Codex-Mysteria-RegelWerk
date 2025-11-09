/* menu.js — Aktualisiert: Popovers über allen Content, Close-Buttons, Account-passwort-👁️ toggle
   Erwartet die topbar-HTML (menu.html) mit IDs:
     home-btn, toc-toggle, toc-list, menu-guide-btn, settings-btn,
     account-toggle, account-popover, admin-view-btn, admin-popover, current-page-title
   Benötigt: window.CodexMysteria.getSession(), logout(), applyTheme() optional.
*/
(function(){
  'use strict';

  const IMPERSONATE_KEY = 'codexmysteria_impersonate';
  const THEME_KEY = (window.CodexMysteria && window.CodexMysteria.THEME_KEY) || 'codexmysteria_theme';
  const ACCOUNTS_KEY = (window.CodexMysteria && window.CodexMysteria.ACCOUNTS_KEY) || 'codexmysteria_accounts';
  const SESSION_KEY  = (window.CodexMysteria && window.CodexMysteria.SESSION_KEY) || 'codexmysteria_session';
  const DEFAULT_TOC_ROOT = 'main';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from((r||document).querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function safeSession(){ try { return window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function' ? window.CodexMysteria.getSession() : null; } catch(e){ return null; } }
  function getImpersonation(){ return localStorage.getItem(IMPERSONATE_KEY) || null; }
  function setImpersonation(role){ if (!role) localStorage.removeItem(IMPERSONATE_KEY); else localStorage.setItem(IMPERSONATE_KEY, role); window.dispatchEvent(new CustomEvent('codex:impersonation-changed',{detail:{role}})); }
  function clearImpersonation(){ setImpersonation(null); }
  function effectiveRole(){ const imp = getImpersonation(); if (imp) return imp; const s = safeSession(); return s ? (s.role || 'guest') : 'guest'; }
  function roleToHome(role){ role = (role||'').toLowerCase(); if (role === 'admin') return 'home_admin.html'; if (role === 'dm') return 'home_dm.html'; return 'home.html'; }

  // ---- Modal builder (keine Änderungen, aber reused) ----
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
    document.body.appendChild(m);
    m.querySelector('.cm-modal-close').addEventListener('click', ()=> hideModal(id));
    m.querySelector('[data-role="backdrop"]').addEventListener('click', ()=> hideModal(id));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && m.getAttribute('aria-hidden')==='false') hideModal(id); });
    return m;
  }
  function showModal(id){ const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden','false'); const focus = m.querySelector('button, input, [href]') || m; focus.focus(); }
  function hideModal(id){ const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden','true'); }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ---- Small Hash (for account password update) ----
  async function hashPassword(pw){
    const enc = new TextEncoder();
    const buf = enc.encode(pw || '');
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ---- Popover helpers: ensure popovers float above all by positioning them in body
  // Show a popover element (HTMLElement) anchored to toggleEl
  function showPopoverFloating(popEl, toggleEl){
    if (!popEl || !toggleEl) return;
    // move popEl to body (if not already)
    if (popEl.parentElement !== document.body) document.body.appendChild(popEl);
    popEl.style.position = 'absolute';
    popEl.style.zIndex = '4000';
    popEl.style.minWidth = popEl.getAttribute('data-minwidth') || '220px';
    popEl.setAttribute('aria-hidden','false');

    // compute position: place under toggleEl, align to right edge by default
    const rect = toggleEl.getBoundingClientRect();
    const popWidth = Math.max(popEl.offsetWidth || 220, 220);
    const left = Math.max(8, rect.right - popWidth + window.scrollX);
    const top  = rect.bottom + 8 + window.scrollY;
    popEl.style.left = left + 'px';
    popEl.style.top  = top  + 'px';
  }
  function hidePopoverFloating(popEl, toggleEl){
    if (!popEl) return;
    popEl.setAttribute('aria-hidden','true');
    // optional: remove inline position to let CSS decide later
    popEl.style.left = '';
    popEl.style.top = '';
  }

  // attach small close button to popover if missing
  function ensurePopoverClose(popEl){
    if (!popEl) return;
    if (!popEl.querySelector('.cm-popover-close')){
      const btn = document.createElement('button');
      btn.className = 'cm-popover-close';
      btn.setAttribute('aria-label','Schließen');
      btn.textContent = '×';
      btn.style.cssText = 'position:absolute; right:6px; top:6px; background:transparent; border:none; font-size:16px; cursor:pointer;';
      popEl.insertBefore(btn, popEl.firstChild);
      btn.addEventListener('click', ()=> { hidePopoverFloating(popEl); });
    }
  }

  // Close popovers on outside click; we keep a list of managed popovers
  const managedPopovers = new Set();
  function registerManagedPopover(popEl, toggleEl){
    if (!popEl) return;
    managedPopovers.add(popEl);
    ensurePopoverClose(popEl);
    // close when clicking outside
    document.addEventListener('click', function onDocClick(ev){
      const isInsidePop = popEl.contains(ev.target);
      const isOnToggle = toggleEl && toggleEl.contains(ev.target);
      if (!isInsidePop && !isOnToggle){
        hidePopoverFloating(popEl, toggleEl);
      }
    }, {capture:true});
    // also close on ESC
    document.addEventListener('keydown', (ev)=> { if (ev.key === 'Escape') hidePopoverFloating(popEl); });
  }

  // ---- Update home link and user name; show admin control when admin ----
  function refreshHomeAndAccount(){
    const role = effectiveRole();
    // home
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) homeBtn.setAttribute('href', roleToHome(role));
    // username
    const sess = safeSession();
    const unameSpan = document.getElementById('account-username');
    if (unameSpan) unameSpan.textContent = sess ? (sess.username || '—') : '—';
    // admin control
    const adminCtrl = document.querySelector('.admin-control');
    if (adminCtrl) adminCtrl.style.display = (effectiveRole() === 'admin') ? '' : 'none';
  }

  // ---- TOC build (unchanged concept) ----
  function buildTOC(rootSelector = DEFAULT_TOC_ROOT){
    const toc = document.getElementById('toc-list');
    if (!toc) return;
    toc.innerHTML = '';
    const root = document.querySelector(rootSelector) || document.body;
    let sections = Array.from(root.querySelectorAll('[data-section]'));
    if (!sections.length) sections = Array.from(root.querySelectorAll('h2, h3'));
    if (!sections.length) {
      const no = document.createElement('div'); no.className='hint'; no.textContent = 'Keine Abschnitte gefunden.'; toc.appendChild(no); return;
    }
    sections.forEach((el, i)=>{
      if (!el.id) {
        const base = (el.textContent || 'section').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,'');
        el.id = `cm-sec-${i}-${base}`;
      }
      const a = document.createElement('a');
      a.href = `#${el.id}`;
      a.textContent = el.textContent.trim();
      a.addEventListener('click', (ev)=>{ ev.preventDefault(); document.getElementById(el.id).scrollIntoView({behavior:'smooth', block:'start'}); hideTOC(); });
      toc.appendChild(a);
    });

    // Intersection observer to update center title and highlight
    if ('IntersectionObserver' in window){
      const links = Array.from(toc.querySelectorAll('a'));
      const opts = { root:null, rootMargin:'0px 0px -60% 0px', threshold: 0.15 };
      const obs = new IntersectionObserver(entries=>{
        entries.forEach(en=>{
          if (en.isIntersecting){
            const id = en.target.id;
            const link = toc.querySelector(`a[href="#${id}"]`);
            if (!link) return;
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const titleEl = document.getElementById('current-page-title');
            if (titleEl) titleEl.textContent = en.target.textContent.trim();
          }
        });
      }, opts);
      sections.forEach(s => obs.observe(s));
    }
  }
  function toggleTOC(){ const btn = document.getElementById('toc-toggle'); const toc = document.getElementById('toc-list'); if (!btn||!toc) return; const open = btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded', (!open).toString()); if (!open) showPopoverFloating(toc, btn); else hidePopoverFloating(toc, btn); }
  function hideTOC(){ const btn = document.getElementById('toc-toggle'); const toc = document.getElementById('toc-list'); if (!btn||!toc) return; btn.setAttribute('aria-expanded','false'); hidePopoverFloating(toc, btn); }

  // ---- Guide modal ----
  function openGuide(){
    const map = {
      'Start': 'Leitet zur für deinen Account passenden Startseite (Admin/DM/Spieler).',
      'Inhaltsverzeichnis': 'Zeigt die Abschnitte dieser Seite, damit du schnell springen kannst.',
      'Guide': 'Öffnet diese Kurzanleitung.',
      'Einstellungen': 'Ändere das Farbschema (Dark/Light/Fantasy).',
      'Account': 'Account-Info anzeigen oder Abmelden.',
      'Admin': 'Nur für Admins: Ansicht eines anderen Accounttyps simulieren.'
    };
    // include page-provided [data-desc] items
    $$('[data-desc]').forEach(el => { const k = el.dataset.descKey || el.id || el.tagName; map[k] = el.dataset.desc; });
    let html = '<div class="cm-guide-list">';
    for (const k in map) html += `<div class="cm-guide-item"><strong>${escapeHtml(k)}</strong><div class="cm-guide-desc">${escapeHtml(map[k])}</div></div>`;
    html += '</div>';
    const m = buildModal('cm-guide-modal','Kurzanleitung',html);
    const actions = m.querySelector('.cm-modal-actions'); actions.innerHTML=''; const ok = document.createElement('button'); ok.className='primary'; ok.textContent='OK'; ok.addEventListener('click', ()=> hideModal('cm-guide-modal')); actions.appendChild(ok);
    showModal('cm-guide-modal');
  }

  // ---- Settings modal ----
  function openSettings(){
    const body = `<p class="hint">Wähle ein Farbschema:</p>
      <div class="cm-settings-options">
        <label><input type="radio" name="cm-theme" value="dark"> Dark</label><br>
        <label><input type="radio" name="cm-theme" value="light"> Light</label><br>
        <label><input type="radio" name="cm-theme" value="fantasy"> Fantasy</label>
      </div>`;
    const m = buildModal('cm-settings','Einstellungen', body);
    const actions = m.querySelector('.cm-modal-actions'); actions.innerHTML=''; const cancel = document.createElement('button'); cancel.className='ghost'; cancel.textContent='Abbrechen'; const apply = document.createElement('button'); apply.className='primary'; apply.textContent='Anwenden'; actions.appendChild(cancel); actions.appendChild(apply);

    // preselect
    const current = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute('data-theme') || 'dark';
    m.querySelectorAll('input[name="cm-theme"]').forEach(r=>{ if (r.value === current) r.checked = true; });

    cancel.addEventListener('click', ()=> hideModal('cm-settings'));
    apply.addEventListener('click', ()=> {
      const sel = m.querySelector('input[name="cm-theme"]:checked');
      const theme = sel ? sel.value : 'dark';
      if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function') window.CodexMysteria.applyTheme(theme);
      else { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem(THEME_KEY, theme); }
      hideModal('cm-settings');
    });

    showModal('cm-settings');
  }

  // ---- Account modal (with password visibility toggle) ----
  function openAccountModal(){
    const sess = safeSession();
    const role = effectiveRole();
    const body = `
      <div>
        <label>Benutzername<br><input id="cm-account-name" type="text" value="${escapeHtml(sess ? (sess.username||'') : '')}"></label>
      </div>
      <div style="margin-top:8px;">
        <label>Passwort<br>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="cm-account-pass" type="password" placeholder="Leer lassen = unverändert">
            <button id="cm-account-pass-toggle" class="cm-btn" type="button" title="Passwort anzeigen">👁️</button>
          </div>
        </label>
      </div>
      <div style="margin-top:8px;color:var(--cm-muted)">Rolle: <strong id="cm-account-role">${escapeHtml(role)}</strong></div>
    `;
    const m = buildModal('cm-account','Account-Informationen', body);
    const actions = m.querySelector('.cm-modal-actions'); actions.innerHTML=''; const cancel = document.createElement('button'); cancel.className='ghost'; cancel.textContent='Abbrechen'; const save = document.createElement('button'); save.className='primary'; save.textContent='Speichern'; actions.appendChild(cancel); actions.appendChild(save);

    cancel.addEventListener('click', ()=> hideModal('cm-account'));
    // toggle password visibility
    on(m.querySelector('#cm-account-pass-toggle'),'click', ()=>{
      const ip = m.querySelector('#cm-account-pass');
      if (!ip) return;
      ip.type = ip.type === 'password' ? 'text' : 'password';
    });

    save.addEventListener('click', async ()=> {
      const newName = m.querySelector('#cm-account-name').value.trim();
      const newPass = m.querySelector('#cm-account-pass').value;
      if (!sess) { alert('Kein aktives Konto.'); hideModal('cm-account'); return; }

      // update stored accounts if present
      let accounts = [];
      try { accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch(e){ accounts = []; }
      const idx = accounts.findIndex(a => a.username && a.username.toLowerCase() === (sess.username||'').toLowerCase());
      if (idx === -1){
        // fallback: update session only
        try { const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); if (newName) sessRaw.username = newName; localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw)); } catch(e){}
        alert('Session aktualisiert.');
        hideModal('cm-account');
        refreshHomeAndAccount();
        return;
      }
      if (newName && newName.toLowerCase() !== accounts[idx].username.toLowerCase()){
        const dup = accounts.some((a,i)=> i!==idx && a.username.toLowerCase() === newName.toLowerCase());
        if (dup) { alert('Benutzername bereits vergeben.'); return; }
        accounts[idx].username = newName;
      }
      if (newPass) {
        try { accounts[idx].passwordHash = await hashPassword(newPass); } catch(e){ alert('Fehler beim Speichern des Passworts'); return; }
      }
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      // update session username if changed
      try { const sessRaw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}'); if (newName) sessRaw.username = newName; localStorage.setItem(SESSION_KEY, JSON.stringify(sessRaw)); } catch(e){}
      alert('Account aktualisiert.');
      hideModal('cm-account');
      refreshHomeAndAccount();
    });

    showModal('cm-account');
  }

  // ---- Logout ----
  function doLogout(){
    if (window.CodexMysteria && typeof window.CodexMysteria.logout === 'function') window.CodexMysteria.logout();
    else localStorage.removeItem(SESSION_KEY);
    clearImpersonation();
    window.location.href = 'index.html';
  }

  // ---- Admin popover actions (floating) ----
  function initAdminPopover(){
    const adminBtn = document.getElementById('admin-view-btn');
    const adminPop = document.getElementById('admin-popover');
    if (!adminBtn || !adminPop) return;
    ensurePopoverClose(adminPop);
    registerManagedPopover(adminPop, adminBtn);
    adminBtn.addEventListener('click', (e)=>{
      const open = adminPop.getAttribute('aria-hidden') === 'false';
      if (!open) showPopoverFloating(adminPop, adminBtn);
      else hidePopoverFloating(adminPop, adminBtn);
    });
    adminPop.querySelectorAll('[data-action]').forEach(btn=> {
      btn.addEventListener('click', (ev)=>{
        const a = btn.getAttribute('data-action');
        if (a === 'view-as-admin') setImpersonation('admin');
        else if (a === 'view-as-dm') setImpersonation('dm');
        else if (a === 'view-as-player') setImpersonation('player');
        else if (a === 'view-as-guest') setImpersonation('guest');
        hidePopoverFloating(adminPop, adminBtn);
        refreshHomeAndAccount();
      });
    });
  }

  // ---- Account popover floating ----
  function initAccountPopover(){
    const accBtn = document.getElementById('account-toggle');
    const accPop = document.getElementById('account-popover');
    if (!accBtn || !accPop) return;
    ensurePopoverClose(accPop);
    registerManagedPopover(accPop, accBtn);
    accBtn.addEventListener('click', ()=>{
      const open = accPop.getAttribute('aria-hidden') === 'false';
      if (!open) showPopoverFloating(accPop, accBtn); else hidePopoverFloating(accPop, accBtn);
    });
    // wire popover actions
    accPop.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const act = btn.getAttribute('data-action');
        if (act === 'account-info') openAccountModal();
        else if (act === 'logout') doLogout();
        hidePopoverFloating(accPop, accBtn);
        accBtn.setAttribute('aria-expanded','false');
      });
    });
  }

  // ---- TOC toggle wiring: ensure floating behavior and close button ----
  function initTOCToggle(){
    const btn = document.getElementById('toc-toggle');
    const list = document.getElementById('toc-list');
    if (!btn || !list) return;
    ensurePopoverClose(list);
    registerManagedPopover(list, btn);
    btn.addEventListener('click', ()=> {
      const open = list.getAttribute('aria-hidden') === 'false';
      if (!open) { buildTOC(DEFAULT_TOC_ROOT); showPopoverFloating(list, btn); btn.setAttribute('aria-expanded','true'); }
      else { hidePopoverFloating(list, btn); btn.setAttribute('aria-expanded','false'); }
    });
  }

  // ---- Settings / Guide wiring ----
  function initSettingsAndGuide(){
    const g = document.getElementById('menu-guide-btn');
    if (g) on(g,'click', ()=> openGuide());
    const s = document.getElementById('settings-btn');
    if (s) on(s,'click', ()=> openSettings());
  }

  // ---- refresh UI and initial build ----
  function initMenuOnce(){
    refreshHomeAndAccount();
    buildTOC(DEFAULT_TOC_ROOT);
    initTOCToggle();
    initAccountPopover();
    initAdminPopover();
    initSettingsAndGuide();

    // auto-close popovers on Escape (for safety)
    document.addEventListener('keydown', (ev)=> { if (ev.key === 'Escape'){ // close all managed popovers
      Array.from(managedPopovers).forEach(p => hidePopoverFloating(p));
    }});

    // react to impersonation/session changes
    window.addEventListener('storage', (ev)=> {
      if (ev.key === SESSION_KEY || ev.key === IMPERSONATE_KEY) {
        refreshHomeAndAccount();
        buildTOC(DEFAULT_TOC_ROOT);
      }
    });
    window.addEventListener('codex:impersonation-changed', ()=> { refreshHomeAndAccount(); buildTOC(DEFAULT_TOC_ROOT); });
  }

  // ---- small helper to ensure popovers exist and have ids/classes in menu.html:
  // If a popover element is missing, we do nothing; we only operate on existing DOM nodes.
  // Start when DOM ready and topbar exists (menu.html should be loaded by loader).
  function bootstrap(){
    const tryInit = ()=>{
      const topbar = document.getElementById('site-topbar');
      if (!topbar) return false;
      try { initMenuOnce(); return true; } catch(e){ console.error('menu.js init failed',e); return false; }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ if (!tryInit()) setTimeout(tryInit, 200); });
    else { if (!tryInit()) setTimeout(tryInit, 200); }
  }

  // expose small API
  window.CodexMysteria = window.CodexMysteria || {};
  window.CodexMysteria.clearImpersonation = clearImpersonation;
  window.CodexMysteria.menuRefresh = ()=> { refreshHomeAndAccount(); buildTOC(DEFAULT_TOC_ROOT); };

  // start
  bootstrap();

})();
