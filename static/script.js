const form = document.getElementById("audit-form");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const resultPanel = document.getElementById("result-panel");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function riskClass(level) {
  return String(level || "").toLowerCase().replace(/\s+/g, "-");
}
function showStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}
function renderResult(data) {
  const r = data.result;
  document.getElementById("result-total").textContent = `${r.total_score} / 15`;
  document.getElementById("result-level").textContent = r.risk_level;
  document.getElementById("result-level").className = `risk risk-${riskClass(r.risk_level)}`;
  document.getElementById("result-id").textContent = `#${data.id}`;
  document.getElementById("result-summary-text").textContent = r.summary;
  document.getElementById("score-total").textContent = `${r.total_score} / 15`;
  document.getElementById("score-level").textContent = r.risk_level;
  const criteria = document.getElementById("criteria-results");
  criteria.innerHTML = r.criteria.map(item => `
    <article class="result-item">
      <div class="result-title"><h3>${escapeHtml(item.label)}</h3><span class="score-pill">${item.score} / 3</span></div>
      <p><span class="finding-label">Finding: </span>${escapeHtml(item.finding)}</p>
      <p><span class="finding-label">Mitigation: </span>${escapeHtml(item.mitigation)}</p>
    </article>`).join("");
  document.getElementById("mitigations").innerHTML = r.overall_mitigation.map(x => `<li>${escapeHtml(x)}</li>`).join("");
  resultPanel.classList.remove("hidden");
  resultPanel.scrollIntoView({behavior:"smooth", block:"start"});
}
async function loadHistory() {
  const body = document.getElementById("history-body");
  body.innerHTML = '<tr><td colspan="7">Loading records…</td></tr>';
  try {
    const response = await fetch("/api/history");
    const rows = await response.json();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7">No audits saved yet. Complete an audit to create your first record.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(row => `
      <tr>
        <td>${row.id}</td><td>${escapeHtml(row.scenario)}</td>
        <td>${row.total_score}/15</td>
        <td class="risk risk-${riskClass(row.risk_level)}">${escapeHtml(row.risk_level)}</td>
        <td>${escapeHtml(row.model_name)}</td>
        <td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td>
        <td><button class="view-btn" data-id="${row.id}">View</button></td>
      </tr>`).join("");
  } catch (err) {
    body.innerHTML = '<tr><td colspan="7">Could not load audit history.</td></tr>';
  }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = "Auditing… please wait";
  showStatus("Sending the response for AI-assisted analysis. This may take a few seconds.");
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Audit failed.");
    renderResult(data);
    showStatus("Audit completed and saved.", "success");
    await loadHistory();
  } catch (err) {
    showStatus(err.message || "Could not complete audit. Check the server console.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Run AI audit <span aria-hidden="true">→</span>';
  }
});
document.getElementById("refresh-btn").addEventListener("click", loadHistory);
document.getElementById("history-body").addEventListener("click", async event => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  try {
    const response = await fetch(`/api/audit/${button.dataset.id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load record.");
    renderResult(data);
  } catch (err) {
    showStatus(err.message, "error");
  }
});
loadHistory();
