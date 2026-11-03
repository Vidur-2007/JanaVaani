"""Synthetic multilingual grievance dataset (offline, deterministic).

Spec B §7 plans LLM-generated data via Gemini. No API key was available while building, so this
generator composes complaints from hand-written phrase banks (en, te, hi, ur, Tenglish, Hinglish)
with Hyderabad localities, landmarks and durations. Every row records `phrase_id`, so the trainer can
hold out whole phrases (group split) and the synthetic test set measures generalisation to unseen
wording, not memorised templates. Run with --llm to append Gemini-generated rows when a key exists.

Usage: python ml/generate_dataset.py [--n-per-phrase 6] [--seed 7]
"""
import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "seed" / "complaints.jsonl"

# (category, lang, script, code_mixed) -> list of (issue phrase, english gloss, sub_department, urgency, hazards)
B = {
 "roads": {
  "en": [("there is a huge pothole on the main road", "huge pothole on main road", "potholes", "medium", []),
         ("the road is completely broken and full of craters", "road broken with craters", "road damage", "medium", []),
         ("the footpath tiles are broken and people are tripping", "footpath tiles broken", "footpaths", "low", []),
         ("road dug up for pipeline work was never relaid", "road dug for pipeline not relaid", "road damage", "medium", []),
         ("deep potholes filled with rain water, bikes are skidding", "potholes with rain water causing skids", "potholes", "high", ["traffic_danger"]),
         ("speed breaker is broken and asphalt has peeled off", "broken speed breaker and peeled asphalt", "road damage", "low", [])],
  "te": [("ప్రధాన రహదారిపై పెద్ద గుంత ఉంది", "big pothole on main road", "potholes", "medium", []),
         ("రోడ్డు పూర్తిగా పాడైపోయింది, నడవలేకపోతున్నాం", "road completely damaged, cannot walk", "road damage", "medium", []),
         ("ఫుట్‌పాత్ పగిలిపోయింది", "footpath is broken", "footpaths", "low", []),
         ("రోడ్డు మీద గుంతల వల్ల బైక్‌లు జారిపడుతున్నాయి", "bikes slipping due to potholes", "potholes", "high", ["traffic_danger"])],
  "hi": [("मुख्य सड़क पर बड़ा गड्ढा है", "big pothole on main road", "potholes", "medium", []),
         ("सड़क पूरी तरह टूट गई है", "road completely broken", "road damage", "medium", []),
         ("फुटपाथ की टाइलें टूटी हुई हैं", "footpath tiles broken", "footpaths", "low", []),
         ("गड्ढों में पानी भरा है, गाड़ियाँ फिसल रही हैं", "potholes waterlogged, vehicles skidding", "potholes", "high", ["traffic_danger"])],
  "ur": [("مین روڈ پر بڑا گڑھا ہے", "big pothole on main road", "potholes", "medium", []),
         ("سڑک بالکل ٹوٹ چکی ہے", "road completely broken", "road damage", "medium", []),
         ("فٹ پاتھ ٹوٹا ہوا ہے", "footpath broken", "footpaths", "low", [])],
  "tenglish": [("road meeda pedda gunta undi", "big pothole on road", "potholes", "medium", []),
               ("road antha damage ayyindi, bike nadapalekapotunnam", "road fully damaged, cannot ride bike", "road damage", "medium", []),
               ("gunta lo water fill ayyi bikes slip avtunnayi", "pothole filled with water, bikes slipping", "potholes", "high", ["traffic_danger"]),
               ("footpath tiles anni break ayyayi", "footpath tiles broken", "footpaths", "low", [])],
  "hinglish": [("main road pe bada gaddha hai", "big pothole on main road", "potholes", "medium", []),
               ("road poori tarah tooti hui hai yaar", "road completely broken", "road damage", "medium", []),
               ("gaddhe mein paani bhara hai bikes fisal rahi hain", "pothole waterlogged, bikes skidding", "potholes", "high", ["traffic_danger"])]},
 "sanitation": {
  "en": [("garbage has not been collected for days", "garbage not collected for days", "garbage", "medium", []),
         ("the dustbin is overflowing and stinking", "dustbin overflowing and stinking", "bins", "medium", []),
         ("a dead dog is lying on the street", "dead dog lying on street", "dead animals", "high", ["disease_risk"]),
         ("nobody sweeps our street anymore", "street not swept", "sweeping", "low", []),
         ("people are dumping construction debris and waste on the empty plot", "debris and waste dumped on plot", "garbage", "low", []),
         ("the garbage van skips our lane every week", "garbage van skips lane", "garbage", "medium", [])],
  "te": [("చెత్త చాలా రోజులుగా తీయడం లేదు", "garbage not collected for days", "garbage", "medium", []),
         ("చెత్త డబ్బా నిండిపోయి దుర్వాసన వస్తోంది", "bin overflowing and smelling", "bins", "medium", []),
         ("వీధిలో చనిపోయిన కుక్క పడి ఉంది", "dead dog lying in street", "dead animals", "high", ["disease_risk"]),
         ("మా వీధిని ఎవరూ ఊడ్చడం లేదు", "nobody sweeps our street", "sweeping", "low", [])],
  "hi": [("कई दिनों से कचरा नहीं उठाया गया", "garbage not picked for days", "garbage", "medium", []),
         ("कूड़ेदान भरकर बह रहा है और बदबू आ रही है", "bin overflowing and stinking", "bins", "medium", []),
         ("गली में मरा हुआ कुत्ता पड़ा है", "dead dog lying in lane", "dead animals", "high", ["disease_risk"]),
         ("हमारी गली में झाड़ू नहीं लगती", "lane not swept", "sweeping", "low", [])],
  "ur": [("کئی دنوں سے کچرا نہیں اٹھایا گیا", "garbage not picked for days", "garbage", "medium", []),
         ("کوڑے دان بھر گیا ہے اور بدبو آ رہی ہے", "bin full and smelling", "bins", "medium", []),
         ("گلی میں مرا ہوا کتا پڑا ہے", "dead dog in lane", "dead animals", "high", ["disease_risk"])],
  "tenglish": [("chetta teeyadam ledu chala rojulu nunchi", "garbage not collected for many days", "garbage", "medium", []),
               ("dustbin full ayyi smell vastundi", "dustbin full and smelling", "bins", "medium", []),
               ("galli lo chachina kukka padi undi", "dead dog lying in lane", "dead animals", "high", ["disease_risk"]),
               ("garbage van ma galli ki raavadam ledu", "garbage van not coming to our lane", "garbage", "medium", [])],
  "hinglish": [("kai din se kachra nahi uthaya gaya", "garbage not picked for days", "garbage", "medium", []),
               ("dustbin overflow ho raha hai, bahut badbu hai", "dustbin overflowing, bad smell", "bins", "medium", []),
               ("gali mein mara hua kutta pada hai", "dead dog in lane", "dead animals", "high", ["disease_risk"])]},
 "water": {
  "en": [("we have not had water supply for days", "no water supply for days", "no supply", "high", []),
         ("the tap water is dirty and smells bad", "tap water dirty and smelly", "contamination", "high", ["contaminated_water"]),
         ("a water pipeline is leaking and wasting water", "pipeline leaking, water wasted", "leakage", "medium", []),
         ("water pressure is so low that it does not reach the first floor", "very low water pressure", "low pressure", "low", []),
         ("drinking water is coming yellow and many people fell sick", "yellow drinking water, people sick", "contamination", "critical", ["contaminated_water", "disease_risk"]),
         ("water tanker promised by the board never came", "promised water tanker never came", "no supply", "medium", [])],
  "te": [("రోజుల తరబడి నీళ్ళు రావడం లేదు", "no water for days", "no supply", "high", []),
         ("కుళాయి నీళ్ళు మురికిగా వస్తున్నాయి, వాసన వస్తోంది", "tap water dirty and smelling", "contamination", "high", ["contaminated_water"]),
         ("నీటి పైప్‌లైన్ లీక్ అవుతోంది", "water pipeline leaking", "leakage", "medium", []),
         ("నీటి ఒత్తిడి చాలా తక్కువగా ఉంది", "water pressure very low", "low pressure", "low", [])],
  "hi": [("कई दिनों से पानी नहीं आ रहा", "no water for days", "no supply", "high", []),
         ("नल का पानी गंदा और बदबूदार है", "tap water dirty and foul", "contamination", "high", ["contaminated_water"]),
         ("पानी की पाइपलाइन लीक हो रही है", "water pipeline leaking", "leakage", "medium", []),
         ("पानी का प्रेशर बहुत कम है", "water pressure very low", "low pressure", "low", [])],
  "ur": [("کئی دنوں سے پانی نہیں آ رہا", "no water for days", "no supply", "high", []),
         ("نل کا پانی گندا اور بدبودار ہے", "tap water dirty and foul", "contamination", "high", ["contaminated_water"]),
         ("پانی کی پائپ لائن لیک ہو رہی ہے", "water pipeline leaking", "leakage", "medium", [])],
  "tenglish": [("neellu raavadam ledu moodu rojula nunchi", "no water for three days", "no supply", "high", []),
               ("tap water dirty ga vastundi smell kuda undi", "tap water dirty and smelling", "contamination", "high", ["contaminated_water"]),
               ("pipeline leak ayyi water waste avtundi", "pipeline leaking, water wasted", "leakage", "medium", []),
               ("water pressure chala takkuva undi", "water pressure very low", "low pressure", "low", [])],
  "hinglish": [("teen din se paani nahi aa raha", "no water for three days", "no supply", "high", []),
               ("nal ka paani ganda aa raha hai", "tap water coming dirty", "contamination", "high", ["contaminated_water"]),
               ("paani ki pipeline leak ho rahi hai", "water pipeline leaking", "leakage", "medium", [])]},
 "streetlights": {
  "en": [("the streetlight in our lane is not working", "streetlight in lane not working", "not working", "medium", []),
         ("all the street lamps on this road are off at night", "street lamps off at night", "not working", "medium", []),
         ("the streetlight pole is bent and about to fall", "streetlight pole bent, may fall", "damaged pole", "high", ["collapse_risk"]),
         ("streetlights are burning during the day wasting power", "streetlights burning in daytime", "daytime burning", "low", []),
         ("it is pitch dark on the lane, women are scared to walk at night", "dark lane, unsafe for women at night", "not working", "high", []),
         ("the street lamp keeps flickering on and off", "street lamp flickering", "not working", "low", [])],
  "te": [("మా వీధి దీపం పనిచేయడం లేదు", "our streetlight not working", "not working", "medium", []),
         ("రాత్రి వీధి దీపాలు వెలగడం లేదు, చీకటిగా ఉంది", "streetlights not lit at night, dark", "not working", "medium", []),
         ("వీధి దీపం స్తంభం వంగిపోయింది", "streetlight pole bent", "damaged pole", "high", ["collapse_risk"]),
         ("పగలు కూడా వీధి దీపాలు వెలుగుతున్నాయి", "streetlights on during day", "daytime burning", "low", [])],
  "hi": [("हमारी गली की स्ट्रीट लाइट खराब है", "lane streetlight broken", "not working", "medium", []),
         ("रात में सड़क की सारी बत्तियाँ बंद रहती हैं", "all road lights off at night", "not working", "medium", []),
         ("स्ट्रीट लाइट का खंभा झुक गया है", "streetlight pole tilted", "damaged pole", "high", ["collapse_risk"]),
         ("दिन में भी स्ट्रीट लाइट जलती रहती है", "streetlight on during day", "daytime burning", "low", [])],
  "ur": [("ہماری گلی کی اسٹریٹ لائٹ خراب ہے", "lane streetlight broken", "not working", "medium", []),
         ("رات کو سڑک پر اندھیرا رہتا ہے، بتیاں بند ہیں", "road dark at night, lights off", "not working", "medium", []),
         ("اسٹریٹ لائٹ کا کھمبا جھک گیا ہے", "streetlight pole tilted", "damaged pole", "high", ["collapse_risk"])],
  "tenglish": [("street light work avvadam ledu ma galli lo", "streetlight not working in our lane", "not working", "medium", []),
               ("night antha dark ga undi street lights off", "dark all night, streetlights off", "not working", "medium", []),
               ("street light pole vangipoyindi", "streetlight pole bent", "damaged pole", "high", ["collapse_risk"]),
               ("day time lo kuda street lights on lo unnayi", "streetlights on in daytime", "daytime burning", "low", [])],
  "hinglish": [("gali ki street light kharab hai", "lane streetlight broken", "not working", "medium", []),
               ("raat ko poora andhera rehta hai lights band hain", "dark at night, lights off", "not working", "medium", []),
               ("din mein bhi street light jal rahi hai", "streetlight on during day", "daytime burning", "low", [])]},
 "power": {
  "en": [("there has been a power cut since morning", "power cut since morning", "outage", "high", []),
         ("voltage keeps fluctuating and appliances are getting damaged", "voltage fluctuation damaging appliances", "voltage", "medium", []),
         ("the transformer near our colony makes loud noise and smokes", "transformer noisy and smoking", "transformer", "high", ["fire"]),
         ("an electric line is hanging very low over the road", "electric line hanging low over road", "sparking lines", "high", ["live_wire"]),
         ("frequent power outages every evening for a week", "daily evening power outages", "outage", "medium", []),
         ("our area has no electricity and the helpline is not answering", "no electricity, helpline not answering", "outage", "high", [])],
  "te": [("ఉదయం నుండి కరెంట్ లేదు", "no power since morning", "outage", "high", []),
         ("వోల్టేజ్ హెచ్చుతగ్గులతో ఇంట్లో వస్తువులు పాడవుతున్నాయి", "voltage fluctuation damaging appliances", "voltage", "medium", []),
         ("మా కాలనీ దగ్గర ట్రాన్స్‌ఫార్మర్ నుండి పొగ వస్తోంది", "smoke from transformer near colony", "transformer", "high", ["fire"]),
         ("విద్యుత్ తీగ రోడ్డు మీద చాలా కిందకు వేలాడుతోంది", "power line hanging low over road", "sparking lines", "high", ["live_wire"])],
  "hi": [("सुबह से बिजली नहीं है", "no power since morning", "outage", "high", []),
         ("वोल्टेज ऊपर नीचे हो रहा है, सामान खराब हो रहा है", "voltage fluctuating, appliances damaged", "voltage", "medium", []),
         ("कॉलोनी के पास ट्रांसफार्मर से धुआँ निकल रहा है", "transformer smoking near colony", "transformer", "high", ["fire"]),
         ("बिजली की लाइन सड़क पर बहुत नीचे लटक रही है", "power line hanging low over road", "sparking lines", "high", ["live_wire"])],
  "ur": [("صبح سے بجلی نہیں ہے", "no power since morning", "outage", "high", []),
         ("وولٹیج اوپر نیچے ہو رہا ہے", "voltage fluctuating", "voltage", "medium", []),
         ("ٹرانسفارمر سے دھواں نکل رہا ہے", "transformer smoking", "transformer", "high", ["fire"])],
  "tenglish": [("morning nunchi current ledu", "no power since morning", "outage", "high", []),
               ("current poyindi malli malli, voltage problem undi", "power keeps going, voltage problem", "voltage", "medium", []),
               ("transformer nunchi smoke vastundi", "smoke from transformer", "transformer", "high", ["fire"]),
               ("current wire chala kinda vrelaadutundi road meeda", "power wire hanging low over road", "sparking lines", "high", ["live_wire"])],
  "hinglish": [("subah se light nahi hai", "no power since morning", "outage", "high", []),
               ("voltage bahut fluctuate ho raha hai fridge kharab ho gaya", "voltage fluctuation damaged fridge", "voltage", "medium", []),
               ("transformer se dhuan aa raha hai", "smoke from transformer", "transformer", "high", ["fire"])]},
 "drainage": {
  "en": [("the drain is overflowing onto the road", "drain overflowing onto road", "overflow", "high", ["sewage_overflow"]),
         ("sewage water is entering our houses", "sewage entering houses", "overflow", "critical", ["sewage_overflow", "flooding"]),
         ("the drain is blocked and water is stagnant", "blocked drain, stagnant water", "blocked drain", "medium", ["disease_risk"]),
         ("the manhole cover is missing and it is dangerous", "manhole cover missing, dangerous", "open manhole", "high", ["open_manhole"]),
         ("the nala is choked with plastic and silt", "nala choked with plastic and silt", "blocked drain", "medium", []),
         ("sewer line is broken and stinking near the school", "broken sewer line stinking near school", "overflow", "high", ["sewage_overflow", "near_school"])],
  "te": [("మురుగు కాలువ పొంగి రోడ్డు మీదకు వస్తోంది", "drain overflowing onto road", "overflow", "high", ["sewage_overflow"]),
         ("మురుగు నీరు ఇళ్లలోకి వస్తోంది", "sewage water entering houses", "overflow", "critical", ["sewage_overflow", "flooding"]),
         ("డ్రైనేజీ బ్లాక్ అయ్యి నీళ్ళు నిలిచిపోయాయి", "drain blocked, water stagnant", "blocked drain", "medium", ["disease_risk"]),
         ("మ్యాన్‌హోల్ మూత లేదు, ప్రమాదకరంగా ఉంది", "manhole lid missing, dangerous", "open manhole", "high", ["open_manhole"])],
  "hi": [("नाली ओवरफ्लो होकर सड़क पर आ रही है", "drain overflowing onto road", "overflow", "high", ["sewage_overflow"]),
         ("सीवर का पानी घरों में घुस रहा है", "sewage entering homes", "overflow", "critical", ["sewage_overflow", "flooding"]),
         ("नाली जाम है और पानी रुका हुआ है", "drain clogged, water stagnant", "blocked drain", "medium", ["disease_risk"]),
         ("मैनहोल का ढक्कन गायब है", "manhole cover missing", "open manhole", "high", ["open_manhole"])],
  "ur": [("نالی ابل کر سڑک پر آ رہی ہے", "drain overflowing onto road", "overflow", "high", ["sewage_overflow"]),
         ("گٹر کا پانی گھروں میں آ رہا ہے", "sewage entering homes", "overflow", "critical", ["sewage_overflow", "flooding"]),
         ("نالی بند ہے اور پانی رکا ہوا ہے", "drain blocked, water stagnant", "blocked drain", "medium", ["disease_risk"])],
  "tenglish": [("drainage overflow ayyi road meedaki vastundi", "drainage overflowing onto road", "overflow", "high", ["sewage_overflow"]),
               ("nala block ayyindi, neellu nilichipoyayi", "nala blocked, water stagnant", "blocked drain", "medium", ["disease_risk"]),
               ("manhole moota ledu chala danger ga undi", "manhole lid missing, very dangerous", "open manhole", "high", ["open_manhole"]),
               ("drainage water intlo ki vastundi", "drainage water entering house", "overflow", "critical", ["sewage_overflow", "flooding"])],
  "hinglish": [("naali overflow hokar road pe aa rahi hai", "drain overflowing onto road", "overflow", "high", ["sewage_overflow"]),
               ("gutter ka paani ghar mein aa raha hai", "sewage entering house", "overflow", "critical", ["sewage_overflow", "flooding"]),
               ("naali jam hai machhar badh gaye", "drain clogged, mosquitoes increased", "blocked drain", "medium", ["disease_risk"])]},
 "traffic": {
  "en": [("the traffic signal at the junction is not working", "junction traffic signal not working", "signal failure", "high", ["traffic_danger"]),
         ("this junction is very dangerous with no zebra crossing", "dangerous junction, no zebra crossing", "dangerous junction", "medium", ["traffic_danger"]),
         ("vehicles drive on the wrong side every evening", "wrong-side driving every evening", "dangerous junction", "medium", ["traffic_danger"]),
         ("the speed limit sign board has fallen down", "speed limit sign fallen", "signage", "low", []),
         ("huge traffic jam daily because of illegal parking near the market", "daily jam from illegal parking near market", "dangerous junction", "low", [])],
  "te": [("జంక్షన్ వద్ద ట్రాఫిక్ సిగ్నల్ పనిచేయడం లేదు", "junction traffic signal not working", "signal failure", "high", ["traffic_danger"]),
         ("ఈ కూడలి చాలా ప్రమాదకరంగా ఉంది, జీబ్రా క్రాసింగ్ లేదు", "dangerous junction, no zebra crossing", "dangerous junction", "medium", ["traffic_danger"]),
         ("సూచిక బోర్డు కింద పడిపోయింది", "sign board fallen", "signage", "low", [])],
  "hi": [("चौराहे पर ट्रैफिक सिग्नल काम नहीं कर रहा", "junction signal not working", "signal failure", "high", ["traffic_danger"]),
         ("यह चौराहा बहुत खतरनाक है, ज़ेबरा क्रॉसिंग नहीं है", "dangerous junction, no zebra crossing", "dangerous junction", "medium", ["traffic_danger"]),
         ("गाड़ियाँ रोज़ गलत दिशा में चलती हैं", "vehicles drive wrong way daily", "dangerous junction", "medium", ["traffic_danger"])],
  "ur": [("چوراہے پر ٹریفک سگنل کام نہیں کر رہا", "junction signal not working", "signal failure", "high", ["traffic_danger"]),
         ("یہ چوراہا بہت خطرناک ہے", "this junction is very dangerous", "dangerous junction", "medium", ["traffic_danger"])],
  "tenglish": [("junction lo traffic signal work avvadam ledu", "junction signal not working", "signal failure", "high", ["traffic_danger"]),
               ("wrong side lo vehicles vastunnayi daily", "vehicles coming wrong side daily", "dangerous junction", "medium", ["traffic_danger"]),
               ("ee junction chala danger, zebra crossing ledu", "dangerous junction, no zebra crossing", "dangerous junction", "medium", ["traffic_danger"])],
  "hinglish": [("signal kaam nahi kar raha junction pe", "signal not working at junction", "signal failure", "high", ["traffic_danger"]),
               ("roz wrong side se gaadiyan aati hain", "vehicles come wrong side daily", "dangerous junction", "medium", ["traffic_danger"])]},
 "health": {
  "en": [("mosquitoes have increased a lot and there is no fogging", "many mosquitoes, no fogging", "mosquitoes", "medium", ["disease_risk"]),
         ("many people in our colony have dengue fever", "dengue cases in colony", "mosquitoes", "high", ["disease_risk"]),
         ("the government hospital ward is dirty and has no doctors", "government hospital dirty, no doctors", "hospital conditions", "medium", ["near_hospital"]),
         ("a food stall is selling stale food and people fell ill", "stall selling stale food, people ill", "food safety", "high", ["disease_risk"]),
         ("the primary health centre has no medicines in stock", "health centre out of medicines", "hospital conditions", "medium", [])],
  "te": [("దోమలు బాగా పెరిగాయి, ఫాగింగ్ చేయడం లేదు", "mosquitoes increased, no fogging", "mosquitoes", "medium", ["disease_risk"]),
         ("మా కాలనీలో చాలా మందికి డెంగ్యూ జ్వరం వచ్చింది", "many dengue cases in colony", "mosquitoes", "high", ["disease_risk"]),
         ("ప్రభుత్వ ఆసుపత్రిలో డాక్టర్లు లేరు, శుభ్రత లేదు", "government hospital no doctors, unclean", "hospital conditions", "medium", ["near_hospital"])],
  "hi": [("मच्छर बहुत बढ़ गए हैं, फॉगिंग नहीं हो रही", "mosquitoes increased, no fogging", "mosquitoes", "medium", ["disease_risk"]),
         ("कॉलोनी में कई लोगों को डेंगू हो गया है", "dengue cases in colony", "mosquitoes", "high", ["disease_risk"]),
         ("सरकारी अस्पताल में डॉक्टर नहीं हैं और गंदगी है", "government hospital no doctors, dirty", "hospital conditions", "medium", ["near_hospital"])],
  "ur": [("مچھر بہت بڑھ گئے ہیں، فوگنگ نہیں ہو رہی", "mosquitoes increased, no fogging", "mosquitoes", "medium", ["disease_risk"]),
         ("سرکاری اسپتال میں ڈاکٹر نہیں ہیں", "no doctors at government hospital", "hospital conditions", "medium", ["near_hospital"])],
  "tenglish": [("domalu chala ekkuva ayyayi fogging cheyyatledu", "too many mosquitoes, no fogging", "mosquitoes", "medium", ["disease_risk"]),
               ("colony lo chala mandiki dengue fever vachindi", "many dengue cases in colony", "mosquitoes", "high", ["disease_risk"]),
               ("govt hospital lo doctors leru", "no doctors in government hospital", "hospital conditions", "medium", ["near_hospital"])],
  "hinglish": [("machhar bahut badh gaye fogging nahi hoti", "mosquitoes increased, no fogging", "mosquitoes", "medium", ["disease_risk"]),
               ("sarkari hospital mein doctor hi nahi hai", "no doctor in government hospital", "hospital conditions", "medium", ["near_hospital"])]},
 "education": {
  "en": [("the government school toilets are broken and unusable", "government school toilets broken", "toilets", "medium", ["near_school"]),
         ("the school building roof is leaking and cracked", "school roof leaking and cracked", "building", "high", ["collapse_risk", "near_school"]),
         ("there is no drinking water for children in the school", "no drinking water for school children", "drinking water", "high", ["near_school"]),
         ("teachers are not coming to the government school regularly", "teachers absent at government school", "building", "low", [])],
  "te": [("ప్రభుత్వ పాఠశాలలో మరుగుదొడ్లు పాడైపోయాయి", "government school toilets damaged", "toilets", "medium", ["near_school"]),
         ("పాఠశాల భవనం పైకప్పు కారుతోంది", "school building roof leaking", "building", "high", ["collapse_risk", "near_school"]),
         ("బడిలో పిల్లలకు తాగునీరు లేదు", "no drinking water for children at school", "drinking water", "high", ["near_school"])],
  "hi": [("सरकारी स्कूल के शौचालय टूटे हुए हैं", "government school toilets broken", "toilets", "medium", ["near_school"]),
         ("स्कूल की छत से पानी टपक रहा है और दरारें हैं", "school roof leaking with cracks", "building", "high", ["collapse_risk", "near_school"]),
         ("स्कूल में बच्चों के लिए पीने का पानी नहीं है", "no drinking water for school children", "drinking water", "high", ["near_school"])],
  "ur": [("سرکاری اسکول کے بیت الخلا ٹوٹے ہوئے ہیں", "government school toilets broken", "toilets", "medium", ["near_school"]),
         ("اسکول کی چھت ٹپک رہی ہے", "school roof leaking", "building", "high", ["collapse_risk", "near_school"])],
  "tenglish": [("govt school lo toilets anni damage", "government school toilets damaged", "toilets", "medium", ["near_school"]),
               ("school lo pillalaki drinking water ledu", "no drinking water for school children", "drinking water", "high", ["near_school"]),
               ("school roof leak avtundi cracks unnayi", "school roof leaking with cracks", "building", "high", ["collapse_risk", "near_school"])],
  "hinglish": [("sarkari school ke toilet tute hue hain", "government school toilets broken", "toilets", "medium", ["near_school"]),
               ("school mein bachon ke liye peene ka paani nahi", "no drinking water for school children", "drinking water", "high", ["near_school"])]},
 "town_planning": {
  "en": [("someone has encroached the footpath with a permanent shop", "footpath encroached by permanent shop", "encroachment", "low", []),
         ("an illegal extra floor is being built without permission", "illegal extra floor without permission", "illegal construction", "medium", []),
         ("a building is being constructed on the lake bed", "construction on lake bed", "illegal construction", "medium", ["flooding"]),
         ("the park land is being occupied for private use", "park land occupied privately", "encroachment", "low", [])],
  "te": [("ఫుట్‌పాత్‌ను దుకాణంతో ఆక్రమించారు", "footpath encroached by shop", "encroachment", "low", []),
         ("అనుమతి లేకుండా అదనపు అంతస్తు నిర్మిస్తున్నారు", "extra floor built without permission", "illegal construction", "medium", []),
         ("చెరువు భూమిలో భవనం కడుతున్నారు", "building on lake land", "illegal construction", "medium", ["flooding"])],
  "hi": [("फुटपाथ पर दुकान से कब्ज़ा किया गया है", "footpath occupied by shop", "encroachment", "low", []),
         ("बिना अनुमति अवैध मंज़िल बनाई जा रही है", "illegal floor built without permission", "illegal construction", "medium", []),
         ("पार्क की ज़मीन पर कब्ज़ा हो रहा है", "park land being encroached", "encroachment", "low", [])],
  "ur": [("فٹ پاتھ پر دکان نے قبضہ کر لیا ہے", "footpath occupied by shop", "encroachment", "low", []),
         ("بغیر اجازت غیر قانونی منزل بن رہی ہے", "illegal floor without permission", "illegal construction", "medium", [])],
  "tenglish": [("footpath ni shop vaallu occupy chesaru", "footpath occupied by shop owners", "encroachment", "low", []),
               ("permission lekunda extra floor kadutunnaru", "extra floor built without permission", "illegal construction", "medium", []),
               ("cheruvu land lo building kadutunnaru", "building on lake land", "illegal construction", "medium", ["flooding"])],
  "hinglish": [("footpath pe dukaan ne kabza kar liya", "footpath occupied by shop", "encroachment", "low", []),
               ("bina permission ke extra floor ban raha hai", "extra floor without permission", "illegal construction", "medium", [])]},
 "other": {
  "en": [("my pension has not been credited for three months", "pension not credited for three months", "", "low", []),
         ("i want to change the name on my ration card", "change name on ration card", "", "low", []),
         ("the bus conductor was rude to passengers", "bus conductor rude", "", "low", []),
         ("my neighbour's dog barks all night", "neighbour's dog barks at night", "", "low", [])],
  "te": [("మూడు నెలలుగా నా పెన్షన్ రాలేదు", "pension not received for three months", "", "low", []),
         ("రేషన్ కార్డులో పేరు మార్చాలి", "need to change name in ration card", "", "low", [])],
  "hi": [("तीन महीने से मेरी पेंशन नहीं आई", "pension not received for three months", "", "low", []),
         ("राशन कार्ड में नाम बदलवाना है", "need to change name on ration card", "", "low", [])],
  "ur": [("تین مہینے سے میری پنشن نہیں آئی", "pension not received for three months", "", "low", [])],
  "tenglish": [("na pension moodu nelalu nunchi raaledu", "pension not received for three months", "", "low", []),
               ("ration card lo name change cheyali", "need to change name on ration card", "", "low", [])],
  "hinglish": [("teen mahine se pension nahi aayi", "pension not received for three months", "", "low", [])]},
}

