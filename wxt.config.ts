import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'YouTube Study Mode',
    version: '1.0.0',
    description:
      'Turn YouTube into a timed study environment with strict distraction blocking, transcripts, and timestamped notes.',
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://www.youtube.com/*'],
    action: {
      default_title: 'YouTube Study Mode',
    },
    icons: {
      16: '/icons/icon-16.png',
      32: '/icons/icon-32.png',
      48: '/icons/icon-48.png',
      128: '/icons/icon-128.png',
    },
    web_accessible_resources: [
      {
        resources: ['youtube-player-data.js'],
        matches: ['https://www.youtube.com/*'],
      },
    ],
  },
});
