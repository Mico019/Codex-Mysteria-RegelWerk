/* script.js — zentrale Logik für Codex Mysteria
   ► Notiz / Fundstelle für späteres Anpassen:
   - LocalStorage Account-Key: 'codexmysteria_account'
   - Theme-Key: 'codexmysteria_theme'
   - Hier unten die erlaubten Codes anpassen: `allowedCodes`
   - Demo-Codes (Beispiele):
       ADMIN-ROOT-001  => admin
       DM-ARCANA-001   => dm
       PLAYER-START-001=> player
   ▸ Ändere die Codes bevor du live gehst (oder erzeuge per Server).
*/

(() => {
  // ---------- Konfiguration ----------
  const ACCOUNT_KEY = 'codexmysteria_account';
  const THEME_KEY = 'codexmysteria_theme';

  // Beispiel-Codes mapping -> Rolle. Ändere hier deine Codes.
  const allowedCodes = {
    'ADMIN-ROOT-001': 'admin',
    'DM-ARCANA-001': 'dm',
    'PLAYER-START-001': 'player'
  };

  // ---------- Helfer ----------
  function qs(sel, root = document) { return root.querySelector(sel); }
  function setMsg(text, type='') {
    const el = qs('#msg'); el.textContent = text;
    el.className = 'msg' + (type ? ' ' + type : '');
  }

  // Theme handling
  function applyTheme(theme) {
    // set data-theme auf html für CSS-Variablen
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    // markiere aktive button
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
  }

  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
  }

  // Account handling (Local)
  function saveAccount(obj) {
    // Speichere nur notwendige Felder — kein Passwort (lokal-demo)
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(obj));
  }
  function clearAccount() {
    localStorage.removeItem(ACCOUNT_KEY);
  }
  function getAccount() {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function isLoggedIn() {
    const acc = getAccount();
    return acc && (acc.stayLoggedIn === true || acc.lastActive);
  }

  // Öffentliche API (global, damit andere Seiten sie verwenden können)
  window.CodexMysteria = {
    getAccount,
    isLoggedIn,
    logout: function() {
      clearAccount();
      // redirect to index
      window.location.href = 'index.html';
    },
    ACCOUNT_KEY,
    THEME_KEY,
    allowedCodes // zur Kontrolle von anderen Seiten möglich
  };

  // ---------- Login Formular ----------
  function bindForm() {
    const form = qs('#login-form');
    const codeInput = qs('#code');
    const usernameInput = qs('#username');
    const passInput = qs('#password');
    const stayInput = qs('#stay');
    const demoBtn = qs('#demo-btn');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      setMsg('');

      const code = codeInput.value.trim().toUpperCase();
      const username = usernameInput.value.trim();
      const password = passInput.value; // nicht gespeichert (lokal demo)
      const stay = stayInput.checked;

      if (!code || !username || !password) {
        setMsg('Bitte alle Felder ausfüllen.', 'error');
        return;
      }

      const role = allowedCodes[code];
      if (!role) {
        setMsg('Ungültiger Code. Überprüfe den Account-Code.', 'error');
        return;
      }

      // Erzeuge account object
      const accountObj = {
        username,
        accountType: role,
        stayLoggedIn: !!stay,
        createdAt: new Date().toISOString(),
        // lastActive genutzt, um zu prüfen, ob es ein aktuelles Konto ist
        lastActive: new Date().toISOString()
      };

      saveAccount(accountObj);
      setMsg('Erfolg — Du wirst weitergeleitet...', 'success');

      // kleine Verzögerung für UI-Feedback, dann redirect
      setTimeout(() => {
        // Achtung: home.html noch nicht erstellt — wird erwartet
        window.location.href = 'home.html';
      }, 700);
    });

    demoBtn.addEventListener('click', () => {
      // Schnelles Demo-Konto (player)
      const demo = {
        username: 'DemoSpieler',
        accountType: 'player',
        stayLoggedIn: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      saveAccount(demo);
      setMsg('Demo-Account erstellt. Weiterleitung...', 'success');
      setTimeout(() => window.location.href = 'home.html', 600);
    });
  }

  // Theme buttons
  function bindThemeButtons() {
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.addEventListener('click', () => applyTheme(b.dataset.theme));
    });
  }

  // Auto-Redirect, falls schon eingeloggt (stayLoggedIn)
  function autoRedirectIfLogged() {
    const acc = getAccount();
    if (acc && acc.stayLoggedIn) {
      // Optional: prüfe Timestamp; hier direkte Weiterleitung
      setMsg('Automatisch angemeldet — Weiterleitung...', 'success');
      setTimeout(() => window.location.href = 'home.html', 700);
    }
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    bindThemeButtons();
    bindForm();
    autoRedirectIfLogged();
  });

})();
document.addEventListener("DOMContentLoaded", () => {
  const accStr = localStorage.getItem(window.CodexMysteria.ACCOUNT_KEY);
  if (!accStr) return;
  const acc = JSON.parse(accStr);

  // Prüfe, ob wir "stayLoggedIn" oder gespeicherten Nutzer haben
  if (acc.username) {
    const ql = document.getElementById("quick-login");
    const qlUser = document.getElementById("ql-username");
    const loginForm = document.getElementById("login-form");

    if (ql && qlUser && loginForm) {
      qlUser.textContent = acc.username;
      ql.classList.remove("hidden");
      loginForm.classList.add("hidden");

      document.getElementById("ql-btn").addEventListener("click", () => {
        // Direkt weiter zur Home-Seite
        window.location.href = "home.html";
      });

      document.getElementById("ql-change").addEventListener("click", () => {
        // Erlaube Neu-Login
        ql.classList.add("hidden");
        loginForm.classList.remove("hidden");
      });
    }
  }
});
