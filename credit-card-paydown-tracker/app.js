const SETTINGS_KEY = "ccPaydownTracker.settings";
const ENTRIES_KEY = "ccPaydownTracker.entries";
const PROJECTION_LOOKBACK = 8;
const MAX_PROJECTION_WEEKS = 260; // 5 years safety cap

const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const settingsForm = document.getElementById("settingsForm");
const startBalanceInput = document.getElementById("startBalance");
const startDateInput = document.getElementById("startDate");
const startAprInput = document.getElementById("startApr");

const entryForm = document.getElementById("entryForm");
const entryDateInput = document.getElementById("entryDate");
const entryIncomeInput = document.getElementById("entryIncome");
const entryBillsInput = document.getElementById("entryBills");
const entryExpensesInput = document.getElementById("entryExpenses");
const suggestedPaymentEl = document.getElementById("suggestedPayment");
const entryError = document.getElementById("entryError");

const statsEl = document.getElementById("stats");
const historyBody = document.getElementById("historyBody");
const historyTable = document.getElementById("historyTable");
const historyEmpty = document.getElementById("historyEmpty");

const chartLegend = document.getElementById("chartLegend");
const chartCanvas = document.getElementById("burndownChart");
const chartTooltip = document.getElementById("chartTooltip");
const chartEmpty = document.getElementById("chartEmpty");
const chartCtx = chartCanvas.getContext("2d");

