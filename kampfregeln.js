/* kampfregeln.initiative.js — aktualisierte Version
   - Tabelle zeigt alle Schwellen bis zur aktuellen Zugmenge + 5
*/

(function () {
  'use strict';

  window.KampfTools = window.KampfTools || {};
  window.KampfTools.initiative = window.KampfTools.initiative || {};

  const baseThresholds = [1, 35, 55, 80, 105, 135, 170, 210, 255];
  const incGrowth = 5;
  const safetyMaxTurns = 2000;

  function minInitiativeForTurns(x) {
    x = Math.max(1, Math.floor(Number(x) || 0));
    if (x <= baseThresholds.length) return baseThresholds[x - 1];
    let n = baseThresholds.length;
    let current = baseThresholds[n - 1];
    let prev = baseThresholds[n - 2];
    let increment = current - prev;
    for (let target = n + 1; target <= x; target++) {
      increment += incGrowth;
      current += increment;
      if (target > safetyMaxTurns) break;
    }
    return current;
  }

  function turnsFromInitiative(ini) {
    ini = Number(ini || 0);
    if (!isFinite(ini) || ini < 0) return 0;
    for (let i = baseThresholds.length; i >= 1; i--) {
      if (ini >= baseThresholds[i - 1]) {
        let x = i;
        while (ini >= minInitiativeForTurns(x + 1) && x < safetyMaxTurns) x++;
        return x;
      }
    }
    return ini >= 1 ? 1 : 0;
  }

  function thresholdsFor(n) {
    n = Math.max(1, Math.floor(Number(n) || 0));
    const arr = [];
    for (let x = 1; x <= n; x++) arr.push(minInitiativeForTurns(x));
    return arr;
  }

  window.KampfTools.initiative.minInitiativeForTurns = minInitiativeForTurns;
  window.KampfTools.initiative.turnsFromInitiative = turnsFromInitiative;
  window.KampfTools.initiative.thresholdsFor = thresholdsFor;

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('initiativeInput');
    const btn = document.getElementById('calcBtn');
    const res = document.getElementById('initiativeResult');
    const tableDiv = document.getElementById('thresholdsList');
    const showTableBtn = document.getElementById('showTableBtn');

    if (!input || !btn || !res || !tableDiv) return;

    function renderResult(ini) {
      const iniN = Number(ini || 0);
      if (!isFinite(iniN)) {
        res.innerHTML = 'Bitte eine gültige Zahl eingeben.';
        return;
      }
      const turns = turnsFromInitiative(iniN);
      const nextThreshold = minInitiativeForTurns(turns + 1);
      const reached = minInitiativeForTurns(turns);

      let html = `<strong>Initiative:</strong> ${iniN} — <strong>Züge (x):</strong> ${turns}<br/>`;
      html += `<small>Erreichte Schwelle für ${turns} Zug${turns>1?'e':''}: ${reached}</small><br/>`;
      html += `<small>Nächste Schwelle (für ${turns+1} Züge): ${nextThreshold}</small>`;
      res.innerHTML = html;

      // --- Tabelle dynamisch anpassen ---
      const total = turns + 5; // alle Schwellen bis aktuelle Zugmenge + 5
      const th = thresholdsFor(total);
      let tHtml = '<table style="width:100%; border-collapse:collapse;">';
      tHtml += '<thead><tr><th style="text-align:left; padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.04)">Züge (x)</th>';
      tHtml += '<th style="text-align:left; padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.04)">Min. Initiative (y)</th></tr></thead><tbody>';
      for (let i = 0; i < th.length; i++) {
        const highlight = i + 1 <= turns ? 'background:rgba(255,255,255,0.04);' : '';
        tHtml += `<tr style="${highlight}"><td style="padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.02)">${i+1}</td><td style="padding:6px 4px; border-bottom:1px solid rgba(255,255,255,0.02)">${th[i]}</td></tr>`;
      }
      tHtml += '</tbody></table>';
      tableDiv.innerHTML = tHtml;
      tableDiv.style.display = 'block';
      showTableBtn.textContent = 'Tabelle aktualisiert';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      renderResult(input.value);
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        renderResult(input.value);
      }
    });

    let tableVisible = false;
    showTableBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      tableVisible = !tableVisible;
      if (!tableVisible) {
        tableDiv.style.display = 'none';
        showTableBtn.textContent = 'Schwellen anzeigen';
      } else {
        renderResult(input.value || 0);
      }
    });
  });
})();