LANG_META = {"en": ("en", "native", False), "te": ("te", "native", False), "hi": ("hi", "native", False),
             "ur": ("ur", "native", False), "tenglish": ("te", "latin", True), "hinglish": ("hi", "latin", True)}

LANDMARKS = ["near the bus stop", "opposite the temple", "beside the ZPHS school", "near the metro station",
             "behind the ration shop", "near the mosque", "next to the community hall", "at the X roads"]
FRAME = {
 "en": ["{issue} in {loc} {lm}.", "Please help, {issue} at {loc}, {lm}. It has been {dur}.",
        "Complaint: {issue}. Location {loc}. Since {dur}.", "{issue} near our house in {loc}. Nobody is responding."],
 "te": ["{loc} లో {issue}.", "దయచేసి సహాయం చేయండి, {loc} లో {issue}.", "{loc} {lm_te} {issue}. {dur_te} నుండి ఇలా ఉంది."],
 "hi": ["{loc} में {issue}।", "कृपया मदद करें, {loc} में {issue}।", "{loc} में {issue}। {dur_hi} से यही हाल है।"],
 "ur": ["{loc} میں {issue}۔", "براہ کرم مدد کریں، {loc} میں {issue}۔"],
 "tenglish": ["{loc} lo {issue} sir", "please help {loc} {lm} {issue}", "{issue}, {loc} area lo, {dur} nunchi"],
 "hinglish": ["{loc} mein {issue}", "please help karo, {loc} {lm} {issue}", "{issue} {loc} area mein, {dur} se"],
}
DUR = ["2 days", "3 days", "a week", "two weeks", "a month"]
DUR_TE = ["రెండు రోజుల", "మూడు రోజుల", "వారం రోజుల"]
DUR_HI = ["दो दिन", "तीन दिन", "एक हफ्ते"]
LM_TE = ["బస్ స్టాప్ దగ్గర", "గుడి ఎదురుగా", "స్కూల్ పక్కన"]


