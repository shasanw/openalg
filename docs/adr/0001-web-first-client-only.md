# Web-first, client-only; desktop app removed

OpenAlg started as a Tauri desktop app (Rust core for file I/O and Typst PDF compilation). We're making it a web app that runs entirely in the browser instead — no backend, no accounts — and deleting the Tauri shell and Rust crate rather than keeping desktop as a second target. Teachers shouldn't have to install anything, and maintaining two storage and two PDF pipelines isn't worth it for a small project. The storage layer stays behind the `Platform` seam so optional teacher-only Library sync can be added later without reshaping the app.

## Consequences

- The PRD's "local JSON files you own" promise becomes "a browser-kept Library plus downloadable Worksheet Files"; double-click-to-open goes away.
- Working offline is no longer a requirement (it was PRD story 38). It comes back with a desktop app, if one is built later on top of the same `Platform` seam.
- PDF and Preview compilation must happen client-side (Typst compiled to WebAssembly), which adds a large first-load download.
- Student accounts, online distribution and auto-grading remain permanently out of scope (PRD #1). Any future accounts are for teachers only: Library sync and, eventually, licensing (the app launches free; a paid licence in the style of Kuta Software may follow). The app must keep working without signing in for whatever the free tier covers.
