'use strict';
// DevicePassport local server: serves the UI and a small JSON API.
// Everything runs on localhost; there is no cloud sync and no telemetry.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, ensureDevice, rows, row, parseDetails, warrantyStatus } = require('./db');
const { scanHardware } = require('./hardware');
const { diffSnapshots } = require('./diff');
const { reportHtml } = require('./report');

const PORT = Number(process.env.PORT || 4173);
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

const db = openDb();
const device = ensureDevice(db);

function send(res, status, obj, type = 'application/json') {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}
function snapshotPayload() {
  const comps = rows(db, 'SELECT * FROM components WHERE device_id = ? ORDER BY id', [device.id]).map(parseDetails);
  return { components: comps };
}
function context() {
  return {
    device,
    components: rows(db, 'SELECT * FROM components WHERE device_id = ? ORDER BY id', [device.id]).map(parseDetails),
    drivers: rows(db, 'SELECT * FROM drivers WHERE device_id = ? ORDER BY id', [device.id]),
    repairs: rows(db, 'SELECT * FROM repairs WHERE device_id = ? ORDER BY date DESC, id DESC', [device.id]),
    warranties: rows(db, 'SELECT * FROM warranties WHERE device_id = ? ORDER BY end_date', [device.id]).map((w) => ({ ...w, status: warrantyStatus(w) })),
    snapshots: rows(db, 'SELECT id, device_id, label, taken_at FROM snapshots WHERE device_id = ? ORDER BY id DESC', [device.id]),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (p === '/' || p === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'), 'text/html');
    }
    if (p.startsWith('/public/')) {
      const file = path.join(PUBLIC, path.basename(p));
      if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'text/plain');
    }
    if (p === '/api/overview') return send(res, 200, context());
    if (p === '/api/hardware') {
      const hw = await scanHardware();
      return send(res, 200, hw);
    }
    if (p === '/api/hardware/import' && req.method === 'POST') {
      const hw = await scanHardware();
      db.prepare('DELETE FROM components WHERE device_id = ?').run(device.id);
      db.prepare('DELETE FROM drivers WHERE device_id = ?').run(device.id);
      const insC = db.prepare('INSERT INTO components (device_id, category, name, model, serial, firmware, details) VALUES (?,?,?,?,?,?,?)');
      for (const c of hw.components) insC.run(device.id, c.category, c.name, c.model, c.serial, c.firmware, JSON.stringify(c.details || {}));
      const insD = db.prepare('INSERT INTO drivers (device_id, name, version, provider, device_name) VALUES (?,?,?,?,?)');
      for (const d of hw.drivers) insD.run(device.id, d.name, d.version, d.provider, d.device_name);
      return send(res, 200, { imported: { components: hw.components.length, drivers: hw.drivers.length }, hardware: hw });
    }
    if (p === '/api/components' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.category || !b.name) return send(res, 400, { error: 'category and name are required' });
      const r = db.prepare('INSERT INTO components (device_id, category, name, model, serial, firmware, details) VALUES (?,?,?,?,?,?,?)')
        .run(device.id, b.category, b.name, b.model || 'unknown', b.serial || 'unknown', b.firmware || 'unknown', JSON.stringify(b.details || {}));
      return send(res, 201, row(db, 'SELECT * FROM components WHERE id = ?', [r.lastInsertRowid]));
    }
    if (p === '/api/components' && req.method === 'GET') return send(res, 200, context().components);
    if (p === '/api/drivers' && req.method === 'GET') return send(res, 200, context().drivers);
    if (p === '/api/repairs' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.date || !b.title) return send(res, 400, { error: 'date and title are required' });
      const r = db.prepare('INSERT INTO repairs (device_id, date, title, description, cost, provider) VALUES (?,?,?,?,?,?)')
        .run(device.id, b.date, b.title, b.description || '', b.cost || '', b.provider || '');
      return send(res, 201, row(db, 'SELECT * FROM repairs WHERE id = ?', [r.lastInsertRowid]));
    }
    if (p === '/api/warranties' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.component || !b.end_date) return send(res, 400, { error: 'component and end_date are required' });
      const r = db.prepare('INSERT INTO warranties (device_id, component, provider, start_date, end_date, notes) VALUES (?,?,?,?,?,?)')
        .run(device.id, b.component, b.provider || '', b.start_date || '', b.end_date, b.notes || '');
      return send(res, 201, row(db, 'SELECT * FROM warranties WHERE id = ?', [r.lastInsertRowid]));
    }
    if (p === '/api/snapshots' && req.method === 'POST') {
      const b = await readBody(req);
      const payload = snapshotPayload();
      const r = db.prepare('INSERT INTO snapshots (device_id, label, payload) VALUES (?,?,?)')
        .run(device.id, b.label || `Snapshot ${new Date().toISOString()}`, JSON.stringify(payload));
      return send(res, 201, { id: r.lastInsertRowid, label: b.label, componentCount: payload.components.length });
    }
    if (p === '/api/snapshots' && req.method === 'GET') return send(res, 200, context().snapshots);
    if (p === '/api/diff') {
      const a = row(db, 'SELECT * FROM snapshots WHERE id = ?', [url.searchParams.get('before')]);
      const b2 = row(db, 'SELECT * FROM snapshots WHERE id = ?', [url.searchParams.get('after')]);
      if (!a || !b2) return send(res, 400, { error: 'both before and after snapshot ids are required and must exist' });
      return send(res, 200, diffSnapshots({ ...a, payload: JSON.parse(a.payload) }, { ...b2, payload: JSON.parse(b2.payload) }));
    }
    if (p === '/api/report') {
      const ctx = context();
      return send(res, 200, reportHtml({ ...ctx, hardware: null }), 'text/html');
    }
    return send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: String(err.message || err) });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`DevicePassport running at http://localhost:${PORT}`));
}
module.exports = { server, PORT };
