/* home.js — Home-Page logic */
(() => {
  const qs = (s, root=document) => root.querySelector(s);

  function ensureLoggedIn() {
    if (!window.CodexMysteria) {
      console.error('CodexMysteria API fehlt.');
      window.location.href = 'index.html';
      return null;
    }
    const acc = window.CodexMysteria.getAccount();
    if (!acc) {
      window.location.href = 'index.html';
      return null;
    }
    return acc;
  }

  function populateAccountInfo(acc) {
    qs('#user-name').textContent = acc.username || '—';
    qs('#user-role').textContent = (acc.accountType || 'player').toUpperCase();
    qs('#meta-username').textContent = acc.username || '—';
    qs('#meta-role').textContent = acc.accountType || '—';
    qs('#meta-lastactive').textContent = acc.lastActive ? new Date(acc.lastActive).toLocaleString() : '—';

    document.body.classList.remove('role-admin','role-dm','role-player');
    document.body.classList.add('role-' + (acc.accountType || 'player'));
  }

  function bindLogout() {
    const btn = qs('#logout-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      window.CodexMysteria.logout();
      // nach logout zurück
      window.location.href = 'index.html';
    });
  }

  function setupMenuGuide() {
    const guideBtn = qs('#menu-guide-btn');
    const modal = qs('#menu-guide-modal');
    const close = qs('#modal-close');
    const ok = qs('#modal-ok');

    function show() { if (modal) modal.setAttribute('aria-hidden','false'); }
    function hide() { if (modal) modal.setAttribute('aria-hidden','true'); }

    guideBtn?.addEventListener('click', show);
    close?.addEventListener('click', hide);
    ok?.addEventListener('click', hide);
    modal?.addEventListener('click', (e) => { if (e.target === modal) hide(); });

    window.CodexMysteria = window.CodexMysteria || {};
    window.CodexMysteria.showMenuGuide = show;
  }

  // loadMenu helper expose
  function initLoadMenuHook() {
    // window.CodexMysteria.loadMenu already exists (script.js). Here we re-expose if needed.
    window.CodexMysteria = window.CodexMysteria || {};
    window.CodexMysteria.loadMenu = window.CodexMysteria.loadMenu || function(){ return Promise.reject(); };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const acc = ensureLoggedIn();
    if (!acc) return;
    populateAccountInfo(acc);
    bindLogout();
    setupMenuGuide();
    initLoadMenuHook();
    // optional: auto load menu if you want
    // window.CodexMysteria.loadMenu().catch(()=>{/* menu später */});
  });
})();
