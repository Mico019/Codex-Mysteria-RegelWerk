document.addEventListener('DOMContentLoaded', () => {
  const session = window.CodexMysteria.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const role = session.role || 'guest';
  const username = session.username || 'Unbekannt';

  const welcome = document.getElementById('user-welcome');
  const roleEl = document.getElementById('user-role');
  if (welcome) welcome.textContent = `Willkommen, ${username}`;
  if (roleEl) roleEl.textContent = `Rolle: ${role}`;

  // Automatische Weiterleitungen je nach Rolle
  if (role === 'admin' && !location.pathname.endsWith('home_admin.html')) {
    window.location.href = 'home_admin.html';
    return;
  }
  if (role === 'dm' && !location.pathname.endsWith('home_dm.html')) {
    window.location.href = 'home_dm.html';
    return;
  }
  if (role === 'player' && !location.pathname.endsWith('home.html')) {
    window.location.href = 'home.html';
    return;
  }
  if (role === 'guest' && !location.pathname.endsWith('home.html')) {
    window.location.href = 'home.html';
    return;
  }

  // 🔹 Gast-Account: Nur Regelwerk sichtbar
  if (role === 'guest') {
    document.querySelectorAll('#player-actions .action-card').forEach(card => {
      if (!card.href.includes('regelwerk')) card.style.display = 'none';
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    window.CodexMysteria.logout();
    window.location.href = 'index.html';
  });
});
