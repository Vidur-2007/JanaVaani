import type { EmergencyContact, Hazard } from '../../src/types';

// Spec B §3.3. Local helplines are added only after verifying them on official sites.
export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { number: '112', label_en: 'All emergencies', label: { en: 'All emergencies', te: 'అన్ని అత్యవసర పరిస్థితులు', hi: 'सभी आपात स्थितियाँ', ur: 'تمام ہنگامی حالات' } },
  { number: '108', label_en: 'Ambulance', label: { en: 'Ambulance', te: 'అంబులెన్స్', hi: 'एम्बुलेंस', ur: 'ایمبولینس' } },
  { number: '101', label_en: 'Fire', label: { en: 'Fire', te: 'అగ్నిమాపక', hi: 'अग्निशमन', ur: 'فائر بریگیڈ' } },
  { number: '1912', label_en: 'Electricity complaints', label: { en: 'Electricity complaints', te: 'విద్యుత్ ఫిర్యాదులు', hi: 'बिजली शिकायत', ur: 'بجلی کی شکایات' } },
];

/** Emergency phrase → hazard. Never matches a bare "current" or "danger". */
export const EMERGENCY_KEYWORDS: [phrase: string, hazard: Hazard][] = [
  ['live wire', 'live_wire'], ['current wire', 'live_wire'], ['current shock', 'live_wire'], ['electric shock', 'live_wire'],
  ['electrocuted', 'live_wire'], ['wire fell', 'live_wire'], ['sparking', 'live_wire'], ['transformer blast', 'fire'],
  ['fire', 'fire'], ['smoke coming', 'fire'], ['gas leak', 'gas_leak'], ['building collapse', 'collapse_risk'],
  ['wall collapse', 'collapse_risk'], ['roof collapse', 'collapse_risk'], ['flooding', 'flooding'],
  ['water entering house', 'flooding'], ['drowning', 'flooding'], ['open manhole', 'open_manhole'],
  ['child fell', 'open_manhole'], ['tree fell on', 'collapse_risk'],
  ['మంటలు', 'fire'], ['అగ్ని ప్రమాదం', 'fire'], ['కరెంట్ షాక్', 'live_wire'], ['కరెంటు తీగ', 'live_wire'],
  ['తీగ తెగి', 'live_wire'], ['గ్యాస్ లీక్', 'gas_leak'], ['కూలిపోయింది', 'collapse_risk'], ['వరద', 'flooding'],
  ['మునిగిపోతున్నారు', 'flooding'], ['మ్యాన్‌హోల్ తెరిచి', 'open_manhole'],
  ['आग लगी', 'fire'], ['आग', 'fire'], ['करंट लगा', 'live_wire'], ['बिजली का तार', 'live_wire'], ['तार टूटा', 'live_wire'],
  ['गैस लीक', 'gas_leak'], ['इमारत गिर', 'collapse_risk'], ['दीवार गिर', 'collapse_risk'], ['बाढ़', 'flooding'],
  ['डूब रहा', 'flooding'], ['खुला मैनहोल', 'open_manhole'],
  ['آگ لگی', 'fire'], ['آگ', 'fire'], ['کرنٹ لگا', 'live_wire'], ['بجلی کا تار', 'live_wire'], ['گیس لیک', 'gas_leak'],
  ['دیوار گر', 'collapse_risk'], ['عمارت گر', 'collapse_risk'], ['سیلاب', 'flooding'], ['ڈوب رہا', 'flooding'],
  ['aag lagi', 'fire'], ['current teega', 'live_wire'], ['teega tegindi', 'live_wire'], ['mantalu', 'fire'],
  ['agni pramadam', 'fire'], ['deewar gir', 'collapse_risk'], ['building gir gaya', 'collapse_risk'], ['varada', 'flooding'],
  ['manhole open', 'open_manhole'],
];

export function scanEmergency(text: string): { terms: string[]; hazards: Hazard[] } {
  const lower = text.toLowerCase();
  const terms: string[] = [];
  const hazards = new Set<Hazard>();
  for (const [phrase, hazard] of EMERGENCY_KEYWORDS) {
    if (lower.includes(phrase)) {
      terms.push(phrase);
      hazards.add(hazard);
    }
  }
  return { terms, hazards: [...hazards] };
}
