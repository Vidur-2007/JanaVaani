import type { Department, DepartmentId, DeepLang, RequiredField } from '../../src/types';

type Q = Record<DeepLang, string>;
const f = (key: string, label_en: string, question: Q): RequiredField => ({ key, label_en, question });

const LOCATION_DETAIL = f('location_detail', 'Exact spot / landmark', {
  en: 'What is the exact spot or nearest landmark?',
  te: 'ఖచ్చితమైన ప్రదేశం లేదా దగ్గరలోని గుర్తు ఏమిటి?',
  hi: 'सटीक जगह या पास का कोई लैंडमार्क क्या है?',
  ur: 'صحیح جگہ یا قریبی نشانی کیا ہے؟',
});
const DURATION = f('duration', 'How long', {
  en: 'How long has this problem been there?',
  te: 'ఈ సమస్య ఎన్ని రోజులుగా ఉంది?',
  hi: 'यह समस्या कितने समय से है?',
  ur: 'یہ مسئلہ کب سے ہے؟',
});
const ISSUE_TYPE = (en: string, te: string, hi: string, ur: string) =>
  f('issue_type', 'Issue type', { en, te, hi, ur });

export const DEPARTMENTS: Department[] = [
  {
    id: 'roads',
    name: {
      en: 'Roads & Municipal Engineering',
      te: 'రోడ్లు & మున్సిపల్ ఇంజనీరింగ్',
      hi: 'सड़क एवं नगर अभियांत्रिकी',
      ur: 'سڑکیں اور میونسپل انجینئرنگ',
    },
    agency_en: 'GHMC Engineering',
    icon: 'construction',
    color: '#FF8A3D',
    sub_departments: ['potholes', 'road_damage', 'footpaths'],
    required_fields: [
      LOCATION_DETAIL,
      f('size', 'Size', {
        en: 'Is it small, large or very large?',
        te: 'ఇది చిన్నదా, పెద్దదా, చాలా పెద్దదా?',
        hi: 'यह छोटा है, बड़ा है या बहुत बड़ा?',
        ur: 'یہ چھوٹا ہے، بڑا ہے یا بہت بڑا؟',
      }),
      DURATION,
      f('blocking_traffic', 'Blocking traffic', {
        en: 'Is it blocking traffic?',
        te: 'ఇది ట్రాఫిక్‌కు అడ్డుగా ఉందా?',
        hi: 'क्या इससे ट्रैफिक रुक रहा है?',
        ur: 'کیا اس سے ٹریفک رک رہا ہے؟',
      }),
    ],
  },
  {
    id: 'sanitation',
    name: {
      en: 'Sanitation & Solid Waste',
      te: 'పారిశుధ్యం & ఘన వ్యర్థాలు',
      hi: 'स्वच्छता एवं ठोस अपशिष्ट',
      ur: 'صفائی اور ٹھوس فضلہ',
    },
    agency_en: 'GHMC SWM',
    icon: 'trash-2',
    color: '#A3E635',
    sub_departments: ['garbage', 'bins', 'sweeping', 'dead_animals'],
    required_fields: [
      LOCATION_DETAIL,
      f('waste_type', 'Waste type', {
        en: 'What kind of waste is it?',
        te: 'ఇది ఏ రకమైన చెత్త?',
        hi: 'यह किस तरह का कचरा है?',
        ur: 'یہ کس قسم کا کچرا ہے؟',
      }),
      DURATION,
      f('bin_overflow', 'Bin overflowing', {
        en: 'Is a bin overflowing?',
        te: 'చెత్త డబ్బా పొంగిపోతుందా?',
        hi: 'क्या कूड़ेदान भर कर बह रहा है?',
        ur: 'کیا کوڑے دان بھر کر بہہ رہا ہے؟',
      }),
    ],
  },
  {
    id: 'water',
    name: { en: 'Water Supply', te: 'నీటి సరఫరా', hi: 'जल आपूर्ति', ur: 'پانی کی فراہمی' },
    agency_en: 'HMWSSB',
    icon: 'droplets',
    color: '#38BDF8',
    sub_departments: ['no_supply', 'leakage', 'contamination', 'low_pressure'],
    required_fields: [
      ISSUE_TYPE(
        'Is it no supply, a leak, dirty water or low pressure?',
        'నీరు రావడం లేదా, లీకేజా, మురికి నీరా, లేక తక్కువ ప్రెషరా?',
        'पानी नहीं आ रहा, लीकेज है, गंदा पानी है या कम प्रेशर?',
        'پانی نہیں آ رہا، رساؤ ہے، گندا پانی ہے یا کم دباؤ؟',
      ),
      DURATION,
      f('households_affected', 'Households affected', {
        en: 'How many households are affected?',
        te: 'ఎన్ని ఇళ్లు ప్రభావితమయ్యాయి?',
        hi: 'कितने घर प्रभावित हैं?',
        ur: 'کتنے گھر متاثر ہیں؟',
      }),
    ],
  },
  {
    id: 'streetlights',
    name: { en: 'Streetlights', te: 'వీధి దీపాలు', hi: 'स्ट्रीट लाइट', ur: 'اسٹریٹ لائٹس' },
    agency_en: 'GHMC Electrical',
    icon: 'lamp',
    color: '#FACC15',
    sub_departments: ['not_working', 'damaged_pole', 'daytime_burning'],
    required_fields: [
      LOCATION_DETAIL,
      f('pole_number', 'Pole number (optional)', {
        en: 'Is there a number on the pole? (optional)',
        te: 'స్తంభంపై నంబర్ ఉందా? (ఐచ్ఛికం)',
        hi: 'क्या खंभे पर कोई नंबर है? (वैकल्पिक)',
        ur: 'کیا کھمبے پر کوئی نمبر ہے؟ (اختیاری)',
      }),
      f('lights_count', 'Lights affected', {
        en: 'How many lights are not working?',
        te: 'ఎన్ని లైట్లు పనిచేయడం లేదు?',
        hi: 'कितनी लाइटें काम नहीं कर रहीं?',
        ur: 'کتنی لائٹس کام نہیں کر رہیں؟',
      }),
      DURATION,
    ],
  },
  {
    id: 'power',
    name: { en: 'Power Distribution', te: 'విద్యుత్ పంపిణీ', hi: 'बिजली वितरण', ur: 'بجلی کی تقسیم' },
    agency_en: 'TGSPDCL',
    icon: 'zap',
    color: '#F472B6',
    sub_departments: ['outage', 'voltage', 'transformer', 'sparking_lines'],
    required_fields: [
      f('scope', 'Scope', {
        en: 'Is it only your house, the street, or the whole area?',
        te: 'మీ ఇంటికేనా, వీధికా, లేక మొత్తం ప్రాంతానికా?',
        hi: 'सिर्फ आपका घर, पूरी गली या पूरा इलाका?',
        ur: 'صرف آپ کا گھر، پوری گلی یا پورا علاقہ؟',
      }),
      DURATION,
      f('sparking_or_danger', 'Sparking or danger', {
        en: 'Is there any sparking or danger to people?',
        te: 'ఏమైనా నిప్పురవ్వలు లేదా ప్రజలకు ప్రమాదం ఉందా?',
        hi: 'क्या कहीं चिंगारी या लोगों को खतरा है?',
        ur: 'کیا کہیں چنگاری یا لوگوں کو خطرہ ہے؟',
      }),
    ],
  },
  {
    id: 'drainage',
    name: {
      en: 'Sewerage & Drainage',
      te: 'మురుగునీరు & డ్రైనేజీ',
      hi: 'सीवरेज एवं जल निकासी',
      ur: 'سیوریج اور نکاسی آب',
    },
    agency_en: 'HMWSSB / GHMC SWD',
    icon: 'waves',
    color: '#2DD4BF',
    sub_departments: ['overflow', 'blocked_drain', 'open_manhole'],
    required_fields: [
      LOCATION_DETAIL,
      f('entering_homes', 'Entering homes', {
        en: 'Is the water entering homes?',
        te: 'నీరు ఇళ్లలోకి వస్తోందా?',
        hi: 'क्या पानी घरों में घुस रहा है?',
        ur: 'کیا پانی گھروں میں داخل ہو رہا ہے؟',
      }),
      DURATION,
    ],
  },
  {
    id: 'traffic',
    name: {
      en: 'Traffic & Road Safety',
      te: 'ట్రాఫిక్ & రహదారి భద్రత',
      hi: 'यातायात एवं सड़क सुरक्षा',
      ur: 'ٹریفک اور سڑک کی حفاظت',
    },
    agency_en: 'Traffic Police',
    icon: 'traffic-cone',
    color: '#FB7185',
    sub_departments: ['signal_failure', 'dangerous_junction', 'signage'],
    required_fields: [
      f('junction', 'Junction', {
        en: 'Which junction or road is it?',
        te: 'ఏ జంక్షన్ లేదా రోడ్డు?',
        hi: 'कौन सा चौराहा या सड़क?',
        ur: 'کون سا چوراہا یا سڑک؟',
      }),
      ISSUE_TYPE('What exactly is the problem?', 'సమస్య ఏమిటి?', 'समस्या क्या है?', 'مسئلہ کیا ہے؟'),
      f('time_of_day', 'Time of day', {
        en: 'At what time of day does it happen?',
        te: 'ఇది రోజులో ఏ సమయంలో జరుగుతుంది?',
        hi: 'यह दिन में किस समय होता है?',
        ur: 'یہ دن میں کس وقت ہوتا ہے؟',
      }),
    ],
  },
  {
    id: 'health',
    name: { en: 'Public Health', te: 'ప్రజారోగ్యం', hi: 'जन स्वास्थ्य', ur: 'صحت عامہ' },
    agency_en: 'GHMC Health / Entomology',
    icon: 'heart-pulse',
    color: '#C084FC',
    sub_departments: ['mosquitoes', 'hospital_conditions', 'food_safety'],
    required_fields: [
      f('facility_or_area', 'Facility or area', {
        en: 'Which facility or area?',
        te: 'ఏ ఆసుపత్రి లేదా ప్రాంతం?',
        hi: 'कौन सा अस्पताल या इलाका?',
        ur: 'کون سا اسپتال یا علاقہ؟',
      }),
      ISSUE_TYPE(
        'What is the health issue?',
        'ఆరోగ్య సమస్య ఏమిటి?',
        'स्वास्थ्य से जुड़ी समस्या क्या है?',
        'صحت کا مسئلہ کیا ہے؟',
      ),
    ],
  },
  {
    id: 'education',
    name: { en: 'Government Schools', te: 'ప్రభుత్వ పాఠశాలలు', hi: 'सरकारी स्कूल', ur: 'سرکاری اسکول' },
    agency_en: 'School Education Dept',
    icon: 'school',
    color: '#60A5FA',
    sub_departments: ['building', 'toilets', 'drinking_water'],
    required_fields: [
      f('school_name', 'School name', {
        en: 'What is the name of the school?',
        te: 'పాఠశాల పేరు ఏమిటి?',
        hi: 'स्कूल का नाम क्या है?',
        ur: 'اسکول کا نام کیا ہے؟',
      }),
      ISSUE_TYPE(
        'What is the problem at the school?',
        'పాఠశాలలో సమస్య ఏమిటి?',
        'स्कूल में क्या समस्या है?',
        'اسکول میں کیا مسئلہ ہے؟',
      ),
    ],
  },
  {
    id: 'town_planning',
    name: { en: 'Town Planning', te: 'పట్టణ ప్రణాళిక', hi: 'नगर नियोजन', ur: 'ٹاؤن پلاننگ' },
    agency_en: 'GHMC Town Planning',
    icon: 'building-2',
    color: '#F59E0B',
    sub_departments: ['encroachment', 'illegal_construction'],
    required_fields: [
      f('address', 'Address', {
        en: 'What is the address?',
        te: 'చిరునామా ఏమిటి?',
        hi: 'पता क्या है?',
        ur: 'پتہ کیا ہے؟',
      }),
      ISSUE_TYPE(
        'Is it encroachment or illegal construction?',
        'ఇది ఆక్రమణా లేక అక్రమ నిర్మాణమా?',
        'यह अतिक्रमण है या अवैध निर्माण?',
        'یہ تجاوز ہے یا غیر قانونی تعمیر؟',
      ),
    ],
  },
  {
    id: 'other',
    name: { en: 'Other / Unclassified', te: 'ఇతరాలు', hi: 'अन्य', ur: 'دیگر' },
    agency_en: '—',
    icon: 'circle-help',
    color: '#94A3B8',
    sub_departments: [],
    required_fields: [LOCATION_DETAIL],
  },
];

