document.addEventListener('DOMContentLoaded', () => {
  const chapters = [
    {
      title: "Einleitung",
      desc: "Grundlegende Informationen zur Welt und zu den Spielprinzipien.",
      subs: ["Überblick", "Was ist Codex Mystica?", "Wie man spielt"],
      link: "einleitung.html"
    },
    {
      title: "Kampfregeln",
      desc: "Hier erfährst du, wie Kämpfe ablaufen, Initiative funktioniert und wie man Angriffe würfelt.",
      subs: ["Initiative", "Angriff & Verteidigung", "Schaden & Tod"],
      link: "kampfregeln.html"
    },
    {
      title: "Magie & Zauberei",
      desc: "Alle Regeln zur Magie, Zaubersprüche und deren Anwendung im Spiel.",
      subs: ["Zauberklassen", "Mana-System", "Zauberlisten"],
      link: "magie.html"
    },
    {
      title: "Ausrüstung & Gegenstände",
      desc: "Waffen, Rüstungen, Artefakte und Alltagsgegenstände.",
      subs: ["Waffenarten", "Rüstungen", "Seltene Artefakte"],
      link: "ausruestung.html"
    },
    {
      title: "Bestiarium",
      desc: "Ein Verzeichnis aller Monster, Kreaturen und Gegner.",
      subs: ["Drachen", "Untote", "Tiere", "Dämonen"],
      link: "bestiarium.html"
    }
  ];

  const container = document.getElementById('chapter-list');
  const searchInput = document.getElementById('rule-search');
  const suggestions = document.getElementById('search-suggestions');

  // Kapitel rendern
  function renderChapters(list) {
    container.innerHTML = '';
    list.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'chapter-card';
      card.innerHTML = `
        <div class="chapter-title">${ch.title}</div>
        <div class="chapter-desc">${ch.desc}</div>
        <div class="chapter-links">
          ${ch.subs.map(s => `<a href="${ch.link}#${s.toLowerCase().replace(/\s+/g,'-')}">${s}</a>`).join(' | ')}
        </div>
      `;
      card.addEventListener('click', () => location.href = ch.link);
      container.appendChild(card);
    });
  }

  // Suchfunktion
  function updateSuggestions(value) {
    const val = value.toLowerCase();
    if (!val) {
      suggestions.style.display = 'none';
      return;
    }

    const matches = chapters
      .flatMap(ch => [ch.title, ...ch.subs.map(s => `${ch.title} › ${s}`)])
      .filter(name => name.toLowerCase().includes(val));

    if (matches.length === 0) {
      suggestions.style.display = 'none';
      return;
    }

    suggestions.innerHTML = matches.slice(0, 8)
      .map(m => `<li>${m}</li>`)
      .join('');
    suggestions.style.display = 'block';

    document.querySelectorAll('#search-suggestions li').forEach(li => {
      li.addEventListener('click', () => {
        const [chapterName] = li.textContent.split(' › ');
        const chapter = chapters.find(c => c.title === chapterName);
        if (chapter) location.href = chapter.link;
      });
    });
  }

  searchInput.addEventListener('input', e => updateSuggestions(e.target.value));
  document.addEventListener('click', () => suggestions.style.display = 'none');

  renderChapters(chapters);
});
