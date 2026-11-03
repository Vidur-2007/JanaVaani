// Checks the voice confirmation matcher (Spec A §5.5). Run: npx vite-node scripts/check-voice-words.ts
import { matchConfirmWord } from '../src/portals/citizen/report/voice/voiceWords';
import { matchNavCommand, type NavTarget } from '../src/portals/citizen/report/voice/navCommands';

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
// S10 voice navigation: whole-utterance commands only; real complaints must never match.
const nav: [string, NavTarget | null][] = [
  ['open my complaints', 'complaints'],
  ['My complaints.', 'complaints'],
  ['నా ఫిర్యాదులు', 'complaints'],
  ['నా ఫిర్యాదులు చూపించు', 'complaints'],
  ['naa firyadulu', 'complaints'],
  ['मेरी शिकायतें दिखाओ', 'complaints'],
  ['meri shikayatein kholo', 'complaints'],
  ['میری شکایات', 'complaints'],
  ['go to settings', 'settings'],
  ['సెట్టింగ్‌లు', 'settings'],
  ['सूचनाएँ', 'notifications'],
  ['go home', 'home'],
  ['help', 'guide'],
  ['آس پاس', 'nearby'],
  ['my complaints are not being resolved for weeks', null],
  ['నా ఫిర్యాదులు ఎవరూ పట్టించుకోవడం లేదు', null],
  ['garbage near my home', null],
  ['there is no help from the office', null],
  ['', null],
];
for (const [input, want] of nav) {
  const got = matchNavCommand(input);
  if (got !== want) {
    failed++;
    console.error(`✗ nav ${JSON.stringify(input)} → ${got}, expected ${want}`);
  }
}
if (failed) process.exit(1);
console.log(`✓ voice words: ${cases.length} cases · voice navigation: ${nav.length} cases`);