def build(n_per_phrase: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    locs = json.loads((ROOT / "data" / "geo" / "localities.json").read_text())
    rows, seen = [], set()
    for cat, langs in B.items():
        for lk, phrases in langs.items():
            lang, script, mixed = LANG_META[lk]
            for pi, (issue, gloss, sub, urg, hz) in enumerate(phrases):
                for _ in range(n_per_phrase):
                    loc = rng.choice(locs)
                    lm = rng.choice(LANDMARKS)
                    dur = rng.choice(DUR)
                    text = rng.choice(FRAME[lk]).format(issue=issue, loc=loc["name"], lm=lm, dur=dur,
                                                        lm_te=rng.choice(LM_TE), dur_te=rng.choice(DUR_TE),
                                                        dur_hi=rng.choice(DUR_HI))
                    if rng.random() < 0.15 and lk in ("en", "tenglish", "hinglish"):
                        text = text.lower()
                    if text in seen:
                        continue
                    seen.add(text)
                    rows.append({"text_original": text, "language": lang, "script": script, "is_code_mixed": mixed,
                                 "lang_bucket": "code_mixed" if mixed else lang,
                                 "text_en": f"{gloss[0].upper()}{gloss[1:]} in {loc['name']}.",
                                 "category": cat, "sub_department": sub, "urgency": urg, "hazards": hz,
                                 "locality": loc["name"], "ward_id": loc["id"], "landmark": lm,
                                 "phrase_id": f"{cat}:{lk}:{pi}", "source": "template"})
    rng.shuffle(rows)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-per-phrase", type=int, default=6)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rows = build(a.n_per_phrase, a.seed)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    from collections import Counter
    print(f"wrote {len(rows)} rows -> {OUT}")
    print("by category:", dict(Counter(r["category"] for r in rows)))
    print("by language:", dict(Counter(r["lang_bucket"] for r in rows)))


if __name__ == "__main__":
    main()
