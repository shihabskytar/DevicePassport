'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diffSnapshots } = require('../src/diff');
const { warrantyStatus } = require('../src/db');
const { reportHtml } = require('../src/report');

const comp = (category, name, model, serial, firmware) => ({ category, name, model, serial, firmware });
const snap = (id, label, taken_at, components) => ({ id, label, taken_at, payload: { components } });

test('diff: SSD replacement produces a human-readable sentence', () => {
  const before = snap(1, 'Original', '2026-03-01T00:00:00Z', [comp('SSD/HDD', 'Disk A', 'Model X', 'S1', '1.0')]);
  // Same category+name key, different model/firmware => changed, not added.
  const after = snap(2, 'After repair', '2026-03-15T00:00:00Z', [comp('SSD/HDD', 'Disk A', 'Model Y', 'S2', '2.0')]);
  const d = diffSnapshots(before, after);
  assert.equal(d.changes.length, 1);
  assert.equal(d.changes[0].type, 'changed');
  assert.match(d.summary, /SSD\/HDD was replaced in March 2026/);
  assert.match(d.summary, /model and serial and firmware differ/);
});

test('diff: added and removed components are reported, no change is clean', () => {
  // Different categories = different positions, so these are truly added/removed.
  const before = snap(1, 'A', '2026-01-01T00:00:00Z', [comp('GPU', 'Old GPU', 'M1', 'unknown', 'unknown')]);
  const after = snap(2, 'B', '2026-02-01T00:00:00Z', [comp('Battery', 'Battery', 'M2', 'unknown', 'unknown')]);
  const d = diffSnapshots(before, after);
  assert.equal(d.changes.filter((c) => c.type === 'added').length, 1);
  assert.equal(d.changes.filter((c) => c.type === 'removed').length, 1);
  const same = diffSnapshots(before, before);
  assert.equal(same.changes.length, 0);
  assert.match(same.summary, /No component changes/);
});

test('diff: two same-named disks are not falsely reported as changed', () => {
  const disks = [
    comp('SSD/HDD', 'unknown', 'HD', 'unknown', 'unknown'),
    comp('SSD/HDD', 'unknown', 'SSD', 'unknown', 'unknown'),
  ];
  const d = diffSnapshots(
    snap(1, 'A', '2026-01-01T00:00:00Z', disks),
    snap(2, 'B', '2026-02-01T00:00:00Z', disks.map((c) => ({ ...c }))),
  );
  assert.equal(d.changes.length, 0);
});

test('warranty status: active, expiring soon, expired', () => {
  const far = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  assert.equal(warrantyStatus({ end_date: far }), 'active');
  assert.equal(warrantyStatus({ end_date: soon }), 'expiring soon');
  assert.equal(warrantyStatus({ end_date: past }), 'expired');
  assert.equal(warrantyStatus({ end_date: '' }), 'unknown');
});

test('report HTML escapes input and includes all MVP sections', () => {
  const html = reportHtml({
    device: { name: 'Test <PC>' },
    hardware: null,
    components: [{ category: 'SSD/HDD', name: 'Disk', model: 'M', serial: 'S', firmware: 'F' }],
    drivers: [], repairs: [{ date: '2026-01-01', title: 'Fan fix', description: '', provider: 'Shop', cost: '$10' }],
    warranties: [{ component: 'Disk', provider: 'P', start_date: '', end_date: '2030-01-01', notes: '' }],
    snapshots: [{ label: 'S1', taken_at: '2026-01-01' }],
  });
  assert.match(html, /Test &lt;PC&gt;/);
  assert.doesNotMatch(html, /Test <PC>/);
  for (const section of ['Component inventory', 'Driver inventory', 'Repair log', 'Warranties', 'Health snapshots']) {
    assert.ok(html.includes(section), `missing ${section}`);
  }
});