export const DEPARTMENT_IDS = DEPARTMENTS.map((d) => d.id) as DepartmentId[];
export const deptById = (id: DepartmentId) =>
  DEPARTMENTS.find((d) => d.id === id) ?? DEPARTMENTS[DEPARTMENTS.length - 1];

/** Keyword hints used by the mock classifier (lower-cased substring match, all scripts). */
export const DEPT_KEYWORDS: Record<DepartmentId, string[]> = {
  roads: ['pothole', 'road', 'gunta', 'గుంత', 'రోడ్డు', 'गड्ढा', 'सड़क', 'گڑھا', 'سڑک', 'footpath', 'rasta'],
  sanitation: [
    'garbage',
    'trash',
    'waste',
    'chetta',
    'చెత్త',
    'कचरा',
    'कूड़ा',
    'کچرا',
    'کوڑا',
    'bin',
    'dustbin',
  ],
  water: ['water', 'neeru', 'neellu', 'నీరు', 'నీళ్లు', 'पानी', 'پانی', 'pipe', 'leak', 'nalla'],
  streetlights: ['streetlight', 'street light', 'lamp', 'light', 'లైట్', 'దీపం', 'लाइट', 'بتی', 'لائٹ'],
  power: [
    'power',
    'current',
    'electricity',
    'transformer',
    'కరెంట్',
    'కరెంటు',
    'విద్యుత్',
    'बिजली',
    'करंट',
    'بجلی',
    'کرنٹ',
    'wire',
    'teega',
    'తీగ',
  ],
  drainage: [
    'drain',
    'sewage',
    'manhole',
    'sewer',
    'మురుగు',
    'డ్రైనేజీ',
    'नाली',
    'सीवर',
    'نالی',
    'گٹر',
    'gutter',
  ],
  traffic: ['traffic', 'signal', 'junction', 'ట్రాఫిక్', 'సిగ్నల్', 'ट्रैफिक', 'सिग्नल', 'ٹریفک', 'سگنل'],
  health: [
    'mosquito',
    'hospital',
    'dengue',
    'food',
    'దోమలు',
    'ఆసుపత్రి',
    'मच्छर',
    'अस्पताल',
    'مچھر',
    'اسپتال',
  ],
  education: ['school', 'teacher', 'పాఠశాల', 'స్కూల్', 'स्कूल', 'विद्यालय', 'اسکول'],
  town_planning: [
    'encroach',
    'illegal construction',
    'building permission',
    'ఆక్రమణ',
    'अतिक्रमण',
    'अवैध निर्माण',
    'تجاوز',
    'غیر قانونی تعمیر',
  ],
  other: [],
};
