# 🦊 FOX-time-tracker ⏱

**FOX-time-tracker** is a cross-platform (Windows / Linux / macOS) **project time tracker** with a **scrolling status banner**, **weekly totals**, **CSV export**, and a **day Check-in/Check-out timer** — all in plain HTML/CSS/JS.  

![status: active](https://img.shields.io/badge/status-active-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](https://github.com/fox-techniques/fox-time-tracker/blob/main/LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-FOX--time--tracker-181717?logo=github)](https://github.com/fox-techniques/fox-time-tracker)

## 🌟 Features

- **Per-project tracking** with Start / Stop
- **Done / Undone** per project
- **Weekly totals (Mon–Sun)** with one-click **CSV export**
- **Auto-export on week rollover** (runs every minute while open, and also on next load)
- **Scrolling bottom banner** (edge-to-edge, pauses on hover) showing each project:
  - **running (green):** `ProjectName <elapsed> | <total>`
  - **done (orange):** `ProjectName | <total>`
  - **stopped (red):** `ProjectName 00:00:00 | <total>`
  - Items are separated by a **◆** diamond
- **Day timer** with **Check In / Check Out** + live counter
- **Zero setup** — open `index.html` in a browser
- **Offline & private** — all data stays in your browser `localStorage`


## 🚀 Quick start

**Just open:**
1. Clone/download the repo.
2. Double-click `index.html`.

## 🧭 Usage

### Projects

1. Add/select a project (top-left).
2. **Start** to begin tracking. **Stop** to end a session. **Done** marks a project as completed (turns the button into *Undone*).
3. **Reset** removes this week’s sessions for that project only.

### Day timer

- Use **Check In / Check Out** to track your overall day.
- The day counter is independent from project sessions.

### Export

- Click **"Export week (CSV)"** for a manual export.
- **Auto-export:** the app checks every minute whether a *new week has started* (Monday 00:00). If yes, it **exports last week** automatically. If the page wasn’t open at the rollover, it will export **on next load**.

Note: The CSV filename uses your browser’s locale for dates (e.g., `times_13-11-2025_to_19-11-2025.csv`). Browsers sanitize any unsupported filename characters.

## ⚙️ Configuration

Open `styles.css`:

- Banner speed:
  
```css
:root { --speed: 20s; } /* decrease for faster scroll */

``` 
- Theme colors & sizes

Tweak CSS variables at the top (e.g., `--bg`, `--panel`, `--banner-h`).

Open `app.js`:

- Week start (Monday): Change `startOfWeekMonday()` if you prefer Sunday weeks.

- Diamond separator: In `buildBannerHTML()` you can replace ◆ with anything you like.

## 🔐 Data & privacy

All data is stored locally in your browser via *localStorage*:

- `tt.projects` — project list
- `tt.sessions` — project sessions array
- `tt.active` — currently running project (if any)
- `tt.done` — array of done project names
- `tt.dayActive` / `tt.daySessions` — day timer
- `tt.lastExportWeekStart` — last auto-export checkpoint

Use **“Reset all data”** (bottom of the right panel) to clear everything.

## 💡 Tips

- **Pause the banner:** hover over it.
- **Stop then mark done:** clicking **Done** on a running project will stop it first.
- **Cross-platform:** Works on Windows, Linux, and macOS in any modern browser.
- **Deploy:** It’s a static site — host on *GitHub Pages*, *Azure Static Web Apps*, etc.

--- 

🎉 Thanks for trying **FOX-time-tracker**—wishing you sharp focus, smooth flow, and plenty of orange **“Done”** moments this week! 🔥🚀