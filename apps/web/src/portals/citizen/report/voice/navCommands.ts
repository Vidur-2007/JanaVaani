// S10: voice navigation ("open my complaints" / "నా ఫిర్యాదులు" / "मेरी शिकायतें" / "میری شکایات").
// Deliberately strict so a real complaint is never hijacked: the whole utterance (after an optional verb such as
// "open", "go to", "చూపించు", "खोलो", "کھولو") must be one of the phrases below, at most 5 words.
import { normalizeSpoken } from './voiceWords';

export type NavTarget = 'home' | 'complaints' | 'notifications' | 'settings' | 'nearby' | 'track' | 'guide';

export const NAV_PATHS: Record<NavTarget, string> = {
  home: '/app',
  complaints: '/app/complaints',
  notifications: '/app/notifications',
  settings: '/app/settings',
  nearby: '/app/nearby',
  track: '/track',
  guide: '/guide',
};

const PHRASES: Record<NavTarget, string[]> = {
  complaints: [
    'my complaints',
    'complaints',
    'my reports',
    'my complaint status',
    'naa firyadulu',
    'na firyadulu',
    'నా ఫిర్యాదులు',
    'ఫిర్యాదులు',
    'meri shikayatein',
    'meri shikayaten',
    'मेरी शिकायतें',
    'मेरी शिकायते',
    'शिकायतें',
    'میری شکایات',
    'میری شکایتیں',
    'شکایات',
  ],
  home: ['home', 'home page', 'హోమ్', 'హోమ్ పేజీ', 'होम', 'ہوم'],
  notifications: [
    'notifications',
    'alerts',
    'my updates',
    'updates',
    'నోటిఫికేషన్లు',
    'హెచ్చరికలు',
    'सूचनाएँ',
    'सूचनाएं',
    'नोटिफिकेशन',
    'اطلاعات',
    'نوٹیفکیشن',
  ],
  settings: [
    'settings',
    'సెట్టింగ్లు',
    'సెట్టింగ్స్',
    'సెట్టింగులు',
    'सेटिंग्स',
    'सेटिंग',
    'سیٹنگز',
    'ترتیبات',
  ],
  nearby: [
    'nearby',
    'nearby issues',
    'nearby problems',
    'దగ్గర్లో సమస్యలు',
    'आस पास',
    'आसपास की समस्याएँ',
    'آس پاس',
  ],
  track: ['track', 'track complaint', 'track a complaint', 'ట్రాక్', 'ट्रैक', 'ٹریک'],
  guide: ['guide', 'help', 'గైడ్', 'సహాయం', 'गाइड', 'मदद', 'رہنما', 'مدد'],
};

// Leading/trailing command words: "open …", "go to …", "… చూపించు", "… खोलो", "… دکھاؤ".
const VERBS = [
  'please',
  'open',
  'go to',
  'goto',
  'show',
  'show me',
  'take me to',
  'go',
  'kholo',
  'dikhao',
  'chupinchu',
  'teruvu',
  'చూపించు',
  'చూపించండి',
  'తెరువు',
  'తెరవండి',
  'ఓపెన్ చేయి',
  'ఓపెన్ చేయండి',
  'ఓపెన్',
  'खोलो',
  'खोलें',
  'दिखाओ',
  'दिखाएँ',
  'पर जाओ',
  'पर जाएँ',
  'ओपन करो',
  'کھولو',
  'کھولیں',
  'دکھاؤ',
  'دکھائیں',
  'پر جاؤ',
]
  .map((v) => clean(v))
  .sort((a, b) => b.length - a.length);

function clean(s: string) {
  return normalizeSpoken(s.replace(/[‌‍]/g, ''));
}

const INDEX: [string, NavTarget][] = (Object.entries(PHRASES) as [NavTarget, string[]][]).flatMap(([t, ps]) =>
  ps.map((p) => [clean(p), t] as [string, NavTarget]),
);

export function matchNavCommand(text: string): NavTarget | null {
  let t = clean(text);
  if (!t || t.split(' ').length > 6) return null;
  for (let changed = true; changed;) {
    changed = false;
    for (const v of VERBS) {
      if (t.startsWith(`${v} `)) {
        t = t.slice(v.length + 1);
        changed = true;
      } else if (t.endsWith(` ${v}`)) {
        t = t.slice(0, -v.length - 1);
        changed = true;
      }
    }
  }
  if (t.split(' ').length > 5) return null;
  return INDEX.find(([p]) => p === t)?.[1] ?? null;
}
