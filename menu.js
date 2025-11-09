/*
  menu.js — Überarbeitete Menü-Engine (neu & gefixt)
  - Entfernt automatisch Regelwerk/Charaktere/Monster aus Haupt-Nav (konfigurierbar)
  - TOC / Scroll-Spy (aus h2/h3 oder [data-section])
  - Popup-Guide (aus data-desc oder intern generiert)
  - Settings-Modal (Theme: dark/light/fantasy) + Account-Modal
  - Admin-Dropdown & "View as" (Impersonation; UI-only)
  - Mobile Off-canvas Panel
  - Account Popover (Account-Info, Einstellungen, Logout)
  - Robust, kommentiert; lädt menu.html per fetch (wie zuvor)
*/

(function () {
  const MENU_SRC = 'menu.html';
  const IMPERSONATE_KEY = 'codexmysteria_impersonate';
  const DEFAULT_TOC_ROOT = 'main';

  /* ---------- Utility ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Helpers for session/role ---------- */
  function getSessionSafe(){
    try { return window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function' ? window.CodexMysteria.getSession() : null; }
    catch(e){ console.warn('getSessionSafe error', e); return null; }
  }

  function getEffectiveRole(){
    const imp = localStorage.getItem(IMPERSONATE_KEY);
    if (imp) return imp;
    const s = getSessionSafe();
    return s ? (s.role || 'guest') : 'guest';
  }

  function setImpersonation(role){
    if (!role) localStorage.removeItem(IMPERSONATE_KEY);
    else localStorage.setItem(IMPERSONATE_KEY, role);
    window.dispatchEvent(new CustomEvent('codex:impersonation-changed', {detail:{role}}));
  }

  function clearImpersonation(){ setImpersonation(null); }

  /* ---------- Basic Modal builder ---------- */
  function buildModal(id, title, bodyHtml){
    let m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id;
    m.className = 'cm-modal';
    m.setAttribute('aria-hidden','true');
    m.innerHTML = `
      <div class="cm-modal-backdrop"></div>
      <div class="cm-modal-panel card">
        <button class="cm-modal-close" aria-label="Schließen">×</button>
        <h3 class="cm-modal-title">${escapeHtml(title)}</h3>
        <div class="cm-modal-body">${bodyHtml}</div>
        <div class="cm-modal-actions"></div>
      </div>
    `;
    document.body.appendChild(m);
    // close events
    m.querySelector('.cm-modal-close').addEventListener('click', ()=> hideModal(id));
    m.querySelector('.cm-modal-backdrop').addEventListener('click', ()=> hideModal(id));
    return m;
  }

  function showModal(id){ const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden','false'); }
  function hideModal(id){ const m = document.getElementById(id); if (!m) return; m.setAttribute('aria-hidden','true'); }

  /* ---------- Settings modal (Theme) ---------- */
  function initSettingsModalOnce(){
    if (document.getElementById('cm-settings')) return;
    const body = `
      <p class="hint">Wähle ein Erscheinungsbild:</p>
      <div class="cm-theme-options">
        <label><input type="radio" name="cm-theme" value="dark"> Dark</label><br>
        <label><input type="radio" name="cm-theme" value="light"> Light</label><br>
        <label><input type="radio" name="cm-theme" value="fantasy"> Fantasy</label>
      </div>
    `;
    const m = buildModal('cm-settings','Einstellungen', body);
    const actions = m.querySelector('.cm-modal-actions');
    const btnApply = document.createElement('button'); btnApply.className='primary'; btnApply.textContent='Übernehmen';
    const btnCancel = document.createElement('button'); btnCancel.className='ghost'; btnCancel.textContent='Abbrechen';
    actions.appendChild(btnCancel); actions.appendChild(btnApply);

    // set current theme radio
    const themeKey = window.CodexMysteria && window.CodexMysteria.THEME_KEY ? window.CodexMysteria.THEME_KEY : 'codexmysteria_theme';
    const cur = localStorage.getItem(themeKey) || document.documentElement.getAttribute('data-theme') || 'dark';
    const radios = m.querySelectorAll('input[name="cm-theme"]');
    radios.forEach(r => { if (r.value === cur) r.checked = true; });

    btnApply.addEventListener('click', () => {
      const sel = m.querySelector('input[name="cm-theme"]:checked');
      const theme = sel ? sel.value : 'dark';
      if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function'){
        window.CodexMysteria.applyTheme(theme);
      } else {
        const key = (window.CodexMysteria && window.CodexMysteria.THEME_KEY) || themeKey;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(key, theme);
      }
      hideModal('cm-settings');
    });
    btnCancel.addEventListener('click', ()=> hideModal('cm-settings'));
  }

  /* ---------- Account modal (view/update) ---------- */
  function initAccountModalOnce(){
    if (document.getElementById('cm-account')) return;
    const body = `
      <div>
        <label>Benutzername<br><input id="cm-acc-username" type="text"></label>
      </div>
      <div style="margin-top:8px;">
        <label>Neues Passwort<br><input id="cm-acc-password" type="password" placeholder="Leer lassen = unverändert"></label>
      </div>
      <div style="margin-top:8px;color:var(--muted)"><span id="cm-acc-role">Rolle: —</span></div>
    `;
    const m = buildModal('cm-account','Account-Informationen', body);
    const actions = m.querySelector('.cm-modal-actions');
    const save = document.createElement('button'); save.className='primary'; save.textContent='Speichern';
    const close = document.createElement('button'); close.className='ghost'; close.textContent='Schließen';
    actions.appendChild(close); actions.appendChild(save);

    close.addEventListener('click', ()=> hideModal('cm-account'));
    save.addEventListener('click', async () => {
      const newName = document.getElementById('cm-acc-username').value.trim();
      const newPass = document.getElementById('cm-acc-password').value;
      const sess = getSessionSafe();
      if (!sess) { alert('Kein aktives Konto'); return; }
      // load accounts array from localStorage (script.js uses ACCOUNTS_KEY)
      const accKey = window.CodexMysteria && window.CodexMysteria.ACCOUNTS_KEY ? window.CodexMysteria.ACCOUNTS_KEY : 'codexmysteria_accounts';
      let accounts = [];
      try { accounts = JSON.parse(localStorage.getItem(accKey) || '[]'); } catch(e){ accounts = []; }
      const idx = accounts.findIndex(a => a.username.toLowerCase() === sess.username.toLowerCase());
      if (idx === -1) { alert('Account nicht gefunden.'); hideModal('cm-account'); return; }
      if (newName && newName.toLowerCase() !== accounts[idx].username.toLowerCase()){
        const dup = accounts.some((a,i)=> i!==idx && a.username.toLowerCase() === newName.toLowerCase());
        if (dup){ alert('Benutzername bereits vergeben.'); return; }
        accounts[idx].username = newName;
      }
      if (newPass){
        // same hash as script.js — SHA-256
        try {
          const enc = new TextEncoder();
          const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(newPass));
          const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
          accounts[idx].passwordHash = hash;
        } catch(e){ console.error(e); alert('Fehler beim Speichern des Passworts'); return; }
      }
      localStorage.setItem(accKey, JSON.stringify(accounts));
      // update session username if changed
      if (newName){
        const sessKey = window.CodexMysteria && window.CodexMysteria.SESSION_KEY ? window.CodexMysteria.SESSION_KEY : 'codexmysteria_session';
        try {
          const sRaw = JSON.parse(localStorage.getItem(sessKey) || '{}');
          sRaw.username = newName;
          localStorage.setItem(sessKey, JSON.stringify(sRaw));
        } catch(e){}
      }
      alert('Account aktualisiert.');
      hideModal('cm-account');
      populateAccountArea(); // refresh
    });
  }

  /* ---------- Populate account area & admin visibility ---------- */
  function populateAccountArea(){
    const sess = getSessionSafe();
    const role = getEffectiveRole();
    const unameSpan = $('#account-username') || qsOrNull('#account-area #account-username');
    const popU = $('#popover-username');
    const popR = $('#popover-role');
    if (unameSpan) unameSpan.textContent = sess ? (sess.username || '—') : '—';
    if (popU) popU.textContent = sess ? (sess.username || '—') : '—';
    if (popR) popR.textContent = role;

    // show/hide admin areas
    $$('.admin-area, .admin-only').forEach(el => {
      el.style.display = (role === 'admin') ? '' : 'none';
    });
  }

  /* ---------- Account popover toggle ---------- */
  function initAccountPopover(){
    const toggle = $('#account-toggle');
    const pop = $('#account-popover');
    if (!toggle || !pop) return;
    toggle.addEventListener('click', (e) => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', (!open).toString());
      pop.setAttribute('aria-hidden', open ? 'true' : 'false');
    });
    // actions inside popover
    $$('#account-popover [data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const a = btn.getAttribute('data-action');
        if (a === 'account-info'){
          initAccountModalOnce();
          const sess = getSessionSafe();
          document.getElementById('cm-acc-username').value = sess ? sess.username : '';
          document.getElementById('cm-acc-role').textContent = `Rolle: ${getEffectiveRole()}`;
          showModal('cm-account');
        } else if (a === 'settings'){
          initSettingsModalOnce();
          showModal('cm-settings');
        } else if (a === 'logout'){
          if (window.CodexMysteria && typeof window.CodexMysteria.logout === 'function'){
            window.CodexMysteria.logout();
          } else {
            // fallback
            localStorage.removeItem(window.CodexMysteria && window.CodexMysteria.SESSION_KEY ? window.CodexMysteria.SESSION_KEY : 'codexmysteria_session');
          }
          clearImpersonation();
          window.location.href = 'index.html';
        }
      });
    });
    // close on outside click
    document.addEventListener('click', (ev) => {
      if (!toggle.contains(ev.target) && !pop.contains(ev.target)){
        toggle.setAttribute('aria-expanded','false');
        pop.setAttribute('aria-hidden','true');
      }
    });
  }

  /* ---------- Admin popover (View As) ---------- */
  function initAdminPopover(){
    const btn = $('#admin-toggle');
    const pop = $('#admin-popover');
    if (!btn || !pop) return;
    btn.addEventListener('click', ()=>{
      const open = pop.getAttribute('aria-hidden') === 'false';
      pop.setAttribute('aria-hidden', (!open).toString());
    });
    // links inside
    pop.querySelectorAll('a[data-action]').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const action = a.getAttribute('data-action');
        if (action === 'view-as-dm'){ setImpersonation('dm'); rebuildRoleUI(); }
        else if (action === 'view-as-player'){ setImpersonation('player'); rebuildRoleUI(); }
        else if (action === 'view-as-guest'){ setImpersonation('guest'); rebuildRoleUI(); }
      });
    });
    // close on outside
    document.addEventListener('click', (ev) => {
      if (!btn.contains(ev.target) && !pop.contains(ev.target)){
        pop.setAttribute('aria-hidden','true');
      }
    });
    // listen impersonation changes
    window.addEventListener('codex:impersonation-changed', ()=> {
      populateAccountArea();
      rebuildRoleUI();
    });
  }

  /* ---------- Mobile panel ---------- */
  function initMobilePanel(){
    const hamburger = $('#menu-toggle');
    const panel = $('#mobile-panel');
    const mobileList = $('#mobile-menu-list');
    const close = $('#mobile-close');
    if (!hamburger || !panel || !mobileList) return;
    hamburger.addEventListener('click', ()=>{
      panel.setAttribute('aria-hidden','false');
      // copy menu items if empty
      if (!mobileList.children.length){
        const main = $('#main-menu-list');
        if (main) mobileList.innerHTML = main.innerHTML;
        // attach click handlers to close panel on click
        mobileList.querySelectorAll('a').forEach(a => a.addEventListener('click', ()=> panel.setAttribute('aria-hidden','true')));
      }
    });
    close.addEventListener('click', ()=> panel.setAttribute('aria-hidden','true'));
    document.addEventListener('keydown', (ev)=> { if (ev.key === 'Escape') panel.setAttribute('aria-hidden','true'); });
  }

  /* ---------- Remove unwanted menu entries & build guide map ---------- */
  function sanitizeMenuAndBuildGuide(){
    // Remove specific pages from main navigation if they exist
    const forbiddenPages = ['regelwerk','charaktere','monster']; // lower-case keys to remove
    const mainList = $('#main-menu-list');
    if (!mainList) return;

    // Build a help-map for popup guide: use existing data-desc or fallback descriptions
    const helpMap = {};

    // Iterate anchors
    mainList.querySelectorAll('a[role="menuitem"]').forEach(a => {
      const pageKey = (a.dataset.page || '').toLowerCase();
      let remove = false;
      if (pageKey && forbiddenPages.includes(pageKey)) remove = true;
      const href = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (href) {
        forbiddenPages.forEach(f => { if (href.includes(f)) remove = true; });
      }
      if (remove){
        a.parentElement && a.parentElement.remove();
        return;
      }
      // create help map entry
      const key = pageKey || (href || a.textContent.trim().toLowerCase());
      const desc = a.getAttribute('data-desc') || generateDescFromText(a.textContent.trim());
      helpMap[key] = desc;
    });

    // also include account and admin entries for help
    helpMap['account'] = 'Öffnet deine Account-Informationen, Einstellungen und die Abmelden-Funktion.';
    helpMap['settings'] = 'Einstellungen: hier stellst du Theme und Anzeigeoptionen ein.';
    helpMap['admin'] = 'Admin-Tools: Nutzerverwaltung, Logs und Ansichtssimulationen.';

    // return map
    return helpMap;
  }

  function generateDescFromText(text){
    // very small fallback generator
    const t = text.toLowerCase();
    if (t.includes('start')||t.includes('home')) return 'Geht zur Startseite deines Dashboards.';
    if (t.includes('regel') || t.includes('regeln')) return 'Öffnet das Regelwerk (Kapitelübersicht).';
    if (t.includes('charakter')) return 'Verwaltung deiner Charaktere und Bögen.';
    if (t.includes('monster')) return 'Das Monsterhandbuch (Bestiarium).';
    if (t.includes('notiz')) return 'Notizen und Kampagnennotizen.';
    if (t.includes('kampagnen')||t.includes('kampagne')) return 'Verwaltung deiner Kampagnen & Abenteuer.';
    return 'Öffnet diese Funktion.';
  }

  /* ---------- Popup Guide (listet Menüknöpfe & Beschreibungen) ---------- */
  function showPopupGuide(helpMap){
    // helpMap: key->desc
    let html = '<div class="cm-guide-list">';
    for (const k in helpMap){
      html += `<div class="cm-guide-item"><strong>${escapeHtml(k)}</strong><div class="cm-guide-desc">${escapeHtml(helpMap[k])}</div></div>`;
    }
    html += '</div>';
    const modal = buildModal('cm-guide','Kurzanleitung / Menü-Hilfe', html);
    const actions = modal.querySelector('.cm-modal-actions');
    actions.innerHTML = '';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent='OK';
    actions.appendChild(ok);
    ok.addEventListener('click', ()=> hideModal('cm-guide'));
    showModal('cm-guide');
  }

  /* ---------- Active menu item highlight (by path or data-page) ---------- */
  function updateActiveMenuItem(){
    const links = $$('#main-menu-list a[role="menuitem"]');
    const path = (location.pathname.split('/').pop() || '').toLowerCase();
    links.forEach(a => {
      const dp = (a.dataset.page || '').toLowerCase();
      const href = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      if (dp && path.includes(dp)) { a.classList.add('active'); $('#current-page-name') && ($('#current-page-name').textContent = a.textContent.trim()); }
      else if (href && href === path) { a.classList.add('active'); $('#current-page-name') && ($('#current-page-name').textContent = a.textContent.trim()); }
      else a.classList.remove('active');
    });
  }

  /* ---------- Build TOC & ScrollSpy ---------- */
  let tocObserver = null;
  function buildTOC(rootSelector = DEFAULT_TOC_ROOT){
    const toc = $('#toc-list');
    if (!toc) return;
    toc.innerHTML = '';
    const root = document.querySelector(rootSelector) || document.body;
    // prefer data-section
    let sections = Array.from(root.querySelectorAll('[data-section]'));
    if (!sections.length) sections = Array.from(root.querySelectorAll('h2, h3'));
    if (!sections.length){
      toc.innerHTML = '<div class="hint">Keine Abschnitte zum Navigieren gefunden.</div>';
      return;
    }
    sections.forEach((el, idx) => {
      if (!el.id) el.id = 'cm-sec-' + idx + '-' + (el.textContent || 's').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,'');
      const a = document.createElement('a'); a.href = '#' + el.id; a.textContent = el.textContent.trim();
      a.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById(el.id).scrollIntoView({behavior:'smooth', block:'start'}); });
      toc.appendChild(a);
    });
    // IntersectionObserver
    if (tocObserver) tocObserver.disconnect();
    const opts = { root: null, rootMargin: '0px 0px -60% 0px', threshold: 0.15 };
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        const id = en.target.id;
        const link = toc.querySelector(`a[href="#${id}"]`);
        if (!link) return;
        if (en.isIntersecting) {
          toc.querySelectorAll('a').forEach(x => x.classList.remove('active'));
          link.classList.add('active');
          // also update page-indicator
          const nameEl = $('#current-page-name');
          if (nameEl) nameEl.textContent = link.textContent;
        }
      });
    }, opts);
    sections.forEach(s => tocObserver.observe(s));
  }

  /* ---------- Rebuild UI for roles (admin inherits DM/player) ---------- */
  function rebuildRoleUI(){
    populateAccountArea();
    updateActiveMenuItem();
    // data-role="player,dm" etc.
    const role = getEffectiveRole();
    $$('[data-role]').forEach(el => {
      const roles = (el.getAttribute('data-role') || '').split(',').map(r=>r.trim()).filter(Boolean);
      if (!roles.length) { el.style.display = ''; return; }
      if (role === 'admin') el.style.display = '';
      else el.style.display = roles.includes(role) ? '' : 'none';
    });
  }

  /* ---------- Page description button init ---------- */
  function initPageDescButton(){
    const btn = $('#page-desc-btn');
    if (!btn) return;
    btn.addEventListener('click', ()=>{
      // priority: window.CodexMysteria.getPageDescription -> #page-meta[data-page-description] -> meta description
      let desc = '';
      try { if (window.CodexMysteria && typeof window.CodexMysteria.getPageDescription === 'function') desc = window.CodexMysteria.getPageDescription(); }
      catch(e){ console.warn(e); }
      if (!desc){
        const pm = $('#page-meta') || qsOrNull('#page-meta');
        if (pm) desc = pm.dataset.pageDescription || pm.getAttribute('data-page-description') || pm.textContent || '';
      }
      if (!desc){
        const meta = document.querySelector('meta[name="description"]'); if (meta) desc = meta.getAttribute('content');
      }
      if (!desc) desc = 'Keine Seitenbeschreibung verfügbar.';
      const m = buildModal('cm-pagedesc','Seitenbeschreibung', `<p>${escapeHtml(desc)}</p>`);
      m.querySelector('.cm-modal-actions').innerHTML = '<button class="primary">OK</button>';
      m.querySelector('.cm-modal-actions button').addEventListener('click', ()=> hideModal('cm-pagedesc'));
      showModal('cm-pagedesc');
    });
  }

  /* ---------- Initialize everything after menu.html is inserted ---------- */
  async function initAfterMenuInserted(){
    await wait(20); // allow DOM to parse
    populateAccountArea();
    initAccountPopover();
    initAdminPopover();
    initMobilePanel();
    initSettingsModalOnce();
    initAccountModalOnce();
    initPageDescButton();

    // sanitize menu and build help map
    const helpMap = sanitizeMenuAndBuildGuide() || {};
    // bind page-desc button to reflect info: set page description in header if present
    // fill current page name and initial active
    updateActiveMenuItem();

    // create guide button action
    const guideBtn = $('#page-desc-btn'); // use existing button as guide toggle as well
    if (guideBtn){
      // right now page-desc and guide share the same button; attach alt-click to open guide
      guideBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); showPopupGuide(helpMap); });
      // or ctrl+click to open guide
      guideBtn.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) { showPopupGuide(helpMap); return; }
        // normal click opens page desc (already wired by initPageDescButton)
      });
    }

    // build TOC
    buildTOC();
    // attach smooth behaviours for main menu items -> close mobile panel if open
    $$('#main-menu-list a').forEach(a => a.addEventListener('click', ()=> { const mp = $('#mobile-panel'); if (mp) mp.setAttribute('aria-hidden','true'); }));
    // initial role UI
    rebuildRoleUI();

    // storage listener to detect session changes from other tabs
    window.addEventListener('storage', (ev) => {
      const sessKey = window.CodexMysteria && window.CodexMysteria.SESSION_KEY ? window.CodexMysteria.SESSION_KEY : 'codexmysteria_session';
      if (ev.key === sessKey) { populateAccountArea(); rebuildRoleUI(); }
      if (ev.key === IMPERSONATE_KEY) { populateAccountArea(); rebuildRoleUI(); }
    });
  }

  /* ---------- Fetch menu.html and insert into page (like before) ---------- */
  async function loadMenuAndInit(){
    // insert into #menu-container if exists, else put at top of body
    let container = document.getElementById('menu-container');
    if (!container){
      container = document.createElement('div');
      container.id = 'menu-container';
      document.body.insertBefore(container, document.body.firstChild);
    }
    try {
      const resp = await fetch(MENU_SRC, {cache:'no-cache'});
      if (!resp.ok) throw new Error('menu.html not found');
      const html = await resp.text();
      container.innerHTML = html;
      // menu.html may include menu.css linking; ensure it's loaded
      await wait(40);
      // now run initialization
      initAfterMenuInserted();
    } catch (e){
      console.warn('menu.js: Fehler beim Laden von menu.html', e);
      // try to initialize if menu already present in DOM
      initAfterMenuInserted();
    }
  }

  /* ---------- Start on DOMContentLoaded ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    loadMenuAndInit().catch(err => console.error('menu.js init failed', err));
  });

  /* ---------- expose helper for external use ---------- */
  window.CodexMysteria = window.CodexMysteria || {};
  window.CodexMysteria.rebuildMenuUI = function(){ rebuildRoleUI(); buildTOC(); updateActiveMenuItem(); };

  /* ---------- small helper to query for fallback selectors (safe) ---------- */
  function qsOrNull(selector){ try { return document.querySelector(selector); } catch(e){ return null; } }

})();

