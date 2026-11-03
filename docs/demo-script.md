# JanaVaani demo script (4 minutes)

Follows master §16. Accounts are from master §14; the password for all of them is `Demo@2026`.

**Status: not yet rehearsed on the deployed site.** Steps 4–7 were rehearsed through the real UI against B's API running locally with no AI keys. Steps 1–3 are A's flows, and their labels come from A's code; they have not been run end to end from this script. Times marked "measured" are from one local run, so expect the Space to be slower. Fill in the blanks below after deployment, then do two full run-throughs.

| Fill in after deployment | Value |
|---|---|
| Site | `https://____.vercel.app` |
| API | `https://____.hf.space/api/v1` |
| Backup site (mock mode) | `https://____.vercel.app` |
| Suspicious streetlight ticket | `GRV-2026-______` (the demo shortcut finds it) |

## Before judging

**T minus 30 minutes**
1. Run `python scripts/record_demo.py --base <API>` so the AI answers replay instantly.
2. Admin → Demo controls → **Reset demo data**. It took 9.8 s locally. **Never reset on stage.**
3. Confirm the backup site opens.
4. Check on the demo machine that Chrome has a Telugu voice for **Listen**.

**T minus 10 minutes**
1. Open `<API>/health`. Expect `"status": "ok"` and `classifier: loaded`. A sleeping Space can take 30–60 s.
2. Open **Demo controls** and check that Provider health shows Gemini and Groq as available.
3. Open these tabs in order, each already signed in, using separate browser profiles for each account:

| Tab | Account | Page |
|---|---|---|
| 1 | none | Landing `/` |
| 2 | `lakshmi@janavaani.test` | `/app` |
| 3 | `ravi.roads@janavaani.test` | `/officer` |
| 4 | `admin@janavaani.test` | `/admin/demo` |

Set the screen to 100% zoom. Turn off notifications. Keep a phone hotspot ready.

## Run of show

| Time | Step | Presenter |
|---|---|---|
| 0:00 | 1. Landing | ____ |
| 0:25 | 2. Citizen voice | ____ |
| 1:10 | 3. Photo and Tenglish | ____ |
| 1:40 | 4. Officer | ____ |
| 2:20 | 5. Trust | ____ |
| 2:50 | 6. Admin | ____ |
| 3:30 | 7. AI model | ____ |
| 3:50 | 8. Close | ____ |

### 1. Landing (0:00–0:25), tab 1

1. Let the City Pulse hero run for a few seconds.
2. Scroll once to the live stats.

**Say:** "Every complaint, in every language."

### 2. Citizen voice in Telugu (0:25–1:10), tab 2

1. Click **Report by voice**.
2. Say exactly, because this phrase is the one cached for instant replay:

   > మా బడి దగ్గర కరెంటు తీగ తెగి రోడ్డు మీద పడింది, పిల్లలు అటు వెళ్తున్నారు, Kukatpally

3. Point out the detected language and the emergency screen with 112, 108 and 1912.
4. Continue to register. Show the Telugu and English versions, routing to Power, priority with reasons, and the 4-hour SLA.

**Say:** "She spoke Telugu. The system understood it, flagged the danger, and showed who to call first."

**If voice fails:** type the same sentence.

### 3. Photo and Tenglish (1:10–1:40), tab 2

1. Start a new report and attach the pothole photo. Keep it on the desktop as `pothole.jpg`.
2. Type exactly: `Miyapur X roads lo pedda gunta undi`
3. When the duplicate appears, click **Me too**.

**Say:** "Thirty-two people already reported this, so she adds her support instead of creating a thirty-third ticket."

### 4. Officer (1:40–2:20), tab 3

1. Show the inbox: priority order, SLA countdowns, flags.
2. Open the Miyapur pothole case. Press Ctrl+K and type its ticket number if it isn't near the top.
3. Point to the citizen's original next to the English, then the AI brief.
4. Click **Work started**, then **Draft with AI**. Show the citizen preview, then click **Send**.
5. Choose the proof photo, type `Filled and compacted`, and click **Submit resolution**.

**Say:** "He works in English. She receives Telugu, and she can listen to it."

