/* home.js — logic for home.html
   - liest account via window.CodexMysteria.getAccount()
   - leitet zu index.html um, falls kein account
   - fügt body role-Klasse hinzu: role-admin | role-dm | role-player
   - stellt einfache Modal/Guide-Funktion bereit, die später vom Menü aufgerufen werden kann
   - bietet loadMenu(containerSelector) zur späteren Integration von menu.html
*/

(() => {
  // Helper
  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));

  // Prüfe Account
  function ensureLoggedIn() {
    if (!window.CodexMysteria) {
      console.error('CodexMysteria API nicht gefunden. Stelle sicher, dass script.js eingebunden ist.');
      // Fallback: redirect to index
      window.location.href = 'index.html';
      return null;
    }
    const acc = window.CodexMysteria.getAccount();
    if (!acc) {
      // nicht eingeloggt -> zurück zur Login Seite
      window.location.href = 'index.html';
      return null;
    }
    return acc;
  }

  // Fülle UI mit Account-Daten
  function populateAccountInfo(acc) {
    qs('#user-name').textContent = acc.username || 'Unbekannt';
    qs('#user-role').textContent = (acc.accountType || 'player').toUpperCase();
    qs('#meta-username').textContent = acc.username || '—';
    qs('#meta-role').textContent = (acc.accountType || 'player');
    qs('#meta-lastactive').textContent = acc.lastActive ? new Date(acc.lastActive).toLocaleString() : '—';

    // setze role-Klasse auf body
    document.body.classList.remove('role-admin','role-dm','role-player');
    document.body.classList.add('role-' + (acc.accountType || 'player'));
  }

  // Logout
  function bindLogout() {
    const btn = qs('#logout-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // benutze die zentrale logout-Funktion
      if (window.CodexMysteria && typeof window.CodexMysteria.logout === 'function') {
        window.CodexMysteria.logout();
      } else {
        // fallback: einfach localStorage clear & redirect
        localStorage.removeItem(window.CodexMysteria?.ACCOUNT_KEY || 'codexmysteria_account');
        window.location.href = 'index.html';
      }
    });
  }

  // Modal / Guide für das Menü
  function setupMenuGuide() {
    const guideBtn = qs('#menu-guide-btn');
    const modal = qs('#menu-guide-modal');
    const close = qs('#modal-close');
    const ok = qs('#modal-ok');

    function show() {
      if (!modal) return;
      modal.setAttribute('aria-hidden','false');
    }
    function hide() {
      if (!modal) return;
      modal.setAttribute('aria-hidden','true');
    }

    if (guideBtn) guideBtn.addEventListener('click', show);
    if (close) close.addEventListener('click', hide);
    if (ok) ok.addEventListener('click', hide);
    // close on overlay click
    if (modal) modal.addEventListener('click', (e) => {
      if (e.target === modal) hide();
    });

    // Expose a small API so menu.html (wenn es geladen wird) kann die guide öffnen:
    window.CodexMysteria = window.CodexMysteria || {};
    window.CodexMysteria.showMenuGuide = show;
  }

  // Lade ein externes menu.html in den #menu-placeholder (wird später verwendet)
  function loadMenu(selector = '#menu-placeholder', src = 'menu.html') {
    const container = qs(selector);
    if (!container) return Promise.reject(new Error('Menu container nicht gefunden'));

    return fetch(src, {cache: "no-cache"})
      .then(resp => {
        if (!resp.ok) throw new Error('menu.html konnte nicht geladen werden');
        return resp.text();
      })
      .then(html => {
        container.innerHTML = html;
        // optional: evaluiere menu-spezifisches JS, falls menu.html inline <script> tags enthält:
        // einfache & sichere Variante: keine evals hier; menu sollte eigene menu.js besitzen.
        // Wir geben aber an dieser Stelle ein Hook zurück.
        if (window.CodexMysteria && typeof window.CodexMysteria.onMenuLoaded === 'function') {
          window.CodexMysteria.onMenuLoaded(container);
        }
        return container;
      });
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    const acc = ensureLoggedIn();
    if (!acc) return;
    populateAccountInfo(acc);
    bindLogout();
    setupMenuGuide();

    // Falls du das Menü automatisch laden möchtest, kannst du hier aufrufen:
    // loadMenu().catch(()=>{/* still okay — menu kommt später */});

    // Expose loadMenu global, damit du es von anderen Skripten anstoßen kannst:
    window.CodexMysteria = window.CodexMysteria || {};
    window.CodexMysteria.loadMenu = loadMenu;
  });

})();
