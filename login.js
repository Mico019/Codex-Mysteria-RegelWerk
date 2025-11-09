/* login.js — steuert die Login-Seite und nutzt window.CodexMysteria API */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.CodexMysteria) {
    console.error('CodexMysteria API fehlt. script.js muss vor login.js geladen sein.');
    return;
  }

  // Theme buttons: automatisch binden (falls vorhanden)
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => window.CodexMysteria.applyTheme(btn.dataset.theme));
  });

  const ACCOUNT_KEY = window.CodexMysteria.ACCOUNT_KEY;
  const accStr = localStorage.getItem(ACCOUNT_KEY);
  const quick = document.getElementById('quick-login');
  const qlName = document.getElementById('ql-username');
  const qlBtn = document.getElementById('ql-btn');
  const qlChange = document.getElementById('ql-change');
  const form = document.getElementById('login-form');
  const msg = document.getElementById('msg');
  const demoBtn = document.getElementById('demo-btn');

  function setMsg(text, type='') {
    msg.textContent = text;
    msg.className = type ? `hint ${type}` : 'hint';
  }

  // Wenn Account vorhanden: Quick-Login anzeigen
  if (accStr) {
    try {
      const acc = JSON.parse(accStr);
      if (acc && acc.username) {
        qlName.textContent = acc.username;
        // auto redirect if stayLoggedIn
        if (acc.stayLoggedIn) {
          setMsg('Automatisch angemeldet — Weiterleitung...');
          setTimeout(() => window.location.href = 'home.html', 500);
          return;
        } else {
          quick.classList.remove('hidden');
          form.classList.add('hidden');
        }
      }
    } catch(e) {
      console.warn('Fehler parsing account', e);
    }
  }

  // Quick buttons
  qlBtn?.addEventListener('click', () => {
    window.location.href = 'home.html';
  });
  qlChange?.addEventListener('click', () => {
    quick.classList.add('hidden');
    form.classList.remove('hidden');
  });

  // Demo-Account (schnelles testen)
  demoBtn?.addEventListener('click', () => {
    const demoCode = 'PLAYER-START-001';
    const res = window.CodexMysteria.login('DemoSpieler', 'demo', demoCode, false);
    if (res.success) {
      setMsg('Demo-Konto erstellt. Weiterleitung...');
      setTimeout(() => window.location.href = 'home.html', 600);
    } else {
      setMsg(res.message || 'Demo fehlgeschlagen', 'error');
    }
  });

  // Formularsubmit -> zentrale login-Funktion
  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    setMsg('');
    const code = document.getElementById('code').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const stay = document.getElementById('stay').checked;

    const result = window.CodexMysteria.login(username, password, code, stay);
    if (!result.success) {
      setMsg(result.message || 'Login fehlgeschlagen', 'error');
      return;
    }

    // Speichern + Weiterleitung
    setMsg('Erfolg — Weiterleitung...');
    setTimeout(() => window.location.href = 'home.html', 400);
  });
});
