import { describe, expect, it } from 'vitest';

import { buildNotesMarkdown } from './markdown';

describe('buildNotesMarkdown', () => {
  it('formats timestamps as deep links', () => {
    const markdown = buildNotesMarkdown({
      videoId: 'abc123',
      title: 'Linear algebra review',
      url: 'https://www.youtube.com/watch?v=abc123',
      updatedAt: 1,
      items: [
        {
          id: '1',
          timestampSec: 95,
          text: 'Important theorem',
          createdAt: 1,
        },
      ],
    });

    expect(markdown).toContain('# Linear algebra review');
    expect(markdown).toContain('[1:35](https://www.youtube.com/watch?v=abc123&t=95s) Important theorem');
  });
});
