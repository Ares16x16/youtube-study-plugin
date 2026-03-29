# YouTube Study Mode

Turn YouTube into a timed study environment instead of a distraction loop.

YouTube Study Mode is a local-first Chrome extension built with WXT, React, and TypeScript.
It blocks distraction-heavy YouTube routes during active sessions, keeps search and direct watch pages usable, and adds a focused study panel with transcript access, timestamped notes, and Markdown export downloads.

Current version: `0.1.0`

## Why it exists

- Strict study sessions: Home, Shorts, subscriptions, channels, playlists, and similar routes are locked during an active session.
- Search and watch stay available: you can still find the exact video you need and study it.
- Watch-page study tools: transcript access, timestamped notes, and Markdown download export live beside the player.
- Privacy-first defaults: no account, no analytics, no backend, no remote code.

## Current behavior

- Timed sessions apply browser-wide to all open `youtube.com` tabs.
- Allowed routes during an active session: `/watch` and `/results`.
- Blocked routes are replaced by a lock screen with `Extend`, `End`, `Break`, and `Open search` actions.
- `Break` pauses the timer and unlocks YouTube until you resume.
- When a session expires, active YouTube tabs show an end-of-session prompt instead of silently unlocking.
- On watch pages, the Study panel mounts on the right side where suggestions normally appear. If unavailable in a layout, it falls back to a right-side floating panel.
- Typing in the notes textarea suppresses YouTube single-key shortcuts.
- Notes are stored locally per video in `chrome.storage.local`.
- Notes export downloads a `.md` file (instead of copying to clipboard).
- Session history tracks watched videos and associated notes for the current study session.
- Session history is collapsible per video and supports per-video markdown export and `Clear history`.
- Settings are stored in `chrome.storage.sync`.

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

Run tests:

```bash
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
- No data leaves the browser

See [PRIVACY.md](./PRIVACY.md) for the project privacy policy.

## Manual test checklist

- Start a 25-minute session and verify that Home, Shorts, subscriptions, channels, and playlists are locked.
- Verify `/results` stays available and distraction-heavy shelves are removed.
- Verify `/watch` keeps the player, removes comments/recommendations/live chat, and shows the Study panel on the right side.
- Add a note, reload, and verify the note persists.
- Type in the notes textarea and verify YouTube shortcuts (for example `t`) are not triggered.
- Export notes and verify a Markdown file is downloaded with timestamp deep links.
- Verify Session history shows watched videos, allows expanding to view notes, and supports `Clear history`.
- Let the session expire and verify the end-of-session prompt appears.
- Verify that videos without captions still allow notes and show a clear transcript-unavailable state.

## Author

Author: [Ares16x16](https://github.com/Ares16x16)
