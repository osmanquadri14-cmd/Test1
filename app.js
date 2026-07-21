const SETTINGS_KEY = "leaseMileageTracker.settings";
const ENTRIES_KEY = "leaseMileageTracker.entries";

const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const settingsForm = document.getElementById("settingsForm");
const leaseStartInput = document.getElementById("leaseStart");
const leaseEndInput = document.getElementById("leaseEnd");
const leaseStartMilesInput = document.getElementById("leaseStartMiles");
const leaseAllowanceInput = document.getElementById("leaseAllowance");

const entryForm = document.getElementById("entryForm");
const entryDateInput = document.getElementById("entryDate");
const entryMilesInput = document.getElementById("entryMiles");
const entryNoteInput = document.getElementById("entryNote");
const entryError = document.getElementById("entryError");

const statsEl = document.getElementById("stats");
const historyBody = document.getElementById("historyBody");
const historyTable = document.getElementById("historyTable");
const historyEmpty = document.getElementById("historyEmpty");

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadEntries() {
  const raw = localStorage.getItem(ENTRIES_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

function sortedEntries() {
  return loadEntries()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(dateB) - new Date(dateA)) / msPerDay);
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statTile(label, value, tone) {
  const div = document.createElement("div");
  div.className = "stat-tile";
  div.innerHTML = `<div class="label">${label}</div><div class="value ${tone || ""}">${value}</div>`;
  return div;
}

function renderStats() {
  statsEl.innerHTML = "";
  const settings = loadSettings();
  const entries = sortedEntries();

  if (!settings) {
    statsEl.appendChild(statTile("Lease setup", "Not configured", "warn"));
    return;
  }

  const latest = entries.length ? entries[entries.length - 1] : null;
  const currentMiles = latest ? latest.miles : settings.startMiles;
  const milesDriven = Math.max(0, currentMiles - settings.startMiles);
  const milesRemaining = settings.allowance - milesDriven;

  const totalLeaseDays = Math.max(1, daysBetween(settings.startDate, settings.endDate));
  const today = todayISO();
  const daysElapsed = Math.min(totalLeaseDays, Math.max(0, daysBetween(settings.startDate, today)));
  const daysRemaining = Math.max(0, daysBetween(today, settings.endDate));

  const allowedPace = settings.allowance / totalLeaseDays;
  const currentPace = daysElapsed > 0 ? milesDriven / daysElapsed : 0;
  const projectedTotal = currentPace * totalLeaseDays;
  const projectedDiff = settings.allowance - projectedTotal;

  statsEl.appendChild(statTile("Miles driven", milesDriven.toLocaleString()));
  statsEl.appendChild(
    statTile(
      "Miles remaining",
      milesRemaining.toLocaleString(),
      milesRemaining < 0 ? "bad" : milesRemaining < settings.allowance * 0.1 ? "warn" : "good"
    )
  );
  statsEl.appendChild(statTile("Days remaining", daysRemaining.toLocaleString()));
  statsEl.appendChild(statTile("Allowed pace", `${allowedPace.toFixed(1)} mi/day`));
  statsEl.appendChild(statTile("Current pace", `${currentPace.toFixed(1)} mi/day`));
  statsEl.appendChild(
    statTile(
      "Projected end total",
      `${Math.round(projectedTotal).toLocaleString()} mi`,
      projectedDiff < 0 ? "bad" : projectedDiff < settings.allowance * 0.05 ? "warn" : "good"
    )
  );
}

function renderHistory() {
  const entries = sortedEntries();
  historyBody.innerHTML = "";

  if (!entries.length) {
    historyEmpty.classList.remove("hidden");
    historyTable.classList.add("hidden");
    return;
  }

  historyEmpty.classList.add("hidden");
  historyTable.classList.remove("hidden");

  const display = entries.slice().reverse();
  display.forEach((entry, idx) => {
    const chronoIndex = entries.length - 1 - idx;
    const prev = chronoIndex > 0 ? entries[chronoIndex - 1] : null;
    const delta = prev ? entry.miles - prev.miles : "–";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(entry.date)}</td>
      <td>${entry.miles.toLocaleString()}</td>
      <td>${typeof delta === "number" ? delta.toLocaleString() : delta}</td>
      <td>${entry.note ? escapeHtml(entry.note) : ""}</td>
      <td><button class="delete-btn" data-id="${entry.id}">Delete</button></td>
    `;
    historyBody.appendChild(tr);
  });

  historyBody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const remaining = loadEntries().filter((e) => e.id !== id);
      saveEntries(remaining);
      renderAll();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderStats();
  renderHistory();
}

function fillSettingsForm(settings) {
  if (!settings) return;
  leaseStartInput.value = settings.startDate;
  leaseEndInput.value = settings.endDate;
  leaseStartMilesInput.value = settings.startMiles;
  leaseAllowanceInput.value = settings.allowance;
}

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const settings = {
    startDate: leaseStartInput.value,
    endDate: leaseEndInput.value,
    startMiles: Number(leaseStartMilesInput.value),
    allowance: Number(leaseAllowanceInput.value),
  };
  saveSettings(settings);
  settingsPanel.classList.add("hidden");
  renderAll();
});

entryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  entryError.classList.add("hidden");

  const date = entryDateInput.value;
  const miles = Number(entryMilesInput.value);
  const note = entryNoteInput.value.trim();

  if (!date || Number.isNaN(miles) || miles < 0) {
    entryError.textContent = "Enter a valid date and a non-negative odometer reading.";
    entryError.classList.remove("hidden");
    return;
  }

  const entries = loadEntries();
  entries.push({ id: Date.now(), date, miles, note });
  saveEntries(entries);

  entryForm.reset();
  entryDateInput.value = todayISO();
  renderAll();
});

function init() {
  entryDateInput.value = todayISO();
  const settings = loadSettings();
  if (settings) {
    fillSettingsForm(settings);
  } else {
    settingsPanel.classList.remove("hidden");
  }
  renderAll();
}

init();
