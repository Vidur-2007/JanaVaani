// Checks the voice confirmation matcher (Spec A §5.5). Run: npx vite-node scripts/check-voice-words.ts
import { matchConfirmWord } from '../src/portals/citizen/report/voice/voiceWords';

const cases: [string, 'yes' | 'no' | null][] = [
  ['Yes', 'yes'],
  ['ok.', 'yes'],
  ['avunu', 'yes'],
  ['అవును', 'yes'],
  ['సరే!', 'yes'],
  ['haan ji', 'yes'],
  ['हाँ', 'yes'],
  ['हां।', 'yes'],
  ['theek hai', 'yes'],
  ['جی ہاں', 'yes'],
  ['ہاں۔', 'yes'],
  ['no', 'no'],
  ['No, change it', 'no'],
  ['kaadu', 'no'],
  ['కాదు', 'no'],
  ['మార్చు', 'no'],
  ['nahi', 'no'],
  ['नहीं', 'no'],
  ['badlo', 'no'],
  ['نہیں', 'no'],
  ['the pothole is very big', null],
  ['jitna', null],
  ['okra', null],
  ['', null],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = matchConfirmWord(input);
  if (got !== want) {
    failed++;
    console.error(`✗ ${JSON.stringify(input)} → ${got}, expected ${want}`);
  }
}
if (failed) process.exit(1);
console.log(`✓ voice words: ${cases.length} cases`);
