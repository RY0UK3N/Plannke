# Vendored runtime dependencies

These files are committed locally so Plannke does not execute third-party JavaScript from a CDN at runtime.

- Bootstrap 5.3.3 — CSS + bundle JS — MIT — source: jsDelivr npm mirror
- Phosphor Icons Web 2.1.2 — regular CSS only — MIT — source: jsDelivr npm mirror
- SheetJS CE 0.20.3 — full browser build — Apache-2.0 — source: official SheetJS CDN
- Chart.js 4.5.1 — UMD browser build — MIT — source: jsDelivr npm mirror
- Apache ECharts 5.4.3 — browser build — Apache-2.0 — source: jsDelivr npm mirror

Phosphor font binaries remain on the exact-version jsDelivr URL referenced by `phosphor-icons.css`. No third-party JavaScript or stylesheet is executed remotely.
