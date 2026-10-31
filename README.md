# DevicePassport

A personal digital passport for each computer.

Most people don't know the full details of their computer. They forget which
RAM they installed, when the SSD was replaced, which driver version worked,
when the laptop was repaired, which component is under warranty, or what
diagnostic results were recorded before a problem started.

DevicePassport stores hardware information, maintenance history, repairs,
diagnostic results, and important device records — in one persistent,
human-readable history of the entire machine.

**Differentiating feature: hardware history and change comparison.**
Example: "Your SSD was replaced in March. Its current model and firmware
differ from your original hardware."

Competitors (HWiNFO, Speccy, CPU-Z, CrystalDiskInfo, manual spreadsheets)
specialise in a live snapshot or a single diagnostic. DevicePassport keeps
the *history*: what changed, when, and what it means.

## MVP checklist

- [x] 1. Hardware identification — live scan: CPU, RAM, disks, GPU, motherboard/BIOS, OS, serial where the OS reports it
- [x] 2. Component inventory — persisted, editable, importable from a live scan
- [x] 3. Driver inventory — best-effort per OS (Windows / Linux / macOS); missing data is `unknown`, never invented
- [x] 4. Repair log — CRUD via the UI and API
- [x] 5. Warranty information — CRUD, with status: active / expiring soon (≤30 days) / expired
- [x] 6. Health snapshots — create a snapshot of the current inventory, list them
- [x] 7. PDF device report — HTML report page with a print stylesheet; print to PDF from any browser (File → Print → Save as PDF)
- [x] Change comparison — diff two snapshots, with a plain-language sentence per added / removed / changed component

## How to run

Requires Node.js 22.5+ (for built-in `node:sqlite`) — no native dependencies.

```bash
npm install
npm test
npm start
# open http://localhost:4173
```

To use a different database or port:

```bash
DEVICEPASSPORT_DB=/path/to/data.db PORT=4173 npm start
```

## Architecture

```
src/server.js     Local HTTP server + JSON API + static UI
src/db.js         SQLite schema + queries (node:sqlite)
src/hardware.js   Cross-platform scan (systeminformation + OS tools)
src/diff.js       Snapshot diff + human-readable sentences
src/report.js     HTML device report (print-to-PDF stylesheet)
public/           Responsive UI (grid/flex, works at phone and desktop widths)
tests/            node:test suite for diff, warranty status, report HTML
```

Data flow: live scan → component/driver inventory (SQLite) → snapshots
(JSON payloads in SQLite) → diff → report. Nothing leaves the machine.

## API

- `GET /api/overview` — device + all inventories + snapshots
- `GET /api/hardware` — live scan (not persisted)
- `POST /api/hardware/import` — replace inventory with the live scan
- `GET/POST /api/components`, `GET /api/drivers`
- `POST /api/repairs`, `POST /api/warranties`
- `GET/POST /api/snapshots`
- `GET /api/diff?before=<id>&after=<id>`
- `GET /api/report` — printable HTML report

## Privacy

All data is stored in a local SQLite file (`devicepassport.db` by default).
There is no account, no cloud sync, and no telemetry. A device report is
generated on demand and is never uploaded anywhere.

## Packaging later (deliberately out of this MVP scaffold)

- Electron wrapper around this same local server + UI (same code, desktop app
  on Windows, Linux, and macOS) — see `package.json` `start` for the server
  entry point an Electron main process would load.
- MSIX (Windows) / .dmg (macOS) / AppImage (Linux) installers, GitHub
  Releases, and winget distribution.
- Background monitoring (scheduled rescans) and driver-version history —
  the snapshot/diff layer is already built for this.

## Why not WinUI/WPF?

The original suggestion was C# / WinUI 3 or WPF, but those are
Windows-only, and this product is required on Windows, Linux, and macOS.
Node + a local web UI keeps one codebase, one UI, and the same SQLite
history on all three platforms, with no native-compiled dependencies.

## License

MIT — see [LICENSE](LICENSE).
