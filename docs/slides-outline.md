# JanaVaani slides outline

Ten slides for Neural Storm (JNTUH), problem HI-02. All numbers come from B's `ml/models/metrics.json` and `docs/LAPTOP_B_HANDOVER.md`, unless marked. **Check them again after the final retrain.** Fill in the blanks marked `____`.

## 1. Problem

**A citizen with a problem shouldn't need to know which office, which form, or which language.**

- Complaints get lost between departments
- Portals assume English and literacy
- Duplicate reports bury the urgent ones
- A case can be closed without being fixed, and nobody checks

_Visual:_ a citizen speaking Telugu at a form written in English.

_To add:_ one cited statistic about grievance handling in Telangana or India, if the team can source one. Don't use an unsourced figure.

## 2. Solution

**JanaVaani: speak a complaint in your language, and it's tracked until you confirm it's fixed.**

- Voice-first in Telugu, Hindi, Urdu, English and mixed Tenglish or Hinglish
- AI turns speech into a structured, correctly routed, prioritized case
- The citizen, not the office, confirms the fix

_Visual:_ one line from a spoken Telugu sentence to a ticket.

## 3. Four portals, one engine

| Portal | Who | What they do |
|---|---|---|
| Citizen | Citizens, guests | Report by voice, photo, chat or QR, then track, verify, appeal |
| Department | Officers, supervisors | Inbox, AI brief, replies, proof, review queues |
| Admin | Government admins | KPIs, maps, alerts, audit, AI monitoring |
| Public | Everyone | Anonymized heatmap, resolution rates, report cards |

_Visual:_ four screenshots around the AI engine.

## 4. AI pipeline

**Complaint to ticket, with humans deciding what matters.**

1. Safety first: mask personal data, scan for emergencies, check spam
2. Conversational intake
3. Core analysis
4. Three-way routing vote: our classifier, Gemini, Groq
5. Duplicate check by meaning, distance and time
6. Explainable priority score
7. SLA, assignment, audit entry, reply in the citizen's language

_Key line:_ every AI step has a fallback, and the system keeps working with both AI providers down.

_Don't claim_ the under-5-second target until it's measured with live AI keys. The 29 ms p50 was measured offline and has no LLM calls in it.

## 5. Our own model

**We trained our own department classifier and tested it on people's writing, not just our own data.**

| Test set | Size | Accuracy | Macro-F1 |
|---|---|---|---|
| Synthetic, unseen phrasings | 392 | 77.8% | 78.2% |
| Human-written | 48 | 75.0% | 77.6% |

| Language | Synthetic | Human-written |
|---|---|---|
| English | 94.1% | 71.4% |
| Code-mixed | 92.2% | 90.0% |
| Telugu | 70.8% | 77.8% |
| Hindi | 68.8% | 62.5% |
| Urdu | 42.4% | 71.4% |

- TF-IDF plus calibrated logistic regression, trained on 2,052 synthetic examples
- Routing bands work: 95.9% correct when confident (0.75 or above), 42.9% below 0.50, so uncertain cases go to people
- Human corrections retrain the model

_Say it plainly:_ per-language human samples are small (7–14 each), and Urdu is the weakest on synthetic data.

_Note:_ the spec planned embeddings, but the shipped model is TF-IDF because the embedding model wasn't available in the build. Update this slide if that changes.

## 6. Trust layer

**The system is designed not to take anyone's word for it, including ours.**

- **AI checks resolution photos:** catches a reused citizen photo, and flags proof taken far from the site
- **The citizen confirms:** closure needs their yes, or they can reject and reopen
- **Tamper-evident audit:** every event is hash-chained, and any edit breaks the chain
- **Humans decide:** critical cases, low-confidence routing and disputes
- **Privacy:** personal data masked, public map blurred by about 75 m, no text or IDs

_Visual:_ the red break in the audit chain.

## 7. Impact

**What changes for each person.**

| Who | Before | With JanaVaani |
|---|---|---|
| Citizen | Finds the right office, in the right language | Speaks, and is routed automatically |
| Officer | Reads and translates everything | Gets a translated case and AI brief |
| Supervisor | Finds out when it's too late | Gets automatic escalation at SLA breach |
| Commissioner | Waits for reports | Sees spikes and overdue cases live |
| Public | Takes it on trust | Sees resolution rates by department and zone |

_Demonstrated with synthetic data:_ 32 reports merged into one Miyapur incident, a contaminated-water spike detected in Charminar, and 396 escalations firing on a +48 h time jump.

_Don't claim_ real-world time saved or complaints resolved. There's no pilot data yet.

## 8. Tech stack, all free

| Layer | Tools |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind, Leaflet, Recharts |
| Backend | FastAPI, SQLAlchemy, Python |
| ML | scikit-learn, trained on CPU |
| AI | Gemini and Groq free tiers |
| Data | Supabase: Postgres, PostGIS, pgvector |
| Hosting | Vercel Hobby, Hugging Face Spaces |
| Maps | OpenStreetMap |

_Key line:_ no paid APIs, and no SMS or WhatsApp costs.

## 9. Team

| Name | Built |
|---|---|
| ____ | Landing, citizen portal, shared foundation |
| ____ | AI engine, database, API, trained model |
| ____ | Department, admin and public portals |

_Team name, college and contact:_ ____

## 10. What's next

- Pilot with one GHMC ward
- Official jurisdiction mapping in place of the demo wards
- A larger human-written test set, especially Urdu
- Surge mode for floods, and root-cause links between incidents

_Close:_ **Every complaint, in every language.**
