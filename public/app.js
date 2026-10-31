'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, opts) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}
function fillTable(sel, rows, cols) {
  document.querySelector(sel + ' tbody').innerHTML = rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9">Nothing recorded yet.</td></tr>';
}
async function load() {
  const d = await api('/api/overview');
  document.getElementById('overviewCards').innerHTML = `
    <div class="card"><h3>Components</h3><p>${d.components.length} recorded</p></div>
    <div class="card"><h3>Drivers</h3><p>${d.drivers.length} recorded</p></div>
    <div class="card"><h3>Repairs</h3><p>${d.repairs.length} recorded</p></div>
    <div class="card"><h3>Warranties</h3><p>${d.warranties.filter((w) => w.status === 'active').length} active · ${d.warranties.filter((w) => w.status === 'expiring soon').length} expiring soon · ${d.warranties.filter((w) => w.status === 'expired').length} expired</p></div>
    <div class="card"><h3>Snapshots</h3><p>${d.snapshots.length} health snapshots</p></div>`;
  fillTable('#componentsTable', d.components, ['category', 'name', 'model', 'serial', 'firmware']);
  fillTable('#driversTable', d.drivers, ['name', 'version', 'provider', 'device_name']);
  fillTable('#repairsTable', d.repairs, ['date', 'title', 'provider', 'cost', 'description']);
  fillTable('#warrantiesTable', d.warranties, ['component', 'provider', 'start_date', 'end_date', 'status']);
  fillTable('#snapshotsTable', d.snapshots, ['id', 'label', 'taken_at']);
  const opts = d.snapshots.map((s) => `<option value="${s.id}">${esc(s.label)} (#${s.id})</option>`).join('');
  document.getElementById('diffBefore').innerHTML = opts;
  document.getElementById('diffAfter').innerHTML = opts;
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('tab-' + b.dataset.tab).classList.add('active');
}));
async function scan() {
  const el = document.getElementById('scanResult');
  el.innerHTML = '<p>Scanning…</p>';
  const hw = await api('/api/hardware');
  el.innerHTML = `<h3>Live scan — ${esc(hw.os.distro)} ${esc(hw.os.release)}</h3>
    <p>CPU: ${esc(hw.cpu.brand)} (${hw.cpu.cores} cores) · Memory: ${Math.round(hw.memoryBytes / 1073741824)} GB · Platform: ${esc(hw.platform)}</p>
    <p>Components found: ${hw.components.length} · Drivers found: ${hw.drivers.length}</p>
    <ul>${hw.components.map((c) => `<li>${esc(c.category)}: ${esc(c.name)} — model ${esc(c.model)}, serial ${esc(c.serial)}, firmware ${esc(c.firmware)}</li>`).join('')}</ul>`;
}
async function takeSnapshot(label) {
  await api('/api/snapshots', { method: 'POST', body: JSON.stringify({ label: label || undefined }) });
  await load();
}
document.getElementById('scanBtn').addEventListener('click', scan);
document.getElementById('importBtn').addEventListener('click', async () => { await api('/api/hardware/import', { method: 'POST' }); await load(); alert('Scan imported into inventory.'); });
document.getElementById('snapshotBtn').addEventListener('click', () => takeSnapshot());
document.getElementById('snapshotBtn2').addEventListener('click', () => takeSnapshot(document.getElementById('snapshotLabel').value));
document.getElementById('diffBtn').addEventListener('click', async () => {
  const before = document.getElementById('diffBefore').value;
  const after = document.getElementById('diffAfter').value;
  const d = await api(`/api/diff?before=${before}&after=${after}`);
  document.getElementById('diffResult').innerHTML = `<h3>What changed</h3><p>${esc(d.summary)}</p><ul>${d.changes.map((c) => `<li><strong>${esc(c.type)}</strong>: ${esc(c.sentence)}</li>`).join('')}</ul>`;
});
function bindForm(id, path) {
  document.getElementById(id).addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    await api(path, { method: 'POST', body: JSON.stringify(data) });
    e.target.reset(); await load();
  });
}
bindForm('componentForm', '/api/components');
bindForm('repairForm', '/api/repairs');
bindForm('warrantyForm', '/api/warranties');
load().catch((e) => { document.getElementById('scanResult').innerHTML = `<p>Failed to load: ${esc(e.message)}</p>`; });
