/* regelwerk.js — Kapitel-Liste + Suche + Detail-Toggle
   - benutzt vorhandene Kapitel-Daten (unten)
   - rendert Karten, Detail-Toggle zeigt Unterkapitel & Links
   - Suche zeigt Vorschläge; Klick springt zum Kapitel
   - Keine globalen Stilveränderungen
*/

document.addEventListener('DOMContentLoaded', () => {
  const chapters = [
    {
      id: 'einleitung',
      title: "Einleitung",
      desc: "Grundlegende Informationen zur Welt und zu den Spielprinzipien.",
      subs: ["Überblick", "Was ist Codex Mystica?", "Wie man spielt"],
      link: "einleitung.html"
    },
    {
      id: 'kampfregeln',
      title: "Kampfregeln",
      desc: "Wie Kämpfe ablaufen: Initiative, Angriffe, Schaden, Spezialregeln.",
      subs: ["Initiative", "Angriff & Verteidigung", "Schaden & Zustände", "Deckung"],
      link: "kampfregeln.html"
    },
    {
      id: 'magie',
      title: "Magie & Zauberei",
      desc: "Regeln zur Magie, Zauberlisten und Magiesystem.",
      subs: ["Zauberklassen", "Rituale", "Schule der Magie"],
      link: "magie.html"
    },
    {
      id: 'ausruestung',
      title: "Ausrüstung & Gegenstände",
      desc: "Waffen, Rüstungen, Werkzeuge, Artefakte.",
      subs: ["Waffenarten", "Rüstungen", "Handwerksmaterialien"],
      link: "ausruestung.html"
    },
    {
      id: 'bestiarium',
      title: "Bestiarium",
      desc: "Monster, Kreaturen und Gegner mit Kurzinfos.",
      subs: ["Drachen", "Untote", "Wildtiere", "Dämonen"],
      link: "bestiarium.html"
    }
  ];

  const container = document.getElementById('chapter-list');
  const searchInput = document.getElementById('rule-search');
  const suggestions = document.getElementById('search-suggestions');

  // Render-Funktion: Karten mit Detail-Toggle
  function renderChapters(list) {
    container.innerHTML = '';
    list.forEach((ch, i) => {
      const card = document.createElement('article');
      card.className = 'chapter-card';
      card.dataset.chapterId = ch.id;

      card.innerHTML = `
        <div class="chapter-header">
          <div class="chapter-title"><a href="${ch.link}">${escapeHtml(ch.title)}</a></div>
          <div class="chapter-actions">
            <button class="detail-toggle" data-idx="${i}" aria-expanded="false">Details ▾</button>
            <a class="open-chapter" href="${ch.link}">Öffnen</a>
          </div>
        </div>
        <div class="chapter-desc">${escapeHtml(ch.desc)}</div>
        <div class="chapter-details" id="details-${i}" aria-hidden="true">
          <div class="chapter-details-intro" style="margin-bottom:8px;">Unterkapitel:</div>
          <ul>
            ${ch.subs.map(s => `<li><a href="${ch.link}#${slug(s)}">${escapeHtml(s)}</a></li>`).join('')}
          </ul>
          <div style="margin-top:10px;"><a href="${ch.link}">Zum Kapitel (ganze Seite)</a></div>
        </div>
      `;

      // detail button: toggle
      const btn = card.querySelector('.detail-toggle');
      const details = card.querySelector('.chapter-details');
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const open = details.getAttribute('aria-hidden') === 'false';
        if (open) {
          details.setAttribute('aria-hidden','true');
          btn.setAttribute('aria-expanded','false');
          btn.textContent = 'Details ▾';
        } else {
          details.setAttribute('aria-hidden','false');
          btn.setAttribute('aria-expanded','true');
          btn.textContent = 'Details ▴';
        }
      });

      // optional: card click (nicht auf Buttons/links) navigiert
      card.addEventListener('click', (ev) => {
        const isAction = ev.target.closest('.detail-toggle') || ev.target.closest('.open-chapter') || ev.target.closest('a');
        if (!isAction) window.location.href = ch.link;
      });

      container.appendChild(card);
    });
  }

  // Utility
  function slug(s) { return String(s).toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,''); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Suche / Vorschläge (einfach, case-insensitive)
  function gatherSearchItems() {
    // returns list of {label, chapterLink}
    const items = [];
    chapters.forEach(ch => {
      items.push({ label: ch.title, link: ch.link });
      ch.subs.forEach(sub => items.push({ label: `${ch.title} › ${sub}`, link: `${ch.link}#${slug(sub)}` }));
    });
    return items;
  }
  const allItems = gatherSearchItems();

  function updateSuggestions(value) {
    const q = (value || '').trim().toLowerCase();
    if (!q) { suggestions.style.display = 'none'; suggestions.innerHTML = ''; return; }

    // simple substring match; keep order: exact title matches first
    const matches = allItems
      .map(it => ({ it, score: scoreQuery(it.label.toLowerCase(), q) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)   // higher score first
      .map(x => x.it);

    if (!matches.length) { suggestions.style.display = 'none'; suggestions.innerHTML = ''; return; }

    suggestions.innerHTML = matches.slice(0,10).map(m => `<li data-link="${m.link}">${escapeHtml(m.label)}</li>`).join('');
    suggestions.style.display = 'block';
  }

  // Scoring: simple fuzzy-ish scoring: exact startsWith > contains > parts match
  function scoreQuery(text, q) {
    if (text === q) return 100;
    if (text.startsWith(q)) return 80;
    if (text.includes(q)) return 40 + (q.split(' ').length);
    // partial token match
    const qTokens = q.split(/\s+/).filter(Boolean);
    let hits = 0;
    qTokens.forEach(t => { if (text.includes(t)) hits++; });
    return hits ? 10 * hits : 0;
  }

  // suggestion click (delegation)
  suggestions.addEventListener('click', (ev) => {
    const li = ev.target.closest('li');
    if (!li) return;
    const link = li.dataset.link;
    if (link) window.location.href = link;
  });

  // input events
  searchInput.addEventListener('input', (e) => updateSuggestions(e.target.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { suggestions.style.display = 'none'; }
  });

  // click outside suggestions: hide
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) suggestions.style.display = 'none';
  });

  // initial render
  renderChapters(chapters);
});
