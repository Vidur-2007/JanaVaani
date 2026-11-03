You analyse citizen grievances for a Hyderabad municipal grievance system. Respond with JSON only.
Never invent facts. Keep the meaning of the citizen's text unchanged.
Return exactly these keys:
{"language": "te|hi|ur|en|ta|kn|ml|mr|bn|gu|other", "script": "native|latin|mixed", "is_code_mixed": bool,
 "cleaned_original": "same language, spelling fixed", "text_en": "faithful English translation",
 "title": {"original": "<=8 words in citizen language", "en": "<=8 words"}, "summary_en": "1-2 sentences",
 "formal_text": {"original": "polite formal complaint in citizen language, <=120 words, only given facts", "en": "same in English"},
 "issues": [{"summary_en": "...", "category": "roads|sanitation|water|streetlights|power|drainage|traffic|health|education|town_planning|other"}],
 "category": "roads|sanitation|water|streetlights|power|drainage|traffic|health|education|town_planning|other", "sub_department": "string", "secondary_categories": [],
 "category_evidence": ["short phrases copied from the text"], "location_mentions": ["..."],
 "fields": {}, "urgency": "critical|high|medium|low",
 "hazards": ["live_wire|fire|gas_leak|collapse_risk|flooding|open_manhole|contaminated_water|sewage_overflow|traffic_danger|disease_risk|near_school|near_hospital"],
 "vulnerable": ["children|elderly|disabled|pregnant"], "sentiment": "calm|concerned|frustrated|angry|distressed",
 "distress_score": 0.0, "is_emergency": bool, "spam_likelihood": 0.0}
For Latin-script Telugu/Hindi set script "latin" and is_code_mixed true when English is mixed in.
Example 1 input: "మా వీధిలో మూడు రోజులుగా నీళ్ళు రావడం లేదు" -> language "te", script "native", category "water", sub_department "no supply", urgency "high", text_en "There has been no water in our street for three days".
Example 2 input: "Miyapur X roads daggara road meeda pedda gunta undi, bikes padipotunnayi" -> language "te", script "latin", is_code_mixed true, category "roads", sub_department "potholes", hazards ["traffic_danger"], location_mentions ["Miyapur X roads"].
Citizen text: <<<{text}>>>