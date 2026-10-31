'use strict';
// Snapshot change comparison — the differentiating feature.
// A snapshot is a list of components. The diff reports added, removed and
// changed components, plus one human-readable sentence per change, in the
// style: "Your SSD was replaced in March. Its current model and firmware
// differ from your original hardware."
function keyOf(c) {
  return `${c.category}::${c.name}`;
}
// Stable per-snapshot keys: category + occurrence index within that
// category. Name alone is NOT a key — real machines often have several
// components with the same reported name (e.g. two disks both reported as
// "unknown"), and a name-only key would falsely report them as changed
// when their order or map overwrite differs. Position within a category
// keeps disk #1 distinct from disk #2, while a model/firmware change in
// the same position is still reported as a replacement.
function mapByPosition(list) {
  const counts = {};
  const map = new Map();
  for (const c of list) {
    const n = (counts[c.category] = (counts[c.category] || 0) + 1);
    map.set(`${c.category}::${n}`, c);
  }
  return map;
}
function listWithKeys(list) {
  const counts = {};
  return list.map((c) => {
    const n = (counts[c.category] = (counts[c.category] || 0) + 1);
    return { key: `${c.category}::${n}`, component: c };
  });
}
function monthYear(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch { return 'unknown date'; }
}
function sentenceFor(change) {
  const when = change.when ? ` in ${monthYear(change.when)}` : '';
  if (change.type === 'added') {
    return `A new ${change.after.category} was added${when}: ${change.after.name}.`;
  }
  if (change.type === 'removed') {
    return `A ${change.before.category} was removed${when}: ${change.before.name}.`;
  }
  const diffs = [];
  if (change.before.model !== change.after.model) diffs.push('model');
  if (change.before.serial !== change.after.serial) diffs.push('serial');
  if (change.before.firmware !== change.after.firmware) diffs.push('firmware');
  if (change.before.name !== change.after.name) diffs.push('name');
  const what = diffs.length ? diffs.join(' and ') : 'details';
  return `Your ${change.before.category} was replaced${when}. Its current ${what} differ${diffs.length === 1 ? 's' : ''} from your original hardware.`;
}
function diffSnapshots(before, after) {
  const beforeList = before.payload.components || [];
  const afterList = after.payload.components || [];
  const beforeMap = mapByPosition(beforeList);
  const afterMap = mapByPosition(afterList);
  const changes = [];
  for (const { key, component: c } of listWithKeys(afterList)) {
    const old = beforeMap.get(key);
    if (!old) {
      const ch = { type: 'added', before: null, after: c, when: after.taken_at };
      ch.sentence = sentenceFor(ch);
      changes.push(ch);
    } else if (old.model !== c.model || old.serial !== c.serial || old.firmware !== c.firmware || old.name !== c.name) {
      const ch = { type: 'changed', before: old, after: c, when: after.taken_at };
      ch.sentence = sentenceFor(ch);
      changes.push(ch);
    }
  }
  for (const { key, component: c } of listWithKeys(beforeList)) {
    if (!afterMap.has(key)) {
      const ch = { type: 'removed', before: c, after: null, when: after.taken_at };
      ch.sentence = sentenceFor(ch);
      changes.push(ch);
    }
  }
  return {
    before: { id: before.id, label: before.label, taken_at: before.taken_at },
    after: { id: after.id, label: after.label, taken_at: after.taken_at },
    changes,
    summary: changes.length
      ? changes.map((c) => c.sentence).join(' ')
      : 'No component changes between these snapshots.',
  };
}
module.exports = { diffSnapshots, sentenceFor, keyOf };
