/* kampfregeln.initiative.js
   Initiative-Tool + exakte Schwellenwerte (erste Sequenz) + Extrapolation
   - Einfügen in kampfregeln.js oder als eigenes Script.
   - Exponiert window.KampfTools.initiative { minInitiativeForTurns, turnsFromInitiative, thresholdsFor }
*/

(function () {
  'use strict';

  // Namespace (sicher)
  window.KampfTools = window.KampfTools || {};
  window.KampfTools.initiative = window.KampfTools.initiative || {};

  // --- exakte Anfangswerte (wie gewünscht) ---
  // Index: x-1 => minInitiativeForTurns(x)
  const baseThresholds = [
    1,    // x = 1
    35,   // x = 2
    55,   // x = 3
    80,   // x = 4
    105,  // x = 5
    135,  // x = 6
    170,  // x = 7
    210,  // x = 8
    255   // x = 9
  ];

  // Wachstumsparameter für Extrapolation (anpassbar)
  const incGrowth = 5;      // wie stark das "Inkrement" pro weiterer Stufe wächst
  const safetyMaxTurns = 2000; // Kapazitätsschutz bei Bugs

  // Gibt die minimale Initiative y zurück, die für x Züge erforderlich ist.
  function minInitiativeForTurns(x) {
    x = Math.max(1, Math.floor(Number(x) || 0));

    if (x <= baseThresholds.length) return baseThresholds[x - 1];

    // Start bei letztem bekannten Wert
    let n = baseThresholds.length; // letzter Index als Stufe
    let current = baseThresholds[n - 1];          // y_n (aktueller y)
    let prev = baseThresholds[n - 2];             // y_{n-1}
    let increment = current - prev;               // letzter bekannter Schritt (delta_n)

    // Iterativ bis zur gewünschten x-Stufe
    for (let target = n + 1; target <= x; target++) {
      increment += incGrowth;   // wachsendes Inkrement
      current = current + increment;
      // safety break (verhindert infinite loops)
      if (target > safetyMaxTurns) break;
    }
    return current;
  }

  // Berechnet, wie viele ZÜGE (x) die gegebene Initiative 'ini' erlaubt.
  function turnsFromInitiative(ini) {
    ini = Number(ini || 0);
    if (!isFinite(ini) || ini < 0) return 0;

    // schnelle Basissuche im bekannten Array (falls passt)
    for (let i = baseThresholds.length; i >= 1; i--) {
      if (ini >= baseThresholds[i - 1]) {
        // wir startn bei der höchsten bekannten Stufe, prüfen weiter
        let x = i;
        // erweitern bis die nächste Stufe nicht mehr erreicht ist
        while (ini >= minInitiativeForTurns(x + 1) && x < safetyMaxTurns) x++;
        return x;
      }
    }
    // wenn kleiner als erster Wert (1), je nach Regel: 0 oder 1. Wir geben 1 zurück wenn ini >=1
    return ini >= 1 ? 1 : 0;
  }

  // Hilfsfunktion: gibt die ersten N Schwellen als Array zurück (n>=1)
  function thresholdsFor(n) {
    n = Math.max(1, Math.floor(Number(n) || 0));
    const arr = [];
    for (let x = 1; x <= n; x++) arr.push(minInitiativeForTurns(x));
    return arr;
  }

  // Exporte
  window.KampfTools.initiative.minInitiativeForTurns = minInitiativeForTurns;
  window.KampfTools.initiative.turnsFromInitiative = turnsFromInitiative;
  window.KampfTools.initiative.thresholdsFor = thresholdsFor;

  // ---------------- UI-Wiring (verbindet sich mit dem HTML-Tool oben)
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('initiativeInput');
    const btn = document.getElementById('calcBtn');
    const res = document.getElementById('initiativeResult');
    const tableDiv = document.getElementById('thresholdsList');
    const showTableBtn = document.getElementById('showTableBtn');

    if (!input || !btn || !res || !tableDiv) {
      // HTML nicht gefunden — nichts weiter tun (Script ist sicher)
      return;
    }

    function renderResult(ini) {
      const iniN = Number(ini || 0);
      if (!isFinite(iniN)) { res.innerHTML = 'Bitte eine gültige Zahl eingeben.'; return; }
      const turns = turnsFromInitiative(iniN);
      const nextThreshold = minInitiativeForTurns(turns + 1);
      const reached = minInitiativeForTurns(turns);

      let html = `<strong>Initiative:</strong> ${iniN} — <strong>Züge (x):</strong> ${turns}<br/>`;
      html += `<small>Erreichte Schwelle für ${turns} Zug${turns>1?'e':''}: ${reached}</small><br/>`;
      html += `<small>Nächste Schwelle (für ${turns+1} Züge): ${nextThreshold}</small>`;

      res.innerHTML = html;
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      renderResult(input.value);
    });

    // Enter-Taste im Input löst Berechnung aus
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        renderResult(input.value);
      }
    });

    // Schwellentabelle
    let tableVisible = false;
    showTableBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      tableVisible = !tableVisible;
      if (!tableVisible) {
        tableDiv.style.display = 'none';
        showTableBtn.textContent = 'Schwellen anzeigen';
        return;
      }
      // render first 18 thresholds for preview
      const N = 18;
      const th = thresholdsFor(N);
      let html = '<table style="width:100%; border-collapse:collapse;">';
      html += '<thead><tr><th style="text-align:left; padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.04)">Züge (x)</th>';
      html += '<th style="text-align:left; padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.04)">Min. Initiative (y)</th></tr></thead><tbody>';
      for (let i=0;i<th.length;i++) {
        html += `<tr><td style="padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.02)">${i+1}</td><td style="padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.02)">${th[i]}</td></tr>`;
      }
      html += '</tbody></table>';
      tableDiv.innerHTML = html;
      tableDiv.style.display = 'block';
      showTableBtn.textContent = 'Tabelle verbergen';
    });

    // (optional) live-update, falls du das magst: (deaktiviert standardmäßig)
    // input.addEventListener('input', () => renderResult(input.value));
  });

})();
