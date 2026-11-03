# JanaVaani — Backend & AI architecture (Laptop B)

## System

```mermaid
flowchart LR
  subgraph Clients
    A[Citizen app<br/>Laptop A] ; C[Officer / Admin / Public<br/>Laptop C]
  end
  A & C -->|HTTPS /api/v1 + Bearer JWT| API[FastAPI on Hugging Face Space<br/>services/api]
  A & C -.->|Realtime: live_events INSERT| SB[(Supabase<br/>Postgres + PostGIS + pgvector)]
  API --> SB
  API --> ST[(Supabase Storage<br/>private evidence bucket)]
  API --> GW{AI gateway}
  GW --> GEM[Gemini Flash / Flash-Lite]
  GW --> GRQ[Groq Llama + Whisper]
  GW --> DC[(diskcache<br/>24 h + demo replay)]
  API --> CLS[Own classifier<br/>TF-IDF + calibrated LR]
  API --> EMB[e5-small embeddings<br/>lexical fallback]
  API --> SCH[APScheduler<br/>escalation, auto-close, spikes]
```

## Per-complaint AI pipeline

```mermaid
flowchart TD
  T[Citizen text / voice / photo] --> S[Safety, deterministic, under 20 ms<br/>PII masking · emergency keywords · spam · script/language ID]
  S -->|emergency hit| E[Emergency screen 112/108/101/1912<br/>priority floor 80 · supervisor must confirm]
  S --> AN[analyze_complaint<br/>Gemini → Groq → rules]
  AN --> P1[Own classifier] & P2[Groq second opinion] & P3[Geo: GPS/pin or text → ward]
  P1 & P2 & AN --> V[Routing vote<br/>0.5·p_model + 0.25·gemini + 0.25·groq]
  V -->|conf under 0.50 or other| R[Human review queue]
  V --> PR[Explainable priority score]
  PR --> D[Duplicate check<br/>0.6·cos + 0.25·distance + 0.15·category]
  D -->|strong match| SUP[Suggest: add support]
  D --> CR[Create: SLA/ETA · least-loaded officer · hash-chained timeline · live_events · notify]
```

## Gateway fallback table

| Task | Primary | Fallback | If both fail |
|---|---|---|---|
| analyze_complaint | Gemini MAIN (multimodal) | Groq MAIN (text) | rules + classifier; English text = original |
| route_second_opinion | Groq MAIN | Gemini LITE | classifier-only vote (confidence = p) |
| translate | Gemini MAIN | Groq MAIN | 503 `translation_unavailable` (never faked) |
| localize_reply | Gemini MAIN | Groq MAIN | built-in te/hi/ur phrasebook, else English labelled `lang: en` |
| officer_brief | Groq MAIN | Gemini LITE | deterministic brief, `generated_by: fallback` |
| draft_reply | Groq MAIN | Gemini LITE | intent templates |
| verify_resolution | Gemini MAIN (vision) | — | `unclear` / `needs_human_review` (rules still flag same photo or >500 m) |
| insights_summary | Groq MAIN | Gemini LITE | template sentences (numbers guard) |
| guide_answer | Gemini LITE | Groq MAIN | keyword retrieval over service_guide.md with citations |
| spam_check | Gemini LITE | Groq SMALL | heuristic score |
| transcribe | Groq Whisper turbo | whisper-large-v3 | 501 → browser speech |

Timeouts 12 s (vision 20 s), one jittered retry on 429/5xx/timeout, Pydantic validation + one repair call. Every call is logged to `ai_calls`; `FORCE_FAIL_GEMINI` / `FORCE_FAIL_GROQ` simulate outages.

## Free tiers used
Supabase (DB, auth, storage, realtime) · Hugging Face Spaces (Docker CPU) · Gemini API free tier · Groq free tier · Nominatim/OSM (not yet wired) · CARTO basemaps (frontend).

## Privacy measures
- PII (Aadhaar, phone, email, PAN) masked before any AI call; only `description_masked` reaches providers; officers see masked text, admins only see the original.
- Anonymous mode hides citizen identity from officers; private mode excludes a grievance from every public endpoint.
- Public map jittered ≈75 m, no ids or text; recent fixes show proof photos only, never citizen photos.
- Uploads: EXIF GPS read then all EXIF stripped, re-encoded to WebP.
- Hash-chained, append-only timeline (DB trigger on Postgres) with `/admin/audit/verify`.
- Synthetic data only.

## Offline mode
Without `DATABASE_URL` and AI keys the API runs on a local SQLite file with deterministic fallbacks: every endpoint works, which is how the test suite runs. Fill `services/api/.env` to switch to Supabase + Gemini/Groq; nothing else changes.
