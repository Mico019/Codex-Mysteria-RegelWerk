/* script.js — zentrale API für Codex Mysteria
   Enthält:
   - Theme-System (apply/load)
   - Account-Handling (LocalStorage)
   - login(username,password,code,stay)
   - logout()
   - helper: getAccount, isLoggedIn
   - allowedCodes mapping (anpassbar)
   - Menu-Hooks: loadMenu, onMenuLoaded, showMenuGuide
*/

(function(){
  // ---------- Konstanten ----------
  const ACCOUNT_KEY = 'codexmysteria_account';
  const THEME_KEY = 'codexmysteria_theme';

  // Demo / initial codes — ändere diese später, wenn nötig
  const allowedCodes = {
    'ADMIN-ROOT-001': 'admin',
    'DM-ARCANA-001': 'dm',
    'PLAYER-START-001': 'player'
  };

  // ---------- Theme Funktionen ----------
  function applyTheme(theme){
    if (!theme) theme = 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    // mark active buttons if present
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  }

  function loadTheme(){
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
  }

  // ---------- Account / LocalStorage ----------
  function saveAccount(accountObj){
    // keine Passwörter speichern (für Sicherheit). Falls du es brauchst, überarbeite lokal und verschlüssel.
    const sanitized = {
      username: accountObj.username,
      accountType: accountObj.accountType,
      code: accountObj.code,
      stayLoggedIn: !!accountObj.stayLoggedIn,
      createdAt: accountObj.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(sanitized));
  }

  function clearAccount(){
    localStorage.removeItem(ACCOUNT_KEY);
  }

  function getAccount(){
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function isLoggedIn(){
    const acc = getAccount();
    return !!(acc && (acc.stayLoggedIn === true));
  }

  // ---------- Login / Logout ----------
  function login(username, password/*unused but accepted*/, code, stayLoggedIn){
    // Validierung der Eingaben
    username = (username || '').trim();
    code = (code || '').trim().toUpperCase();

    if (!username || !code) {
      return { success:false, message: 'Benutzername und Code erforderlich.' };
    }

    // Erkenne Rolle via allowedCodes mapping
    const role = allowedCodes[code];
    if (!role) {
      return { success:false, message: 'Ungültiger Account-Code.' };
    }

    const accountObj = {
      username,
      accountType: role,
      code,
      stayLoggedIn: !!stayLoggedIn,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    saveAccount(accountObj);
    return { success:true, account: accountObj };
  }

  function logout(){
    clearAccount();
    // falls Seite geändert wird, handle in caller
  }

  // ---------- Menu Hooks & helpers ----------
  // loadMenu(containerSelector, src) lädt menu.html in container (fetch). Hook onMenuLoaded kann initialisieren.
  function loadMenu(selector = '#menu-placeholder', src = 'menu.html'){
    const container = document.querySelector(selector);
    if (!container) return Promise.reject(new Error('Menu container nicht gefunden'));
    return fetch(src, {cache:'no-cache'})
      .then(resp => {
        if (!resp.ok) throw new Error('menu.html konnte nicht geladen werden');
        return resp.text();
      })
      .then(html => {
        container.innerHTML = html;
        if (typeof window.CodexMysteria.onMenuLoaded === 'function') {
          try { window.CodexMysteria.onMenuLoaded(container); } catch(e){ console.error(e); }
        }
        return container;
      });
  }

  // Menu guide placeholder — kann überschrieben werden
  function defaultShowMenuGuide(){
    const el = document.getElementById('menu-guide-modal');
    if (!el) return;
    el.setAttribute('aria-hidden','false');
  }

  // Expose API
  window.CodexMysteria = window.CodexMysteria || {};
  Object.assign(window.CodexMysteria, {
    ACCOUNT_KEY,
    THEME_KEY,
    allowedCodes,
    applyTheme,
    loadTheme,
    login,         // returns {success, message/account}
    logout,
    getAccount,
    isLoggedIn,
    saveAccount,
    clearAccount,
    loadMenu,
    onMenuLoaded: null,
    showMenuGuide: defaultShowMenuGuide
  });

  // initial apply theme on script load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTheme);
  } else {
    loadTheme();
  }
})();
