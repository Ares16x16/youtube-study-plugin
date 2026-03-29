import type { TranscriptCue, TranscriptTrack } from './types';

const TEXT_TAG_REGEX = /<text([^>]*)>([\s\S]*?)<\/text>/g;
const ATTR_REGEX = /(\w+)="([^"]*)"/g;
const BR_TAG_REGEX = /<br\s*\/?>/gi;
const TAG_REGEX = /<[^>]+>/g;
const NUMERIC_ENTITY_REGEX = /&#(\d+);/g;
const HEX_ENTITY_REGEX = /&#x([0-9a-f]+);/gi;

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function decodeHtmlEntities(input: string): string {
  let output = input;
  for (const [entity, value] of Object.entries(ENTITY_MAP)) {
    output = output.replaceAll(entity, value);
  }
  output = output.replace(NUMERIC_ENTITY_REGEX, (_, code) => String.fromCharCode(Number(code)));
  output = output.replace(HEX_ENTITY_REGEX, (_, code) => String.fromCharCode(parseInt(code, 16)));
  return output;
}

export function parseCaptionXml(xml: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  let match: RegExpExecArray | null;

  while ((match = TEXT_TAG_REGEX.exec(xml)) !== null) {
    const attrsSource = match[1] ?? '';
    const textSource = match[2] ?? '';
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = ATTR_REGEX.exec(attrsSource)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    const text = decodeHtmlEntities(textSource.replace(BR_TAG_REGEX, '\n').replace(TAG_REGEX, '').trim());
    if (!text) {
      continue;
    }

    cues.push({
      startSec: Number(attrs.start ?? 0),
      durationSec: Number(attrs.dur ?? 0),
      text,
    });
  }

  return cues;
}

export function sortTracks(tracks: TranscriptTrack[]): TranscriptTrack[] {
  return [...tracks].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }
    if (left.kind === 'asr' && right.kind !== 'asr') {
      return 1;
    }
    if (right.kind === 'asr' && left.kind !== 'asr') {
      return -1;
    }
    return left.label.localeCompare(right.label);
  });
}

export function pickPrimaryTrack(tracks: TranscriptTrack[]): TranscriptTrack | null {
  return sortTracks(tracks)[0] ?? null;
}
