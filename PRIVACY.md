# Privacy Policy

YouTube Study Mode is designed to keep all user data inside the browser.

## Data the extension stores

- Study settings in `chrome.storage.sync` (duration defaults, theme, route-blocking and watch-page cleanup toggles)
- Active session state in `chrome.storage.local`
- Video notes in `chrome.storage.local`
- Session history (videos watched and notes during a study session) in `chrome.storage.local`

## Data the extension does not collect

- No personal accounts
- No analytics or telemetry
- No browsing history outside `youtube.com`
- No data sales or ad tracking
- No remote configuration or feature flags

## Network behavior

The extension only communicates with YouTube endpoints already needed for normal YouTube playback and captions. Transcript data is fetched directly from YouTube caption track URLs when the user opens a supported watch page during an active session. Transcript requests are limited to HTTPS YouTube hosts.

## Data sharing

No user data is sent to a backend operated by this project because there is no backend. All study data remains local to the browser profile unless the user exports Markdown notes or has Chrome sync enabled for extension settings.
