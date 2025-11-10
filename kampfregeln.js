
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("initiativeInput");
  const btn = document.getElementById("calcBtn");
  const result = document.getElementById("initiativeResult");

  function initiativeThreshold(x) {
    return 20 + 10 * x + 5 * (x + (x - 1));
  }

  function calcTurns(init) {
    let x = 1;
    while (init >= initiativeThreshold(x + 1)) x++;
    return x;
  }

  btn.addEventListener("click", () => {
    const value = parseFloat(input.value);
    if (isNaN(value)) {
      result.textContent = "Bitte eine gültige Initiative eingeben.";
      return;
    }
    const turns = calcTurns(value);
    result.innerHTML =
      `Bei einer Initiative von <strong>${value}</strong> darfst du <strong>${turns}</strong> Zug${turns > 1 ? "e" : ""} pro/diese Runde ausführen.`;
  });
});

