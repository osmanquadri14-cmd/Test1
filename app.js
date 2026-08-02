const SETTINGS_KEY = "leaseMileageTracker.settings";
const ENTRIES_KEY = "leaseMileageTracker.entries";
const PURCHASES_KEY = "leaseMileageTracker.purchases";
const PURCHASE_MILES = 1000;
const PURCHASE_COST = 250;

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

const buyMilesBtn = document.getElementById("buyMilesBtn");
const purchasesBody = document.getElementById("purchasesBody");
const purchasesTable = document.getElementById("purchasesTable");
const purchasesEmpty = document.getElementById("purchasesEmpty");

const googleSignInBtn = document.getElementById("googleSignInBtn");
const syncStatusEl = document.getElementById("syncStatus");

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  scheduleDriveSync();
}

function loadEntries() {
  const raw = localStorage.getItem(ENTRIES_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEntries(entries) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  scheduleDriveSync();
}

function sortedEntries() {
  return loadEntries()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

function loadPurchases() {
  const raw = localStorage.getItem(PURCHASES_KEY);
  return raw ? JSON.parse(raw) : [];
}

function savePurchases(purchases) {
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases));
  scheduleDriveSync();
}

function totalPurchasedMiles() {
  return loadPurchases().reduce((sum, p) => sum + p.miles, 0);
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
  const effectiveAllowance = settings.allowance + totalPurchasedMiles();
  const milesRemaining = effectiveAllowance - milesDriven;

  const totalLeaseDays = Math.max(1, daysBetween(settings.startDate, settings.endDate));
  const today = todayISO();
  const daysElapsed = Math.min(totalLeaseDays, Math.max(0, daysBetween(settings.startDate, today)));
  const daysRemaining = Math.max(0, daysBetween(today, settings.endDate));

  const currentPace = daysElapsed > 0 ? milesDriven / daysElapsed : 0;
  const projectedTotal = currentPace * totalLeaseDays;
  const projectedDiff = effectiveAllowance - projectedTotal;

  statsEl.appendChild(statTile("Miles driven", milesDriven.toLocaleString()));
  statsEl.appendChild(
    statTile(
      "Miles remaining",
      milesRemaining.toLocaleString(),
      milesRemaining < 0 ? "bad" : milesRemaining < effectiveAllowance * 0.1 ? "warn" : "good"
    )
  );
  statsEl.appendChild(statTile("Days remaining", daysRemaining.toLocaleString()));
  statsEl.appendChild(
    statTile(
      "Projected end total",
      `${Math.round(projectedTotal).toLocaleString()} mi`,
      projectedDiff < 0 ? "bad" : projectedDiff < effectiveAllowance * 0.05 ? "warn" : "good"
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

function renderPurchases() {
  const purchases = loadPurchases();
  purchasesBody.innerHTML = "";

  if (!purchases.length) {
    purchasesEmpty.classList.remove("hidden");
    purchasesTable.classList.add("hidden");
    return;
  }

  purchasesEmpty.classList.add("hidden");
  purchasesTable.classList.remove("hidden");

  purchases
    .slice()
    .reverse()
    .forEach((purchase) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(purchase.date)}</td>
        <td>${purchase.miles.toLocaleString()}</td>
        <td>$${purchase.cost.toLocaleString()}</td>
        <td><button class="delete-btn" data-id="${purchase.id}">Undo</button></td>
      `;
      purchasesBody.appendChild(tr);
    });

  purchasesBody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const remaining = loadPurchases().filter((p) => p.id !== id);
      savePurchases(remaining);
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
  renderPurchases();
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

buyMilesBtn.addEventListener("click", () => {
  const purchases = loadPurchases();
  purchases.push({ id: Date.now(), date: todayISO(), miles: PURCHASE_MILES, cost: PURCHASE_COST });
  savePurchases(purchases);
  renderAll();
});

// --- Google Drive sync ---
// Fill in your own OAuth Client ID from Google Cloud Console (see setup steps
// in the project README). Files are stored with the narrow "drive.file"
// scope, so this app can only see files it creates itself.
const GOOGLE_CLIENT_ID = "11908733287-cm8pgih380qlm2lahepntsdsmcpd964t.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME = "lease-mileage-tracker-data.json";

let driveAccessToken = null;
let driveFileId = null;
let driveTokenClient = null;
let driveSyncTimer = null;

function setSyncStatus(text) {
  syncStatusEl.textContent = text;
}

function isGoogleConfigured() {
  return !GOOGLE_CLIENT_ID.startsWith("YOUR_");
}

function initGoogleAuth(attempt) {
  attempt = attempt || 0;
  if (!isGoogleConfigured()) return;
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    if (attempt >= 50) {
      setSyncStatus("Google sign-in unavailable (script blocked?)");
      googleSignInBtn.disabled = true;
      return;
    }
    setTimeout(() => initGoogleAuth(attempt + 1), 200);
    return;
  }
  driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: async (response) => {
      if (response.error) {
        setSyncStatus("Google sign-in failed");
        return;
      }
      driveAccessToken = response.access_token;
      googleSignInBtn.textContent = "Sign out";
      setSyncStatus("Syncing…");
      try {
        await loadFromDrive();
        setSyncStatus("Synced with Google Drive");
      } catch (err) {
        setSyncStatus("Drive sync failed — will retry");
      }
    },
  });
}

async function driveFetch(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options && options.headers), Authorization: `Bearer ${driveAccessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error ${res.status}`);
  return res;
}

async function findDriveFile() {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  return data.files && data.files.length ? data.files[0].id : null;
}

async function loadFromDrive() {
  driveFileId = await findDriveFile();
  if (!driveFileId) {
    await pushToDrive();
    return;
  }
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`);
  const remote = await res.json();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(remote.settings || null));
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(remote.entries || []));
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(remote.purchases || []));
  fillSettingsForm(loadSettings());
  renderAll();
}

async function pushToDrive() {
  if (!driveAccessToken) return;
  const body = JSON.stringify({
    settings: loadSettings(),
    entries: loadEntries(),
    purchases: loadPurchases(),
  });

  if (driveFileId) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } else {
    const metadata = { name: DRIVE_FILE_NAME, mimeType: "application/json" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([body], { type: "application/json" }));
    const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    driveFileId = data.id;
  }
  setSyncStatus("Synced with Google Drive");
}

function scheduleDriveSync() {
  if (!driveAccessToken) return;
  clearTimeout(driveSyncTimer);
  driveSyncTimer = setTimeout(() => {
    pushToDrive().catch(() => setSyncStatus("Drive sync failed — will retry"));
  }, 800);
}

googleSignInBtn.addEventListener("click", () => {
  if (!isGoogleConfigured()) {
    alert("Google sign-in isn't set up yet — add a GOOGLE_CLIENT_ID in app.js first.");
    return;
  }
  if (driveAccessToken) {
    google.accounts.oauth2.revoke(driveAccessToken, () => {});
    driveAccessToken = null;
    driveFileId = null;
    googleSignInBtn.textContent = "Sign in with Google";
    setSyncStatus("Not signed in (local only)");
    return;
  }
  driveTokenClient.requestAccessToken({ prompt: "consent" });
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

  if (isGoogleConfigured()) {
    initGoogleAuth();
  } else {
    googleSignInBtn.disabled = true;
    setSyncStatus("Google sync not set up");
  }
}

init();
