'use strict';
// HTML device report. The report page ships with a print stylesheet so the
// user prints it to PDF from any browser (File > Print > Save as PDF), and
// the same HTML is served from /api/report for Electron's printToPDF later.
// No third-party PDF library is needed for the MVP.
const { warrantyStatus } = require('./db');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function reportHtml({ device, hardware, components, drivers, repairs, warranties, snapshots }) {
  const compRows = components.map((c) => `<tr><td>${esc(c.category)}</td><td>${esc(c.name)}</td><td>${esc(c.model)}</td><td>${esc(c.serial)}</td><td>${esc(c.firmware)}</td></tr>`).join('');
  const driverRows = drivers.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.version)}</td><td>${esc(d.provider)}</td><td>${esc(d.device_name)}</td></tr>`).join('');
  const repairRows = repairs.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.title)}</td><td>${esc(r.description)}</td><td>${esc(r.provider)}</td><td>${esc(r.cost)}</td></tr>`).join('');
  const warrantyRows = warranties.map((w) => `<tr><td>${esc(w.component)}</td><td>${esc(w.provider)}</td><td>${esc(w.start_date)}</td><td>${esc(w.end_date)}</td><td>${esc(warrantyStatus(w))}</td></tr>`).join('');
  const snapRows = snapshots.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.taken_at)}</td></tr>`).join('');
  const hw = hardware ? `<p>OS: ${esc(hardware.os.distro)} ${esc(hardware.os.release)} (${esc(hardware.os.arch)})<br>CPU: ${esc(hardware.cpu.brand)}<br>Memory: ${Math.round((hardware.memoryBytes || 0) / 1073741824)} GB<br>Scanned: ${esc(hardware.scannedAt)}</p>` : '<p>No live scan yet.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>DevicePassport report — ${esc(device.name)}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:900px;margin:2rem auto;padding:0 1rem}
h1{font-size:1.6rem} h2{margin-top:2rem;border-bottom:2px solid #111;padding-bottom:.25rem}
table{width:100%;border-collapse:collapse;font-size:.9rem} th,td{border:1px solid #ccc;padding:.4rem;text-align:left}
@media print{body{margin:0;max-width:none} .no-print{display:none}}
</style></head><body>
<h1>DevicePassport — ${esc(device.name)}</h1>
<p>Generated ${new Date().toISOString()} — all data is stored locally on this computer.</p>
<button class="no-print" onclick="window.print()">Print / Save as PDF</button>
<h2>Hardware identification</h2>${hw}
<h2>Component inventory</h2><table><tr><th>Category</th><th>Name</th><th>Model</th><th>Serial</th><th>Firmware</th></tr>${compRows || '<tr><td colspan="5">No components recorded.</td></tr>'}</table>
<h2>Driver inventory</h2><table><tr><th>Name</th><th>Version</th><th>Provider</th><th>Device</th></tr>${driverRows || '<tr><td colspan="4">No drivers recorded.</td></tr>'}</table>
<h2>Repair log</h2><table><tr><th>Date</th><th>Title</th><th>Description</th><th>Provider</th><th>Cost</th></tr>${repairRows || '<tr><td colspan="5">No repairs recorded.</td></tr>'}</table>
<h2>Warranties</h2><table><tr><th>Component</th><th>Provider</th><th>Start</th><th>End</th><th>Status</th></tr>${warrantyRows || '<tr><td colspan="5">No warranties recorded.</td></tr>'}</table>
<h2>Health snapshots</h2><table><tr><th>Label</th><th>Taken</th></tr>${snapRows || '<tr><td colspan="2">No snapshots yet.</td></tr>'}</table>
</body></html>`;
}
module.exports = { reportHtml, esc };
