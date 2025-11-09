/* script.js — zentrale Engine für Accounts, Session, Theme
   - Accounts werden in localStorage unter "codexmysteria_accounts" gespeichert (Array).
   - Session wird in localStorage unter "codexmysteria_session" gespeichert.
   - Passwort-Hashes: SHA-256 (browser crypto.subtle). Nicht 100% sicher wie Server-Hash+Salt,
     aber deutlich besser als Klartext.
   - Funktionen:
       createAccount(username, password, accountCode)  -> {success, message}
       authenticate(username, password, stay)          -> {success, message}
       guestLogin()                                     -> creates ephemeral guest session
       getSession()                                     -> session object or null
       logout()                                         -> clears session
       isAllowed(role, permissionKey)                   -> helper for pages
       listAccounts()                                   -> array of accounts (for debug)
   - allowedCodes: change mapping of codes -> role here.
*/

(function(){
  const ACCOUNTS_KEY = 'codexmysteria_accounts';
  const SESSION_KEY  = 'codexmysteria_session';
  const THEME_KEY    = 'codexmysteria_theme';

  // ----- Config: Code -> role mapping (editiere nach Bedarf) -----
  // Format: 'CODE': 'role'  (roles: 'admin', 'dm', 'player')
  const allowedCodes = {
    'ADMIN-ROOT-001': 'admin',
    'DM-ARCANA-001': 'dm',
    'PLAYER-START-001': 'player'
  };

  // ----- Helpers -----
  function loadAccounts(){
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw) || []; } catch { return []; }
  }
  function saveAccounts(list){
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  }
  function saveSession(obj){
    localStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  }
  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
  }
  function loadSession(){
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function findAccountByUsername(username){
    username = (username || '').toString();
    return loadAccounts().find(a => a.username.toLowerCase() === username.toLowerCase()) || null;
  }

  // Passwort-Hash mit SHA-256
  async function hashPassword(password){
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ----- Core API -----
  async function createAccount(username, password, accountCode){
    username = (username || '').trim();
    password = (password || '');
    accountCode = (accountCode || '').trim().toUpperCase();

    if (!username || !password || !accountCode) {
      return { success:false, message: 'Bitte alle Felder ausfüllen.' };
    }

    // Check duplicate username
    if (findAccountByUsername(username)) {
      return { success:false, message: 'Benutzername bereits vergeben.' };
    }

    // Resolve role from code
    const role = allowedCodes[accountCode];
    if (!role) {
      return { success:false, message: 'Ungültiger Account-Code.' };
    }

    const pwHash = await hashPassword(password);
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

    // Set session after creation (stay = true by default for a smoother UX)
    const session = {
      username,
      role,
      createdAt: new Date().toISOString(),
      isGuest: false,
      stay: true
    };
    saveSession(session);

    return { success:true, account: accountObj };
  }

  async function authenticate(username, password, stay = false){
    username = (username || '').trim();
    password = (password || '');
    if (!username || !password) return { success:false, message: 'Benutzername und Passwort erforderlich.' };

    const account = findAccountByUsername(username);
    if (!account) return { success:false, message: 'Benutzer nicht gefunden.' };

    const pwHash = await hashPassword(password);
    if (pwHash !== account.passwordHash) return { success:false, message: 'Falsches Passwort.' };

    // success: create session
    const session = {
      username: account.username,
      role: account.role,
      createdAt: new Date().toISOString(),
      isGuest: false,
      stay: !!stay
    };
    saveSession(session);
    return { success:true, session };
  }

  function guestLogin(){
    // ephemeral guest session — nicht in accounts gespeichert
    const session = {
      username: 'Gast',
      role: 'guest',
      createdAt: new Date().toISOString(),
      isGuest: true,
      stay: false
    };
    saveSession(session);
    return { success:true, session };
  }

  function logout(){
    clearSession();
    // leave redirect to caller (page script)
  }

  function getSession(){
    return loadSession();
  }

  function listAccounts(){
    return loadAccounts();
  }

  // permissions helper — sehr simpel; erweitertbar
  // permissionKey examples: 'view_rules', 'manage_campaigns', 'admin_panel'
  function isAllowed(role, permissionKey){
    // default policy:
    // guest -> only 'view_rules'
    // player -> view_rules, use_tools
    // dm -> view_rules, use_tools, dm_tools
    // admin -> everything
    const map = {
      'guest': ['view_rules'],
      'player': ['view_rules','use_tools'],
      'dm': ['view_rules','use_tools','dm_tools'],
      'admin': ['view_rules','use_tools','dm_tools','admin_panel']
    };
    const allowed = map[role] || [];
    return allowed.includes(permissionKey);
  }

  // expose API to global namespace
  window.CodexMysteria = window.CodexMysteria || {};
  Object.assign(window.CodexMysteria, {
    createAccount, authenticate, guestLogin, logout, getSession,
    listAccounts, isAllowed,
    ACCOUNTS_KEY, SESSION_KEY, THEME_KEY,
    // for dev/debug:
    _internal_allowedCodes: allowedCodes
  });

  // auto-load theme if saved (simple)
  (function loadThemeOnStart(){
    const t = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  })();

})();

/* === 🔮 AUTO LOAD MENU SYSTEM ===
   Fügt menu.css, menu.html und menu.js automatisch auf allen Seiten hinzu.
   Wird automatisch übersprungen, wenn man sich auf der Login-Seite befindet.
*/
(function autoLoadMenu() {
  // --- Prüfen ob wir uns auf der Login- oder Register-Seite befinden ---
  const path = window.location.pathname.toLowerCase();
  if (path.includes("login") || path.includes("register")) {
    console.log("[Codex Mysteria] Menü wird auf dieser Seite übersprungen.");
    return;
  }

  // --- CSS laden (nur einmal, falls noch nicht vorhanden) ---
  if (!document.querySelector('link[href="menu.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "menu.css";
    document.head.appendChild(link);
    console.log("[Codex Mysteria] menu.css geladen.");
  }

  // --- Platzhalter einfügen, falls nicht vorhanden ---
  let container = document.getElementById("menu-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "menu-container";
    // Menü immer an den Anfang des <body> setzen
    document.body.insertBefore(container, document.body.firstChild);
  }

  // --- menu.html laden und einfügen ---
  fetch("menu.html")
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(html => {
      container.innerHTML = html;
      console.log("[Codex Mysteria] menu.html eingefügt.");

      // --- menu.js dynamisch nachladen ---
      const script = document.createElement("script");
      script.src = "menu.js";
      script.defer = true;
      script.onload = () => console.log("[Codex Mysteria] menu.js geladen & aktiv.");
      script.onerror = e => console.warn("Fehler beim Laden von menu.js:", e);
      document.body.appendChild(script);
    })
    .catch(err => {
      console.warn("[Codex Mysteria] Menü konnte nicht geladen werden:", err);
    });
})();
