'use strict';
// Cross-platform hardware identification.
// Uses the systeminformation package (pure JS, works on Windows, Linux,
// macOS) plus best-effort OS commands for drivers. Nothing here invents
// data: anything not reported by the OS is returned as "unknown".
const si = require('systeminformation');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const unknown = (v) => (v === undefined || v === null || v === '' ? 'unknown' : v);

async function safe(promise, fallback) {
  try { return await promise; } catch { return fallback; }
}

async function commandLines(cmd, args) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 15000, windowsHide: true });
    return stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

// Best-effort driver inventory. Windows: driverquery via WMI-style output
// is slow, so we report graphics + audio controllers from systeminformation
// plus, on Windows, the first lines of `driverquery /FO CSV` when available.
// Linux: lspci -k (kernel drivers). macOS: system_profiler extensions.
// Every path degrades to "unknown" rather than crashing.
async function collectDrivers() {
  const drivers = [];
  const [graphics, audio] = await Promise.all([
    safe(si.graphics(), { controllers: [] }),
    safe(si.audio(), []),
  ]);
  for (const c of graphics.controllers || []) {
    drivers.push({
      name: unknown(c.name), version: unknown(c.driverVersion),
      provider: unknown(c.vendor), device_name: unknown(c.model || c.name),
    });
  }
  for (const a of Array.isArray(audio) ? audio : []) {
    drivers.push({
      name: unknown(a.name), version: 'unknown',
      provider: 'unknown', device_name: unknown(a.name),
    });
  }
  if (process.platform === 'win32') {
    const lines = await commandLines('driverquery', ['/FO', 'CSV', '/NH']);
    for (const line of lines.slice(0, 50)) {
      const parts = line.split('","').map((p) => p.replace(/^"|"$/g, ''));
      if (parts.length >= 3 && parts[0]) {
        drivers.push({
          name: parts[0], version: 'unknown', provider: parts[2] || 'unknown',
          device_name: parts[0],
        });
      }
    }
  } else if (process.platform === 'linux') {
    const lines = await commandLines('lspci', ['-k']);
    let current = null;
    for (const line of lines) {
      if (/^[0-9a-f:.]+ /.test(line)) current = line.replace(/^[0-9a-f:.]+ /, '');
      const m = line.match(/Kernel driver in use:\s*(.+)/);
      if (m && current) {
        drivers.push({ name: m[1], version: 'unknown', provider: 'unknown', device_name: current });
      }
    }
  } else if (process.platform === 'darwin') {
    const lines = await commandLines('system_profiler', ['SPExtensionsDataType']);
    for (const line of lines.filter((l) => l.includes(':'))) {
      drivers.push({ name: line.split(':')[0].trim(), version: 'unknown', provider: 'unknown', device_name: line.split(':')[0].trim() });
    }
  }
  // De-duplicate by name + device.
  const seen = new Set();
  return drivers.filter((d) => {
    const k = `${d.name}|${d.device_name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function scanHardware() {
  const [cpu, mem, diskLayout, graphics, osInfo, system, bios, battery, baseboard] = await Promise.all([
    safe(si.cpu(), {}),
    safe(si.mem(), {}),
    safe(si.diskLayout(), []),
    safe(si.graphics(), { controllers: [] }),
    safe(si.osInfo(), {}),
    safe(si.system(), {}),
    safe(si.bios(), {}),
    safe(si.battery(), {}),
    safe(si.baseboard(), {}),
  ]);
  const drivers = await collectDrivers();
  const components = [];
  components.push({
    category: 'CPU', name: unknown(cpu.brand), model: unknown(cpu.model),
    serial: 'unknown', firmware: 'unknown',
    details: { cores: cpu.cores, physicalCores: cpu.physicalCores, speedGHz: cpu.speed, manufacturer: cpu.manufacturer },
  });
  components.push({
    category: 'RAM', name: `${Math.round((mem.total || 0) / 1073741824)} GB total memory`,
    model: 'unknown', serial: 'unknown', firmware: 'unknown',
    details: { totalBytes: mem.total || 0, freeBytes: mem.free || 0 },
  });
  for (const d of diskLayout) {
    components.push({
      category: 'SSD/HDD', name: unknown(d.name), model: unknown(d.type),
      serial: unknown(d.serialNum), firmware: unknown(d.firmwareRevision),
      details: { sizeBytes: d.size, interfaceType: d.interfaceType, vendor: d.vendor, smartStatus: d.smartStatus },
    });
  }
  for (const c of graphics.controllers || []) {
    components.push({
      category: 'GPU', name: unknown(c.name), model: unknown(c.model),
      serial: 'unknown', firmware: unknown(c.driverVersion),
      details: { vendor: c.vendor, vramMB: c.vram, bus: c.bus },
    });
  }
  components.push({
    category: 'Motherboard', name: unknown(system.model || baseboard.model),
    model: unknown(baseboard.model), serial: unknown(baseboard.serial),
    firmware: unknown(bios.version),
    details: { manufacturer: system.manufacturer || baseboard.manufacturer, biosVendor: bios.vendor, biosReleaseDate: bios.releaseDate },
  });
  if (battery.hasBattery) {
    components.push({
      category: 'Battery', name: 'Battery', model: 'unknown', serial: 'unknown',
      firmware: 'unknown', details: { percent: battery.percent, isCharging: battery.isCharging, maxCapacity: battery.maxCapacity, designedCapacity: battery.designedCapacity },
    });
  }
  return {
    scannedAt: new Date().toISOString(),
    platform: process.platform,
    os: {
      platform: unknown(osInfo.platform), distro: unknown(osInfo.distro),
      release: unknown(osInfo.release), arch: unknown(osInfo.arch),
      hostname: unknown(osInfo.hostname),
    },
    cpu: { brand: unknown(cpu.brand), model: unknown(cpu.model), cores: cpu.cores, speedGHz: cpu.speed },
    memoryBytes: mem.total || 0,
    components,
    drivers,
  };
}

module.exports = { scanHardware, collectDrivers, unknown };