let hoverSeries = [];

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

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatShortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonthYear(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function formatCurrency(n) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function statTile(label, value, tone) {
  const div = document.createElement("div");
  div.className = "stat-tile";
  div.innerHTML = `<div class="label">${label}</div><div class="value ${tone || ""}">${value}</div>`;
  return div;
}

// Computes the enriched weekly series from settings + raw entries.
// Returns null if settings haven't been configured yet.
function computeSeries() {
  const settings = loadSettings();
  if (!settings) return null;

  const weeklyRate = (settings.apr || 0) / 100 / 52;
  let balance = settings.startBalance;

  const points = [{ date: settings.startDate, balance }];
  const entries = sortedEntries().map((e) => {
    const interest = balance * weeklyRate;
    const leftover = e.income - e.bills - e.expenses;
    const payment = Math.max(0, leftover);
    balance = Math.max(0, balance + interest - payment);
    points.push({ date: e.date, balance });
    return { ...e, leftover, payment, interest, balance };
  });

  return { settings, entries, points };
}

function projectFuture(points, entries) {
  if (points.length < 2) return [];
  const lookback = entries.slice(-PROJECTION_LOOKBACK);
  if (!lookback.length) return [];

  const avgReduction =
    lookback.reduce((sum, e) => sum + (e.leftover > 0 ? e.payment - e.interest : -e.interest), 0) / lookback.length;

  if (avgReduction <= 0) return [];

  const last = points[points.length - 1];
  if (last.balance <= 0) return [];

  const projected = [last];
  let balance = last.balance;
  let date = last.date;
  let weeks = 0;
  while (balance > 0 && weeks < MAX_PROJECTION_WEEKS) {
    balance = Math.max(0, balance - avgReduction);
    date = addDays(date, 7);
    weeks += 1;
    projected.push({ date, balance });
  }
  return projected;
}

function renderStats() {
  statsEl.innerHTML = "";
  const series = computeSeries();

  if (!series) {
    statsEl.appendChild(statTile("Card setup", "Not configured", "warn"));
    return;
  }

  const { entries, points } = series;
  const currentBalance = points[points.length - 1].balance;
  const totalPaid = entries.reduce((sum, e) => sum + e.payment, 0);
  const totalInterest = entries.reduce((sum, e) => sum + e.interest, 0);

  statsEl.appendChild(
    statTile("Current balance", formatCurrency(currentBalance), currentBalance <= 0 ? "good" : "bad")
  );
  statsEl.appendChild(statTile("Total paid", formatCurrency(totalPaid)));
  statsEl.appendChild(statTile("Interest accrued", formatCurrency(totalInterest), totalInterest > 0 ? "warn" : ""));

  if (currentBalance <= 0 && entries.length) {
    statsEl.appendChild(statTile("Payoff", "Paid off!", "good"));
  } else {
    const projected = projectFuture(points, entries);
    if (projected.length > 1) {
      const payoffDate = projected[projected.length - 1].date;
      statsEl.appendChild(statTile("Projected payoff", formatMonthYear(payoffDate), "good"));
    } else {
      statsEl.appendChild(statTile("Projected payoff", "Add payments", "warn"));
    }
  }
}

function renderHistory() {
  const series = computeSeries();
  historyBody.innerHTML = "";

  const entries = series ? series.entries : [];

  if (!entries.length) {
    historyEmpty.classList.remove("hidden");
    historyTable.classList.add("hidden");
    return;
  }

  historyEmpty.classList.add("hidden");
  historyTable.classList.remove("hidden");

  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(entry.date)}</td>
        <td>${formatCurrency(entry.income)}</td>
        <td>${formatCurrency(entry.bills)}</td>
        <td>${formatCurrency(entry.expenses)}</td>
        <td>${formatCurrency(entry.payment)}</td>
        <td>${formatCurrency(entry.interest)}</td>
        <td>${formatCurrency(entry.balance)}</td>
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

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function niceMax(value) {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function renderChart() {
  const series = computeSeries();
  hoverSeries = [];
  chartLegend.innerHTML = "";

  if (!series || series.entries.length === 0) {
    chartCanvas.classList.add("hidden");
    chartEmpty.classList.remove("hidden");
    return;
  }

  chartCanvas.classList.remove("hidden");
  chartEmpty.classList.add("hidden");

  const { points, entries } = series;
  const projected = projectFuture(points, entries);

  chartLegend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch solid"></span>Actual</span>
    ${projected.length > 1 ? '<span class="legend-item"><span class="legend-swatch dashed"></span>Projected</span>' : ""}
  `;

  const dpr = window.devicePixelRatio || 1;
  const rect = chartCanvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  chartCanvas.width = width * dpr;
  chartCanvas.height = height * dpr;
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  chartCtx.clearRect(0, 0, width, height);

  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const allPoints = points.concat(projected.slice(1));
  const minTime = new Date(allPoints[0].date + "T00:00:00").getTime();
  const maxTime = new Date(allPoints[allPoints.length - 1].date + "T00:00:00").getTime();
  const timeSpan = Math.max(1, maxTime - minTime);

  const maxBalance = niceMax(Math.max(series.settings.startBalance, ...allPoints.map((p) => p.balance)));

  const xForTime = (t) => padding.left + ((t - minTime) / timeSpan) * plotW;
  const xForDate = (iso) => xForTime(new Date(iso + "T00:00:00").getTime());
  const yForBalance = (b) => padding.top + plotH - (b / maxBalance) * plotH;

  const text = cssVar("--text");
  const muted = cssVar("--muted");
  const border = cssVar("--border");
  const accent = cssVar("--accent");
  const accentRgb = cssVar("--accent-rgb");
  const cardBg = cssVar("--card-bg");

  // Gridlines + y-axis labels
  chartCtx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  chartCtx.fillStyle = muted;
  chartCtx.strokeStyle = border;
  chartCtx.lineWidth = 1;
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const value = (maxBalance / ySteps) * i;
    const y = yForBalance(value);
    chartCtx.beginPath();
    chartCtx.moveTo(padding.left, y);
    chartCtx.lineTo(width - padding.right, y);
    chartCtx.stroke();
    chartCtx.textAlign = "right";
    chartCtx.textBaseline = "middle";
    chartCtx.fillText(formatCurrency(value).replace(".00", ""), padding.left - 8, y);
  }

  // X-axis labels: first point, last actual point, last projected point
  chartCtx.textAlign = "center";
  chartCtx.textBaseline = "top";
  const xLabelY = height - padding.bottom + 8;
  const firstPoint = points[0];
  const lastActual = points[points.length - 1];
  chartCtx.fillText(formatShortDate(firstPoint.date), xForDate(firstPoint.date), xLabelY);
  if (lastActual.date !== firstPoint.date) {
    chartCtx.fillText(formatShortDate(lastActual.date), xForDate(lastActual.date), xLabelY);
  }
  if (projected.length > 1) {
    const lastProjected = projected[projected.length - 1];
    chartCtx.fillText(formatShortDate(lastProjected.date), xForDate(lastProjected.date), xLabelY);
  }

  // Area fill under actual line
  chartCtx.beginPath();
  chartCtx.moveTo(xForDate(points[0].date), yForBalance(0));
  points.forEach((p) => chartCtx.lineTo(xForDate(p.date), yForBalance(p.balance)));
  chartCtx.lineTo(xForDate(points[points.length - 1].date), yForBalance(0));
  chartCtx.closePath();
  chartCtx.fillStyle = `rgba(${accentRgb}, 0.1)`;
  chartCtx.fill();

  // Actual line
  chartCtx.beginPath();
  chartCtx.lineWidth = 2;
  chartCtx.lineJoin = "round";
  chartCtx.lineCap = "round";
  chartCtx.strokeStyle = accent;
  points.forEach((p, i) => {
    const x = xForDate(p.date);
    const y = yForBalance(p.balance);
    if (i === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();

  // Actual markers
  points.forEach((p) => {
    const x = xForDate(p.date);
    const y = yForBalance(p.balance);
    chartCtx.beginPath();
    chartCtx.arc(x, y, 4, 0, Math.PI * 2);
    chartCtx.fillStyle = cardBg;
    chartCtx.fill();
    chartCtx.beginPath();
    chartCtx.arc(x, y, 4, 0, Math.PI * 2);
    chartCtx.fillStyle = accent;
    chartCtx.fill();
    chartCtx.lineWidth = 2;
    chartCtx.strokeStyle = cardBg;
    chartCtx.stroke();
  });

  // Projected dashed line
  if (projected.length > 1) {
    chartCtx.beginPath();
    chartCtx.setLineDash([5, 4]);
    chartCtx.lineWidth = 2;
    chartCtx.strokeStyle = muted;
    projected.forEach((p, i) => {
      const x = xForDate(p.date);
      const y = yForBalance(p.balance);
      if (i === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();
    chartCtx.setLineDash([]);
  }

  // End label: current balance value at end of actual line
  const endX = xForDate(lastActual.date);
  const endY = yForBalance(lastActual.balance);
  chartCtx.textAlign = "left";
  chartCtx.textBaseline = "bottom";
  chartCtx.fillStyle = text;
  chartCtx.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
  const labelX = Math.min(endX + 8, width - padding.right - 60);
  chartCtx.fillText(formatCurrency(lastActual.balance), labelX, endY - 6);

  hoverSeries = allPoints.map((p) => ({ x: xForDate(p.date), date: p.date, balance: p.balance }));
}

function handleChartHover(evt) {
  if (!hoverSeries.length) return;
  const rect = chartCanvas.getBoundingClientRect();
  const x = evt.clientX - rect.left;

  let nearest = hoverSeries[0];
  let nearestDist = Math.abs(nearest.x - x);
  for (const point of hoverSeries) {
    const dist = Math.abs(point.x - x);
    if (dist < nearestDist) {
      nearest = point;
      nearestDist = dist;
    }
  }

  chartTooltip.innerHTML = `<div class="tt-date">${formatDate(nearest.date)}</div><div class="tt-value">${formatCurrency(nearest.balance)}</div>`;
  chartTooltip.style.left = `${nearest.x}px`;
  chartTooltip.style.top = `0px`;
  chartTooltip.classList.remove("hidden");
}

function hideChartTooltip() {
  chartTooltip.classList.add("hidden");
}

function updateSuggestedPayment() {
  const income = Number(entryIncomeInput.value) || 0;
  const bills = Number(entryBillsInput.value) || 0;
  const expenses = Number(entryExpensesInput.value) || 0;
  const leftover = income - bills - expenses;
  const payment = Math.max(0, leftover);

  if (leftover < 0) {
    suggestedPaymentEl.textContent = `Applied to card: $0.00 (short by ${formatCurrency(-leftover)} this week)`;
  } else {
    suggestedPaymentEl.textContent = `Applied to card: ${formatCurrency(payment)}`;
  }
}

function renderAll() {
  renderStats();
  renderHistory();
  renderChart();
}

function fillSettingsForm(settings) {
  if (!settings) return;
  startBalanceInput.value = settings.startBalance;
  startDateInput.value = settings.startDate;
  startAprInput.value = settings.apr;
}

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const settings = {
    startBalance: Number(startBalanceInput.value),
    startDate: startDateInput.value,
    apr: Number(startAprInput.value) || 0,
  };
  saveSettings(settings);
  settingsPanel.classList.add("hidden");
  renderAll();
});

[entryIncomeInput, entryBillsInput, entryExpensesInput].forEach((input) => {
  input.addEventListener("input", updateSuggestedPayment);
});

entryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  entryError.classList.add("hidden");

  if (!loadSettings()) {
    entryError.textContent = "Set up your card settings first.";
    entryError.classList.remove("hidden");
    settingsPanel.classList.remove("hidden");
    return;
  }

  const date = entryDateInput.value;
  const income = Number(entryIncomeInput.value);
  const bills = Number(entryBillsInput.value);
  const expenses = Number(entryExpensesInput.value);

  if (!date || [income, bills, expenses].some((n) => Number.isNaN(n) || n < 0)) {
    entryError.textContent = "Enter a valid date and non-negative amounts.";
    entryError.classList.remove("hidden");
    return;
  }

  const entries = loadEntries();
  entries.push({ id: Date.now(), date, income, bills, expenses });
  saveEntries(entries);

  entryForm.reset();
  entryDateInput.value = todayISO();
  updateSuggestedPayment();
  renderAll();
});

chartCanvas.addEventListener("mousemove", handleChartHover);
chartCanvas.addEventListener("mouseleave", hideChartTooltip);
window.addEventListener("resize", () => renderChart());

function init() {
  entryDateInput.value = todayISO();
  const settings = loadSettings();
  if (settings) {
    fillSettingsForm(settings);
  } else {
    settingsPanel.classList.remove("hidden");
    startDateInput.value = todayISO();
  }
  updateSuggestedPayment();
  renderAll();
}

init();