**Expect:** with AI keys the verdict depends on the photo. Without vision the verdict is **Unclear**, which is honest behaviour, not a failure. Say: "AI won't verify what it can't see, so this goes to a human."

Ravi's seeded inbox had 0 critical cases and all 18 overdue in the local run, so don't promise a critical case here unless B has reseeded.

### 5. Trust (2:20–2:50), tab 4

1. Click **Demo controls** → **Suspicious streetlight**. The red banner and **Suspicious** verdict appear (0.6 s measured).
2. Click **Verify chain** and let it finish (1.0 s measured).
3. Switch to tab 2, open the same case as Lakshmi, click **No, not fixed**, and reopen.

**Say:** "The officer uploaded the citizen's own photo as proof. AI caught it, the citizen rejected it, and every event is in a chain nobody can quietly edit."

**Do not** use the officer account for Verify chain: it returns 403 until B changes it.

### 6. Admin (2:50–3:30), tab 4

1. Click **Command Center**. Show KPIs and the heatmap (1.5 s measured).
2. Click **Alerts**. Show the Charminar water spike with its Urdu and Hindi complaints.
3. Click **Demo controls** → **+48h** (2.9 s measured). Read the toast aloud.
4. Click **Departments** and show the leaderboard.

**Say:** "Time-travel forty-eight hours. Nobody pressed a button, and overdue cases escalated by themselves."

### 7. AI model (3:30–3:50), tab 4

1. Click **AI model**. Show accuracy per language on the human-written test set.
2. Click **Retrain from corrections** (3.5 s measured).

**Say:** "Three models vote, disagreement goes to a human, and those human decisions retrain our model."

**Risk:** the number can go down. Twenty deliberately wrong corrections took synthetic accuracy from 77.8% to 69.4%, while human-set accuracy rose from 75.0% to 79.2%. Rehearse the exact correction, or say "a new version is live" rather than promising a rise. If the page says no change, say "the same frozen test set keeps us honest."

### 8. Close (3:50–4:00)

**Say:** "Every complaint, in every language, followed through until the citizen says it's fixed. Built entirely on free tiers, and ready to pilot."

## Fallback plan

Decide fast. If a fix takes more than 10 seconds on stage, move on.

| Problem | Do this |
|---|---|
| Space asleep or 502 | Open `/health` and wait up to 60 s. Before judging: HF Space → Restart. |
| API down on stage | Switch to the backup mock site. All steps work offline with seeded data. |
| Gemini or Groq unavailable | Keep going. Every flow has a fallback. Don't mention it unless asked. |
| Slow AI or rate limit | Use the cached phrases above, word for word. |
| Voice not recognized | Type the same sentence. |
| No Telugu voice for Listen | Show the Telugu text and move on. |
| Login fails | Use the demo buttons on `/login`. If Supabase is down, follow the login row in `docs/runbook.md`. |
| Demo data messed up | Skip that moment. Reset only between runs. |
| Map tiles missing | Say "the map loads from a free tile service"; the heat layer still draws. |
| Venue Wi-Fi fails | Move to the phone hotspot. If that fails, play the backup video. |
| Everything fails | Play the backup video and narrate. |

**Backup mock site:** build `apps/web` with `VITE_API_MODE=mock` and `VITE_DEMO_MODE=true`. It needs no backend. Its numbers differ from the live site (for example 91.2% model accuracy), so don't quote live metrics while using it. Mock data resets on reload, so don't refresh mid-demo. In mock mode, any streetlight resolve returns Suspicious, and `GRV-2026-000119` is the suspicious case.

## Questions judges may ask

- **Is the data real?** No. All of it is synthetic, about 600 complaints plus scripted stories.
- **Are the wards real?** No. They are approximate demo boundaries, labeled as such.
- **How accurate is it?** 75.0% on 48 human-written complaints and 77.8% on 392 unseen synthetic ones. Urdu is the weakest on the synthetic test at 42.4%.
- **What if AI is wrong?** Low-confidence routing goes to a supervisor, critical cases need human confirmation, and closures need the citizen.
- **Is this deployed for GHMC?** No. It's a prototype, and real deployment needs official jurisdiction mapping.
