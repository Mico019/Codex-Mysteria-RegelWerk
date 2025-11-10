/* regelwerk.js
   - Rendert Kapitelliste
   - Details / Aufklappen (ein offen => andere schließen)
   - Suche mit Vorschlägen + keyboard navigation
   - Nutzt nur Elemente im Regelwerk-Container (keine globalen Style-Änderungen)
*/

document.addEventListener('DOMContentLoaded', () => {
  /* ---------------- Daten (einfach editierbar) ---------------- */
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
  desc: "Ablauf und alle Regeln für Kampf: Initiative, Aktionen, Schaden, Kritische Treffer/Fehlschläge, Effekte, Reaktionen, Rüstung, Verletzungen und Bewegung.",
  subs: [
    "Rundenablauf",
      "Initiative (zu Kampfbeginn)",
      "Rundenstruktur",
      "Spielerzug – Ablauf",
        "Rettungs- & Effektphase",
        "Bewegungsphase",
        "Aktionsphase",
        "Treffer / Proben",
        "Schadensphase",
        "Endphase",
      "Gegnerzüge",
      "Zug-Übersicht",
    "Kritische Regeln",
      "Allgemeine Definition",
      "Schadensberechnung bei Krits",
      "Kritische Verstärkung",
      "Kritische Stacks",
      "Beispiele & Caps",
    "Kritischer Fehlschlag",
      "Definition",
      "Gegnerreaktion",
      "Ablauf",
      "Reaktionsliste (Beispiele)",
    "Effektsystem",
      "Grundprinzip",
      "Würfelfolge",
      "Stackverhalten",
      "Cooldown & Dauer",
      "Wirkungssteigerung (WS)",
      "Rettungswürfe",
      "Beispiele",
    "Reaktionen",
      "Definition",
      "Trigger",
      "Ablauf",
      "Arten & Limits",
    "Rüstungsfertigkeit (RF) & Rüstungssystem",
      "RF-Stufen",
      "RZ & Rüstungsteile",
    "Verletzungen, Tod & Wiederbelebung",
      "Sterbenszustand",
      "Überlebenszeit & Rettungsversuche",
      "Magische Stabilisierung",
    "Waffenfertigkeiten",
      "Stufen & Spezialisation",
      "Ungeübte Waffen",
    "Schildfertigkeit",
      "Block als Reaktion",
      "Fertigkeitsstufen",
    "Bewegung & Stealth-System",
      "Bewegungsrate, Modifikatoren",
      "Stealth / Verstecken",
      "AP-Übersicht"
  ],
  link: "kampfregeln.html"
},

    {
      id: 'magie',
      title: "Magie & Zauberei",
      desc: "Regeln zur Magie, Zauberlisten und das Magiesystem.",
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

  /* ---------------- Elemente ---------------- */
  const listEl = document.getElementById('chapter-list');
  const searchInput = document.getElementById('regelwerk-search');
  const sugBox = document.getElementById('regelwerk-suggestions');

  /* ---------------- Utilities ---------------- */
  const escHtml = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug = s => String(s).toLowerCase().replace(/\s+/g,'-').replace(/[^\w\-]/g,'');

  /* ---------------- Rendering ---------------- */
  function renderChapters() {
    listEl.innerHTML = '';
    chapters.forEach(ch => {
      // Build details-like structure: details semantics but styled as .chapter card
      const details = document.createElement('details');
      details.className = 'chapter';
      details.id = `chapter-${ch.id}`;
      details.setAttribute('data-chapter', ch.id);

      const summary = document.createElement('summary');
      summary.innerHTML = escHtml(ch.title);
      summary.tabIndex = 0; // make focusable

      const content = document.createElement('div');
      content.className = 'chapter-content';
      content.innerHTML = `
        <p class="chapter-desc">${escHtml(ch.desc)}</p>
        <ul class="subsection-list">
          ${ch.subs.map(s => `<li><a href="${ch.link}#${slug(s)}">${escHtml(s)}</a></li>`).join('')}
        </ul>
        <div style="margin-top:10px;"><a href="${ch.link}" class="open-chapter">Kapitel öffnen</a></div>
      `;

      // when opening a chapter, close others (keeps UI tidy)
      details.addEventListener('toggle', () => {
        if (details.open) {
          // close all other details
          document.querySelectorAll('.chapter').forEach(d => { if (d !== details) d.open = false; });
          // ensure details content is visible (scroll if necessary)
          setTimeout(() => {
            details.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
        }
      });

      // allow clicking the summary to toggle (native), nothing more needed
      details.appendChild(summary);
      details.appendChild(content);

      listEl.appendChild(details);
    });
  }

  /* ---------------- Search index ---------------- */
  const searchIndex = [];
  (function buildIndex() {
    chapters.forEach(ch => {
      searchIndex.push({ label: ch.title, link: ch.link, chapterId: ch.id, type: 'chapter' });
      ch.subs.forEach(sub => searchIndex.push({ label: `${ch.title} › ${sub}`, link: `${ch.link}#${slug(sub)}`, chapterId: ch.id, type: 'sub' }));
    });
  })();

  /* ---------------- Scoring (fuzzy-ish) ---------------- */
  function score(text, q) {
    text = text.toLowerCase();
    q = q.toLowerCase();
    if (text === q) return 100;
    if (text.startsWith(q)) return 80;
    if (text.includes(q)) return 50;
    // token matches
    const tokens = q.split(/\s+/).filter(Boolean);
    let hits = 0;
    tokens.forEach(t => { if (text.includes(t)) hits++; });
    return hits ? hits * 10 : 0;
  }

  /* ---------------- Suggestions UI ---------------- */
  let activeIndex = -1;
  function showSuggestions(list) {
    if (!list || !list.length) { sugBox.style.display = 'none'; sugBox.innerHTML = ''; return; }
    sugBox.innerHTML = list.map((it, i) => `<li role="option" data-index="${i}" data-link="${escHtml(it.link)}">${escHtml(it.label)}</li>`).join('');
    sugBox.style.display = 'block';
    activeIndex = -1;
  }

  function hideSuggestions() {
    sugBox.style.display = 'none';
    sugBox.innerHTML = '';
    activeIndex = -1;
  }

  // keyboard navigation within suggestions
  function focusSuggestion(idx) {
    const items = Array.from(sugBox.querySelectorAll('li'));
    items.forEach(it => it.classList.remove('active'));
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
      activeIndex = idx;
    } else activeIndex = -1;
  }

  /* ---------------- Query / debounce ---------------- */
  let debounceTimer = null;
  function onQuery(q) {
    if (!q || !q.trim()) { hideSuggestions(); return; }
    const scores = searchIndex.map(it => ({ it, score: score(it.label, q) })).filter(x => x.score > 0);
    if (!scores.length) { hideSuggestions(); return; }
    scores.sort((a,b) => b.score - a.score);
    const matches = scores.slice(0, 12).map(s => s.it);
    showSuggestions(matches);
  }
  function debounceQuery(q) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onQuery(q), 120);
  }

  /* ---------------- Events ---------------- */
  searchInput.addEventListener('input', e => {
    debounceQuery(e.target.value);
  });

  // keyboard: arrow up/down + Enter + Esc
  searchInput.addEventListener('keydown', (e) => {
    const isVisible = sugBox.style.display === 'block';
    if (!isVisible) return;
    const items = Array.from(sugBox.querySelectorAll('li'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndex + 1) % items.length;
      focusSuggestion(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
      focusSuggestion(prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = activeIndex >= 0 ? activeIndex : 0;
      const li = items[idx];
      if (li) navigateSuggestion(li);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  // click on suggestion
  sugBox.addEventListener('click', (ev) => {
    const li = ev.target.closest('li');
    if (!li) return;
    navigateSuggestion(li);
  });

  function navigateSuggestion(li) {
    const link = li.dataset.link;
    if (!link) { hideSuggestions(); return; }
    // if the link points to a chapter-sub anchor on same page, open that chapter first then navigate
    const urlParts = link.split('#');
    const page = urlParts[0];
    const anchor = urlParts[1] || null;

    // find if chapter exists in our chapters list for the target page
    const ch = chapters.find(c => c.link === page || link.startsWith(c.link));
    if (ch) {
      // open the chapter details
      const details = document.getElementById(`chapter-${ch.id}`);
      if (details) {
        details.open = true;
        // if specified anchor, scroll to the anchor after a short delay
        setTimeout(() => {
          if (anchor) {
            // look for anchor in document; if not present (because chapter page different), navigate
            const target = document.querySelector(`#${anchor}`) || document.querySelector(`a[name="${anchor}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else window.location.href = link;
          } else {
            details.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
        hideSuggestions();
        searchInput.blur();
        return;
      }
    }
    // fallback: navigate to link
    window.location.href = link;
  }

  // clicks outside search area hide suggestions
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.regelwerk-search')) hideSuggestions();
  });

  /* ---------------- Initial render ---------------- */
  renderChapters();
});
