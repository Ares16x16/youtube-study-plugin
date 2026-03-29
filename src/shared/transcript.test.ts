import { describe, expect, it } from 'vitest';

import { parseCaptionXml, pickPrimaryTrack } from './transcript';

describe('transcript utilities', () => {
  it('parses caption xml into text cues', () => {
    const xml = '<transcript><text start="1.2" dur="2.4">Hello &amp; world</text></transcript>';
    expect(parseCaptionXml(xml)).toEqual([
      {
        startSec: 1.2,
        durationSec: 2.4,
        text: 'Hello & world',
      },
    ]);
  });

  it('prefers manual default tracks over ASR tracks', () => {
    const primary = pickPrimaryTrack([
      {
        id: 'asr',
        languageCode: 'en',
        label: 'English (auto)',
        kind: 'asr',
        isDefault: false,
        trackUrl: 'https://example.com/asr',
      },
      {
        id: 'manual',
        languageCode: 'en',
        label: 'English',
        isDefault: true,
        trackUrl: 'https://example.com/manual',
      },
    ]);

    expect(primary?.id).toBe('manual');
  });
});
