# Contributing

Thanks for contributing to YouTube Study Mode.

## Development setup

1. Install Node.js 20+.
2. Install dependencies:

```bash
npm install
```

3. Start dev mode:

```bash
npm run dev
```

4. Before opening a PR, run:

```bash
npm run check
npm run test
npm run build
```

## Pull request guidelines

- Keep PRs focused on one concern.
- Include a short summary of behavior changes.
- Add or update tests when behavior changes.
- Do not add new permissions without justification in `docs/PERMISSIONS.md`.

## Coding guidelines

- Keep the extension local-first and privacy-first.
- Prefer minimal permissions.
- Avoid remote code and unnecessary third-party services.
- Preserve existing route-blocking and session semantics unless the change is intentional and documented.
