# Permissions

YouTube Study Mode requests the minimum Manifest V3 permissions needed for local session enforcement and study tools.

## `storage`

Stores:

- Study settings in `chrome.storage.sync`
- Active session state in `chrome.storage.local`
- Per-video notes in `chrome.storage.local`
- Session history in `chrome.storage.local`

No account sync service is operated by this project. Chrome may sync `chrome.storage.sync` values through the user's own browser profile if the user has Chrome sync enabled.

## `alarms`

Keeps the session countdown accurate while the service worker sleeps. The background worker uses a short periodic alarm to expire sessions and update the toolbar badge.

## Host permission: `https://www.youtube.com/*`

Required to:

- Inject the content script that locks distraction routes and mounts the Study panel
- Read player bootstrap data for caption track discovery on watch pages
- Fetch caption track XML from YouTube endpoints when a transcript is available

The extension does not request access to other websites.
