"""Localized text helper: built-in phrasebook for fixed system messages (works offline), LLM for free text."""
from . import gateway, prompts
from pydantic import BaseModel

PHRASES = {
    "Complaint registered": {"te": "ఫిర్యాదు నమోదైంది", "hi": "शिकायत दर्ज हुई", "ur": "شکایت درج ہو گئی"},
    "Status updated": {"te": "స్థితి నవీకరించబడింది", "hi": "स्थिति अपडेट हुई", "ur": "صورتحال اپ ڈیٹ ہوئی"},
    "Please confirm the fix": {"te": "దయచేసి పరిష్కారాన్ని నిర్ధారించండి", "hi": "कृपया समाधान की पुष्टि करें", "ur": "براہ کرم حل کی تصدیق کریں"},
    "More citizens reported this": {"te": "మరింత మంది పౌరులు దీనిని నివేదించారు", "hi": "और नागरिकों ने इसकी शिकायत की", "ur": "مزید شہریوں نے اس کی شکایت کی"},
    "We are sorry. This looks like an emergency. Please call the numbers below right now.": {
        "te": "క్షమించండి. ఇది అత్యవసర పరిస్థితిలా ఉంది. దయచేసి వెంటనే కింది నంబర్లకు కాల్ చేయండి.",
        "hi": "यह आपात स्थिति लगती है। कृपया अभी नीचे दिए नंबरों पर कॉल करें।",
        "ur": "یہ ہنگامی صورتحال لگتی ہے۔ براہ کرم ابھی نیچے دیے گئے نمبروں پر کال کریں۔"},
    "Thank you. Please check the details and confirm your complaint.": {
        "te": "ధన్యవాదాలు. దయచేసి వివరాలు చూసి మీ ఫిర్యాదును నిర్ధారించండి.",
        "hi": "धन्यवाद। कृपया विवरण देखकर अपनी शिकायत की पुष्टि करें।",
        "ur": "شکریہ۔ براہ کرم تفصیلات دیکھ کر اپنی شکایت کی تصدیق کریں۔"},
    "Your complaint has been submitted.": {"te": "మీ ఫిర్యాదు సమర్పించబడింది.", "hi": "आपकी शिकायत जमा हो गई है।", "ur": "آپ کی شکایت جمع ہو گئی ہے۔"},
    "Similar complaints were already reported nearby. Would you like to add your voice to one of them?": {
        "te": "దగ్గరలో ఇలాంటి ఫిర్యాదులు ఇప్పటికే ఉన్నాయి. వాటిలో ఒకదానికి మీ మద్దతు జోడించాలనుకుంటున్నారా?",
        "hi": "पास में ऐसी शिकायतें पहले से दर्ज हैं। क्या आप उनमें से किसी में अपनी आवाज़ जोड़ना चाहेंगे?",
        "ur": "قریب میں ایسی شکایات پہلے سے درج ہیں۔ کیا آپ ان میں سے کسی میں اپنی آواز شامل کرنا چاہیں گے؟"},
    "Could you add a photo of the problem? It helps the officer. You can also skip.": {
        "te": "సమస్య ఫోటో జోడించగలరా? అది అధికారికి సహాయపడుతుంది. వద్దనుకుంటే దాటవేయవచ్చు.",
        "hi": "क्या आप समस्या की एक फ़ोटो जोड़ सकते हैं? इससे अधिकारी को मदद मिलती है। चाहें तो छोड़ सकते हैं।",
        "ur": "کیا آپ مسئلے کی ایک تصویر شامل کر سکتے ہیں؟ اس سے افسر کو مدد ملتی ہے۔ چاہیں تو چھوڑ سکتے ہیں۔"},
    "Please tell me about the problem you are facing.": {"te": "మీరు ఎదుర్కొంటున్న సమస్య గురించి చెప్పండి.", "hi": "कृपया अपनी समस्या बताइए।", "ur": "براہ کرم اپنا مسئلہ بتائیں۔"},
    "Cancelled. You can start a new complaint any time.": {"te": "రద్దు చేయబడింది. మీరు ఎప్పుడైనా కొత్త ఫిర్యాదు ప్రారంభించవచ్చు.", "hi": "रद्द कर दिया गया। आप कभी भी नई शिकायत शुरू कर सकते हैं।", "ur": "منسوخ کر دیا گیا۔ آپ کسی بھی وقت نئی شکایت شروع کر سکتے ہیں۔"},
}


class _Loc(BaseModel):
    original: str
    en: str


def localize(text_en: str, lang: str, use_llm: bool = True) -> dict:
    if lang == "en" or not lang:
        return {"original": text_en, "en": text_en, "lang": "en"}
    if text_en in PHRASES and lang in PHRASES[text_en]:
        return {"original": PHRASES[text_en][lang], "en": text_en, "lang": lang}
    if use_llm:
        res, _ = gateway.run("localize_reply", prompts.LOCALIZE.format(lang=lang, text=text_en), _Loc)
        if res:
            return {"original": res["original"], "en": text_en, "lang": lang}
    return {"original": text_en, "en": text_en, "lang": "en"}   # honest fallback: English, labelled as such
