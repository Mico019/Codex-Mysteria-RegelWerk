/* menu.js
   Vollständige Menü-Engine für Codex Mysteria.
   - Lädt menu.html automatisch (falls vorhanden) oder fügt Menü direkt in DOM ein
   - Initialisiert Account-Bereiche, Admin-Dropdown, Mobile Panel, TOC/ScrollSpy
   - Settings-Modal (Theme-Switch) und Page-Description Modal
   - Admin "View as" / Impersonation (temporär, UI-only, persistiert in localStorage)
   - Exportiert: window.CodexMysteria.showMenu(), .hideMenu(), .rebuildTOC()
   Hinweise:
   - Muss nach script.js geladen werden (script.js stellt window.CodexMysteria bereit).
   - Benötigt menu.html + menu.css (oder du lässt menu.js das HTML laden via fetch).
*/

(function () {
  const MENU_SRC = 'menu.html'; // Datei, die wir per fetch laden können
  const MENU_CONTAINER_ID = 'menu-container';
  const IMPERSONATE_KEY = 'codexmysteria_impersonate'; // stores role override by admin
  const DEFAULT_TOC_SELECTOR = 'main'; // where to scan headings

  /* ---------- Utilities ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function createElemFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function qsOrNull(sel, root = document) { try { return $(sel, root); } catch (e) { return null; } }

  /* small sleep util */
  const wait = ms => new Promise(res => setTimeout(res, ms));

  /* ---------- Menu loader ---------- */
  async function loadMenuHtml() {
    // If there is a #menu-container in the page, insert menu there.
    const placeholder = document.getElementById(MENU_CONTAINER_ID);
    try {
      // try to fetch menu.html
      const resp = await fetch(MENU_SRC, {cache: 'no-cache'});
      if (!resp.ok) throw new Error('menu.html not found');
      const html = await resp.text();
      if (placeholder) {
        placeholder.innerHTML = html;
      } else {
        // insert at top of body
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.insertBefore(wrapper, document.body.firstChild);
      }
      return true;
    } catch (err) {
      // fallback: try to find inline <nav id="site-menu"> already present
      const existing = document.getElementById('site-menu');
      if (existing) return true;
      console.warn('menu.js: konnte menu.html nicht laden:', err);
      return false;
    }
  }

  /* ---------- Session & role helpers ---------- */
  function getSessionSafe() {
    try {
      return window.CodexMysteria && typeof window.CodexMysteria.getSession === 'function'
        ? window.CodexMysteria.getSession()
        : null;
    } catch (e) {
      console.warn('menu.js: getSession error', e);
      return null;
    }
  }

  function getEffectiveRole() {
    // If admin impersonates, return impersonate role
    const impersonate = localStorage.getItem(IMPERSONATE_KEY);
    if (impersonate) return impersonate;
    const sess = getSessionSafe();
    return sess ? (sess.role || 'guest') : 'guest';
  }

  function setImpersonation(role) {
    if (!role) {
      localStorage.removeItem(IMPERSONATE_KEY);
    } else {
      localStorage.setItem(IMPERSONATE_KEY, role);
    }
    // emit event for listeners
    window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role } }));
  }

  function clearImpersonation() {
    localStorage.removeItem(IMPERSONATE_KEY);
    window.dispatchEvent(new CustomEvent('codex:impersonation-changed', { detail: { role: null } }));
  }

  /* ---------- UI: Modals ---------- */
  function buildModal(id, title, innerHtml) {
    // if exists, return
    let m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id;
    m.className = 'cm-modal';
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = `
      <div class="cm-modal-backdrop"></div>
      <div class="cm-modal-panel card">
        <button class="cm-modal-close" aria-label="Schließen">×</button>
        <h3 class="cm-modal-title">${escapeHtml(title)}</h3>
        <div class="cm-modal-body">${innerHtml}</div>
        <div class="cm-modal-actions"></div>
      </div>
    `;
    document.body.appendChild(m);
    // close handlers
    m.querySelector('.cm-modal-close').addEventListener('click', () => hideModal(id));
    m.querySelector('.cm-modal-backdrop').addEventListener('click', () => hideModal(id));
    return m;
  }

  function showModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.setAttribute('aria-hidden', 'false');
    // trap focus basic: focus first focusable
    const focusable = m.querySelector('button, [href], input, select, textarea') || m;
    focusable.focus();
  }

  function hideModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.setAttribute('aria-hidden', 'true');
  }

  /* ---------- Theme settings ---------- */
  function initSettingsModal() {
    const existing = document.getElementById('cm-settings-modal');
    if (existing) return;
    const body = `
      <p class="hint">Wähle das Erscheinungsbild der Seite:</p>
      <div class="cm-theme-options">
        <label><input type="radio" name="cm-theme" value="dark"> Dark</label><br/>
        <label><input type="radio" name="cm-theme" value="light"> Light</label><br/>
        <label><input type="radio" name="cm-theme" value="fantasy"> Fantasy</label>
      </div>
    `;
    const modal = buildModal('cm-settings-modal', 'Einstellungen', body);
    const actions = modal.querySelector('.cm-modal-actions');
    const applyBtn = document.createElement('button');
    applyBtn.className = 'primary';
    applyBtn.textContent = 'Übernehmen';
    actions.appendChild(applyBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = 'Abbrechen';
    actions.appendChild(cancelBtn);

    // fill current theme
    const themeRadios = modal.querySelectorAll('input[name="cm-theme"]');
    const curTheme = localStorage.getItem(window.CodexMysteria?.THEME_KEY || 'codexmysteria_theme') || (document.documentElement.getAttribute('data-theme') || 'dark');
    themeRadios.forEach(r => { if (r.value === curTheme) r.checked = true; });

    applyBtn.addEventListener('click', () => {
      const sel = modal.querySelector('input[name="cm-theme"]:checked');
      const theme = sel ? sel.value : 'dark';
      if (window.CodexMysteria && typeof window.CodexMysteria.applyTheme === 'function') {
        window.CodexMysteria.applyTheme(theme);
      } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(window.CodexMysteria?.THEME_KEY || 'codexmysteria_theme', theme);
      }
      hideModal('cm-settings-modal');
    });
    cancelBtn.addEventListener('click', () => hideModal('cm-settings-modal'));
  }

  /* ---------- Account info modal (view + update username/password) ---------- */
  function initAccountModal() {
    if (document.getElementById('cm-account-modal')) return;
    const body = `
      <div class="cm-account-content">
        <div><label>Benutzername<br/><input id="cm-account-username" type="text" /></label></div>
        <div><label>Neues Passwort<br/><input id="cm-account-password" type="password" placeholder="Leerlassen = unverändert" /></label></div>
        <div style="margin-top:8px;color:var(--muted)" id="cm-account-role">Rolle: —</div>
      </div>
    `;
    const modal = buildModal('cm-account-modal', 'Account-Informationen', body);
    const actions = modal.querySelector('.cm-modal-actions');
    const saveBtn = document.createElement('button'); saveBtn.className = 'primary'; saveBtn.textContent = 'Speichern';
    const closeBtn = document.createElement('button'); closeBtn.className = 'ghost'; closeBtn.textContent = 'Schließen';
    actions.appendChild(saveBtn); actions.appendChild(closeBtn);

    closeBtn.addEventListener('click', () => hideModal('cm-account-modal'));
    saveBtn.addEventListener('click', async () => {
      // Save changes to accounts (uses same hashing as script.js)
      const newName = document.getElementById('cm-account-username').value.trim();
      const newPass = document.getElementById('cm-account-password').value;
      const sess = getSessionSafe();
      if (!sess) { alert('Kein Account aktiv'); return; }

      // load accounts
      const raw = localStorage.getItem(window.CodexMysteria?.ACCOUNTS_KEY || 'codexmysteria_accounts');
      let accounts = [];
      try { accounts = JSON.parse(raw) || []; } catch (e) { accounts = []; }

      const idx = accounts.findIndex(a => a.username.toLowerCase() === sess.username.toLowerCase());
      if (idx === -1) { alert('Account nicht gefunden'); hideModal('cm-account-modal'); return; }

      // update username if changed and not duplicate
      if (newName && newName.toLowerCase() !== accounts[idx].username.toLowerCase()) {
        const dup = accounts.some((a, i) => i !== idx && a.username.toLowerCase() === newName.toLowerCase());
        if (dup) { alert('Der Benutzername ist bereits vergeben.'); return; }
        accounts[idx].username = newName;
      }
      // update pwd if provided -> hash
      if (newPass) {
        try {
          const hash = await hashPassword(newPass);
          accounts[idx].passwordHash = hash;
        } catch (e) { console.error('Hash error', e); alert('Fehler beim Speichern des Passworts'); return; }
      }
      // save accounts
      localStorage.setItem(window.CodexMysteria?.ACCOUNTS_KEY || 'codexmysteria_accounts', JSON.stringify(accounts));
      // update session username if changed
      const session = window.CodexMysteria.getSession();
      if (newName) {
        const newSession = Object.assign({}, session, { username: newName });
        localStorage.setItem(window.CodexMysteria?.SESSION_KEY || 'codexmysteria_session', JSON.stringify(newSession));
      }
      alert('Account aktualisiert.');
      hideModal('cm-account-modal');
      // refresh account area
      populateAccountArea();
    });
  }

  /* helper hash (same algorithm as script.js) */
  async function hashPassword(password) {
    const enc = new TextEncoder();
    const data = enc.encode(password || '');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Populate account area ---------- */
  function populateAccountArea() {
    const sess = getSessionSafe();
    const effectiveRole = getEffectiveRole();
    // username elements
    const accNameEl = $('#account-username') || qsOrNull('#account-area #account-username');
    const popName = $('#popover-username') || qsOrNull('#popover-username');
    const popRole = $('#popover-role') || qsOrNull('#popover-role');
    if (accNameEl) accNameEl.textContent = sess ? (sess.username || '—') : '—';
    if (popName) popName.textContent = sess ? (sess.username || '—') : '—';
    if (popRole) popRole.textContent = effectiveRole;

    // admin area show/hide
    const adminNodes = document.querySelectorAll('.admin-area, .admin-only');
    adminNodes.forEach(n => {
      if (effectiveRole === 'admin') {
        n.style.display = ''; // let CSS decide
      } else {
        n.style.display = 'none';
      }
    });

    // mark account-popover fields
    const roleBadge = $('#popover-role');
    if (roleBadge) roleBadge.textContent = effectiveRole;
  }

  /* ---------- Account popover toggle ---------- */
  function initAccountPopover() {
    const toggle = $('#account-toggle');
    const popover = $('#account-popover');
    if (!toggle || !popover) return;
    toggle.addEventListener('click', (ev) => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', (!expanded).toString());
      popover.setAttribute('aria-hidden', expanded ? 'true' : 'false');
    });

    // account actions
    popover.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        const action = btn.getAttribute('data-action');
        if (action === 'account-info') {
          initAccountModal();
          // fill modal with current session
          const sess = getSessionSafe();
          document.getElementById('cm-account-username').value = sess?.username || '';
          document.getElementById('cm-account-role').textContent = `Rolle: ${getEffectiveRole()}`;
          showModal('cm-account-modal');
        } else if (action === 'settings') {
          initSettingsModal();
          showModal('cm-settings-modal');
        } else if (action === 'logout') {
          if (window.CodexMysteria && typeof window.CodexMysteria.logout === 'function') {
            window.CodexMysteria.logout();
            // clear impersonation when logout
            clearImpersonation();
            window.location.href = 'index.html';
          } else {
            localStorage.removeItem(window.CodexMysteria?.SESSION_KEY || 'codexmysteria_session');
            clearImpersonation();
            window.location.href = 'index.html';
          }
        }
      });
    });

    // close popover when clicking outside
    document.addEventListener('click', (ev) => {
      if (!toggle.contains(ev.target) && !popover.contains(ev.target)) {
        toggle.setAttribute('aria-expanded', 'false');
        popover.setAttribute('aria-hidden', 'true');
      }
    });
  }

  /* ---------- Admin dropdown (View as) ---------- */
  function initAdminPopover() {
    const toggle = $('#admin-toggle');
    const popover = $('#admin-popover');
    if (!toggle || !popover) return;
    toggle.addEventListener('click', () => {
      const open = popover.getAttribute('aria-hidden') === 'false';
      popover.setAttribute('aria-hidden', (!open).toString());
    });

    popover.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (ev) => {
        const action = a.getAttribute('data-action');
        if (action === 'view-as-dm') {
          setImpersonation('dm');
          // reload UI
          rebuildRoleUI();
          popover.setAttribute('aria-hidden', 'true');
        } else if (action === 'view-as-player') {
          setImpersonation('player');
          rebuildRoleUI();
          popover.setAttribute('aria-hidden', 'true');
        }
      });
    });

    // if click outside -> hide
    document.addEventListener('click', (ev) => {
      if (!toggle.contains(ev.target) && !popover.contains(ev.target)) {
        popover.setAttribute('aria-hidden', 'true');
      }
    });

    // listen to impersonation change
    window.addEventListener('codex:impersonation-changed', () => {
      populateAccountArea();
      rebuildRoleUI();
    });
  }

  /* ---------- Mobile panel logic ---------- */
  function initMobilePanel() {
    const hamburger = $('#menu-toggle');
    const mobilePanel = $('#mobile-panel');
    const mobileClose = $('#mobile-close');
    const mobileMenuList = $('#mobile-menu-list');

    if (!hamburger || !mobilePanel || !mobileClose || !mobileMenuList) return;

    hamburger.addEventListener('click', () => {
      mobilePanel.setAttribute('aria-hidden', 'false');
      // clone menu items into mobile list if empty
      if (!mobileMenuList.children.length) {
        const mainMenu = $('#main-menu-list');
        if (mainMenu) {
          mobileMenuList.innerHTML = mainMenu.innerHTML;
          // ensure anchors work
          mobileMenuList.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => mobilePanel.setAttribute('aria-hidden', 'true'));
          });
        }
      }
    });
    mobileClose.addEventListener('click', () => mobilePanel.setAttribute('aria-hidden', 'true'));
    // close on escape
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') mobilePanel.setAttribute('aria-hidden', 'true');
    });
  }

  /* ---------- Highlight active menu item ---------- */
  function updateActiveMenuItem() {
    const links = $$('#main-menu-list a');
    const path = location.pathname.split('/').pop() || 'home.html';
    links.forEach(a => {
      const href = (a.getAttribute('href') || '').split('/').pop();
      const datapage = a.dataset.page;
      if (datapage && path.includes(datapage)) {
        a.classList.add('active');
        $('#current-page-name') && ($('#current-page-name').textContent = a.textContent.trim());
      } else if (href && href === path) {
        a.classList.add('active');
        $('#current-page-name') && ($('#current-page-name').textContent = a.textContent.trim());
      } else {
        a.classList.remove('active');
      }
    });
  }

  /* ---------- TOC / Scroll Spy ---------- */
  let tocObserver = null;
  function buildTOC(rootSelector = DEFAULT_TOC_SELECTOR) {
    const tocList = $('#toc-list');
    if (!tocList) return;
    tocList.innerHTML = '';
    const root = document.querySelector(rootSelector) || document.body;
    // prefer elements with data-section, else h2/h3
    const sections = Array.from(root.querySelectorAll('[data-section]')).length
      ? Array.from(root.querySelectorAll('[data-section]'))
      : Array.from(root.querySelectorAll('h2, h3'));
    if (!sections.length) {
      tocList.innerHTML = '<div class="hint">Keine Inhaltsabschnitte gefunden.</div>';
      return;
    }
    sections.forEach((el, idx) => {
      // ensure ID
      if (!el.id) el.id = 'cm-sec-' + idx + '-' + (el.textContent || 'sec').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
      const a = document.createElement('a');
      a.href = '#' + el.id;
      a.textContent = el.textContent.trim();
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        document.querySelector('#' + el.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tocList.appendChild(a);
    });

    // IntersectionObserver to highlight
    if (tocObserver) tocObserver.disconnect();
    const opts = { root: null, rootMargin: '0px 0px -60% 0px', threshold: [0, 0.2, 0.6] };
    tocObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        const id = en.target.id;
        const link = tocList.querySelector(`a[href="#${id}"]`);
        if (!link) return;
        if (en.isIntersecting) {
          tocList.querySelectorAll('a').forEach(x => x.classList.remove('active'));
          link.classList.add('active');
          // update page-indicator if the heading belongs to this page
          $('#current-page-name') && ($('#current-page-name').textContent = link.textContent);
        }
      });
    }, opts);
    sections.forEach(s => tocObserver.observe(s));
  }

  /* ---------- Page description handling ---------- */
  function initPageDescButton() {
    const btn = $('#page-desc-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // first try window.CodexMysteria.getPageDescription()
      let desc = '';
      try {
        if (window.CodexMysteria && typeof window.CodexMysteria.getPageDescription === 'function') {
          desc = window.CodexMysteria.getPageDescription();
        }
      } catch (e) { console.warn(e); }
      // fallback: element #page-meta data attribute
      if (!desc) {
        const pm = $('#page-meta') || qsOrNull('#page-meta');
        if (pm) desc = pm.dataset.pageDescription || pm.getAttribute('data-page-description') || pm.textContent || '';
      }
      // fallback: meta[name="description"]
      if (!desc) {
        const meta = document.querySelector('meta[name="description"]');
        desc = meta ? meta.getAttribute('content') : '';
      }
      if (!desc) desc = 'Keine Beschreibung verfügbar.';
      // show modal
      const modal = buildModal('cm-page-desc', 'Seitenbeschreibung', `<p>${escapeHtml(desc)}</p>`);
      const actions = modal.querySelector('.cm-modal-actions');
      actions.innerHTML = '';
      const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'OK';
      actions.appendChild(ok);
      ok.addEventListener('click', () => hideModal('cm-page-desc'));
      showModal('cm-page-desc');
    });
  }

  /* ---------- Rebuild role-specific UI ---------- */
  function rebuildRoleUI() {
    populateAccountArea();
    updateActiveMenuItem();
    // show/hide elements by data-role attributes: default visibility rules
    const effectiveRole = getEffectiveRole();
    // for each .action-card possibly annotated with data-role attribute
    document.querySelectorAll('[data-role]').forEach(el => {
      const roles = (el.getAttribute('data-role') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!roles.length) { el.style.display = ''; return; }
      if (effectiveRole === 'admin') {
        el.style.display = '';
      } else {
        el.style.display = roles.includes(effectiveRole) ? '' : 'none';
      }
    });
    // admin-only areas are handled in populateAccountArea
  }

  /* ---------- Expose loadMenu function & initialization ---------- */
  async function initMenu() {
    // 1) load menu html (if needed)
    await loadMenuHtml();
    // 2) ensure menu CSS loaded: just warn if not present (we rely on menu.css in pages)
    // 3) populate account info and role UI
    populateAccountArea();
    // 4) init popovers and panels
    initAccountPopover();
    initAdminPopover();
    initMobilePanel();
    initSettingsModal();
    initAccountModal();
    initPageDescButton();
    // 5) init TOC when DOM ready (delayed to allow page content to render)
    await wait(80); // slight delay for content
    buildTOC();
    // 6) update active menu
    updateActiveMenuItem();
    // 7) init event handlers for main menu anchors to close mobile panel if needed
    $('#main-menu-list') && $('#main-menu-list').querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        const mp = $('#mobile-panel'); if (mp) mp.setAttribute('aria-hidden', 'true');
      });
    });

    // 8) toolbar: shortcut keys
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        // close any open popovers / mobile
        const mp = $('#mobile-panel'); if (mp) mp.setAttribute('aria-hidden', 'true');
        const adminPop = $('#admin-popover'); if (adminPop) adminPop.setAttribute('aria-hidden', 'true');
        const acctPop = $('#account-popover'); if (acctPop) acctPop.setAttribute('aria-hidden', 'true');
      }
    });

    // 9) listen to session change (if script.js updates session) — user code must dispatch event on change.
    window.addEventListener('storage', (ev) => {
      if (ev.key === (window.CodexMysteria && window.CodexMysteria.SESSION_KEY ? window.CodexMysteria.SESSION_KEY : 'codexmysteria_session')) {
        populateAccountArea(); rebuildRoleUI();
      }
    });

    // 10) if impersonation set, reflect it
    window.addEventListener('codex:impersonation-changed', () => {
      rebuildRoleUI();
    });

    // expose global helpers
    window.CodexMysteria = window.CodexMysteria || {};
    window.CodexMysteria.showMenu = () => { $('#site-menu') && $('#site-menu').classList.remove('hidden'); };
    window.CodexMysteria.hideMenu = () => { $('#site-menu') && $('#site-menu').classList.add('hidden'); };
    window.CodexMysteria.rebuildTOC = (sel) => buildTOC(sel || DEFAULT_TOC_SELECTOR);
  }

  /* Auto-run on DOMContentLoaded */
  document.addEventListener('DOMContentLoaded', () => {
    // start init but do not block
    initMenu().catch(e => console.error('menu.js init failed', e));
  });

})();
