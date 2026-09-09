# YouTube Study Mode

Turn YouTube into a timed study environment instead of a distraction loop.

YouTube Study Mode is a local-first Chrome extension built with WXT, React, and TypeScript.
It blocks distraction-heavy YouTube routes during active sessions, keeps search and direct watch pages usable, and adds a focused study panel with transcript access, timestamped notes, and Markdown export downloads.

Current version: `1.0.0`

Chrome Web Store ID: `llfhkhnmbhcgoohfhcehdmjiigibfllc`

## Why it exists

- Strict study sessions: Home, Shorts, subscriptions, channels, playlists, trending, library, and similar routes are locked during an active session.
- Search and watch stay available: you can still find the exact video you need and study it.
- Watch-page study tools: transcript access, timestamped notes, and Markdown download export live beside the player.
- Privacy-first defaults: no account, no analytics, no backend, no remote code.

## Current behavior

- Timed sessions apply browser-wide to all open `youtube.com` tabs.
- Allowed routes during an active session: `/watch` and `/results`.
- Blocked routes are replaced by a lock screen with `Extend`, `End`, `Break`, and `Open search` actions.
- `Break` pauses the timer and unlocks YouTube until you resume.
- When a session expires, active YouTube tabs show an end-of-session prompt instead of silently unlocking. Extending reopens the same session history.
- On watch pages, the Study panel mounts on the right side where suggestions normally appear. If unavailable in a layout, it falls back to a right-side floating panel.
- Typing in the notes textarea suppresses YouTube single-key shortcuts. `Ctrl/Cmd+Enter` saves a note.
- Notes are stored locally per video in `chrome.storage.local`.
- Notes export downloads a `.md` file (instead of copying to clipboard).
- Session history tracks watched videos and associated notes for the current study session.
- Session history is collapsible per video and supports per-video markdown export and `Clear history`.
- Settings (theme, default duration, route blocks, watch-page cleanup) are stored in `chrome.storage.sync` and honored by the content script.
- Toolbar badge shows remaining minutes, `||` while paused, and `!` when expired.

## Stack

- WXT
- React
- TypeScript
- Chrome Manifest V3
- Vitest

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Create a store zip:

```bash
npm run zip
```

Run checks:

```bash
npm run check
npm run test
```

## Permissions

- `storage`: store settings, session state, session history, and notes locally.
- `alarms`: keep session countdown and expiry handling accurate in the background worker.
- `https://www.youtube.com/*`: enforce Study Mode only on YouTube and read player bootstrap data for transcript tracks.

Detailed rationale lives in [docs/PERMISSIONS.md](./docs/PERMISSIONS.md).

## Privacy

- No telemetry
- No cookies or external accounts
- No third-party analytics
- No remote configuration
- No data leaves the browser except optional Markdown exports you trigger and YouTube caption fetches during study

See [PRIVACY.md](./PRIVACY.md) for the project privacy policy.

## Manual Chrome test checklist (before store submit)

1. Load the unpacked build from `.output/chrome-mv3` (or the zip from `npm run zip`) in `chrome://extensions`.
2. Start a 25-minute session and verify Home, Shorts, subscriptions, channels, playlists, trending, and library are locked.
3. Verify `/results` stays available and distraction-heavy shelves are removed when those settings are enabled.
4. Verify `/watch` keeps the player, hides comments/recommendations/live chat/autoplay according to settings, and shows the Study panel on the right side (or floating fallback).
5. Add a note, reload, and verify the note persists. Confirm `Ctrl/Cmd+Enter` saves and YouTube shortcuts like `t` do not fire while typing.
6. Export notes and verify a Markdown file downloads with timestamp deep links.
7. Verify Session history shows watched videos, expands notes, exports per video, and supports `Clear history`.
8. Take a Break in one tab; confirm all YouTube tabs unlock and the badge shows `||`. Resume and confirm locks return.
9. Let the session expire (or temporarily use a short custom duration) and verify the end-of-session lock prompt appears on YouTube tabs. Extend and confirm history continues; Clear and confirm idle browsing returns.
10. Change hide/block toggles in the popup and confirm watch-page cleanup and route locks update without reloading the extension.
11. Open multiple YouTube tabs and confirm session start/pause/expiry stays in sync.
12. Verify videos without captions still allow notes and show a clear transcript-unavailable state.
13. Confirm popup theme follows System / Light / Dark.

## Author

Author: [Ares16x16](https://github.com/Ares16x16)
