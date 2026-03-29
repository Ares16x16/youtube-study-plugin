import { formatTimestampLabel } from './time';
import type { VideoNote } from './types';

export function buildNotesMarkdown(note: VideoNote): string {
  const exportTime = new Date().toISOString();
  const lines = [
    `# ${note.title}`,
    '',
    `- Video: ${note.url}`,
    `- Exported: ${exportTime}`,
    '',
    '## Notes',
    '',
  ];

  if (note.items.length === 0) {
    lines.push('_No notes captured yet._');
    return lines.join('\n');
  }

  for (const item of note.items) {
    const label = formatTimestampLabel(item.timestampSec);
    const separator = note.url.includes('?') ? '&' : '?';
    const deepLink = `${note.url}${separator}t=${Math.floor(item.timestampSec)}s`;
    lines.push(`- [${label}](${deepLink}) ${item.text}`);
  }

  return lines.join('\n');
}
