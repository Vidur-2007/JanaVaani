# Demo video — recording checklist

For the backup and submission video of the 4-minute demo (master §16). The run of show and the lines to say are in [`demo-script.md`](demo-script.md); fixes if something breaks are in [`runbook.md`](runbook.md). Tick every box before you press record.

## 1. The day before
- [ ] **Everything is deployed:** production frontend on Vercel (`VITE_API_MODE=live`, `VITE_DEMO_MODE=true`) and the API on the Hugging Face Space, both from `main` at tag `v1.0-submission`.
- [ ] **A backup site exists:** a second Vercel deployment with `VITE_API_MODE=mock`. If the API misbehaves mid-take, record the citizen part there.
- [ ] **Space secrets** are the fresh demo key pair: `GEMINI_API_KEY`, `GROQ_API_KEY`, `DEMO_MODE=true`, and `ALLOWED_ORIGINS` including the Vercel URL.
- [ ] **AI answers are pre-recorded:** `python scripts/record_demo.py --base https://<space>.hf.space/api/v1`. It caches the exact demo phrases, which the citizen demo chips use word for word.
- [ ] **Chrome on the recording machine has a Telugu voice:** DevTools → `speechSynthesis.getVoices().filter(v => v.lang.startsWith('te'))`. If not, record in **Edge**, whose "Online (Natural)" voices cover te-IN, hi-IN and ur-IN.
- [ ] Write the asset paths into `demo-script.md`: site URL, API URL, backup URL, and the suspicious streetlight ticket ID.

## 2. Machine and screen
- [ ] **Window size:** record a **1920×1080** browser window (full screen, or a window exactly that size) at **100% browser zoom** and 100% OS scaling. Use 125% zoom only if text looks too small in a test clip.
- [ ] **Phone shots** (citizen steps 2–3, optional but strongest): Chrome DevTools device mode **Pixel 7 (412×915)**, or a real Android phone mirrored (scrcpy). Keep one choice for the whole video.
- [ ] **Quiet machine:** OS notifications off (Do Not Disturb), chat apps closed, bookmarks bar hidden, extensions that inject UI disabled, battery saver off, mouse-pointer highlight on.
- [ ] **Network:** wired, or strong Wi-Fi with a phone hotspot ready.
- [ ] **Audio:** an external mic for narration. Test Telugu dictation into the voice orb once. If the room mic is unreliable, use the **"Say the demo phrase"** button in voice mode, which sends the same Telugu sentence.
- [ ] **Recorder** (OBS or similar): 1080p, 30 fps, system audio **on** (so the Listen read-aloud is captured), mic on its own track.

## 3. Reset the demo state (T minus 30 min, then never on camera)
- [ ] Wake the Space: open `https://<space>.hf.space/api/v1/health`. Expect `"status": "ok"`, `classifier: loaded`, and Gemini and Groq `available`.
- [ ] **Admin → Demo controls → Reset demo data.** This re-seeds the stories and **resets the demo clock to 0**.
- [ ] Check the clock reads +0h (`GET /api/v1/admin/demo/clock`, `offset_minutes: 0`). Use **+48h only on camera** in step 6.
- [ ] Clear each browser profile's site data for the Vercel URL (DevTools → Application → Clear storage). This removes old drafts, the outbox, prefs and the service-worker cache.
- [ ] Re-run `record_demo.py` after the reset if the script says to.

## 4. Accounts: one browser profile each, signed in in advance
All passwords are `Demo@2026`. Separate Chrome profiles keep the sessions apart.

| Profile | Account | Used in steps | Prefs to set before recording |
|---|---|---|---|
| P1 Public | none | 1 Landing, 8 Close | Language English |
| P2 Lakshmi | `lakshmi@janavaani.test` | 2 Voice, 3 Photo, 5 Trust (reject) | Onboarding done, UI language **Telugu**, microphone and location allowed |
| P3 Ravi | `ravi.roads@janavaani.test` | 4 Officer | — |
| P4 Admin | `admin@janavaani.test` | 5 Trust (verify chain), 6 Admin, 7 AI model | — |

Sign in to each profile with the **demo buttons on `/login`**, then close and reopen the tab to make sure the session sticks.

## 5. Tabs to pre-open (in this order, in their profiles)
| # | Profile | URL | Why it is open first |
|---|---|---|---|
| 1 | P1 | `/` | The landing hero has played and the 3D City Pulse is warm (move the mouse once so it loads) |
| 2 | P2 | `/app` | Lakshmi's home in Telugu. Steps 2–3 start from the **Report by voice** and **Report with photo** tiles |
| 3 | P3 | `/officer` | Ravi's priority inbox, already loaded |
| 4 | P4 | `/admin/demo` | Demo controls: Suspicious streetlight shortcut, Verify chain, +48h |
| 5 | P4 | `/admin` | The Command Center heatmap is warm |
| 6 | P4 | `/admin/ai` (AI model page) | Per-language accuracy is loaded |

Keep `pothole.jpg` on the desktop for the officer's resolution proof (step 4). The citizen's photo comes from **Use demo photo** in the quick report.

## 6. Exact inputs (the demo kit's prefill matches the recorded ones)
- [ ] **Step 2, voice in Telugu:** say, or tap **Say the demo phrase**:
  > మా బడి దగ్గర కరెంటు తీగ తెగి రోడ్డు మీద పడింది, పిల్లలు అటు వెళ్తున్నారు, Kukatpally

  Expect the emergency screen (112 / 108 / 1912) → **Continue registering** → confirmation card (Power, priority with reasons, SLA) → **Confirm & submit** → ticket + confetti.
- [ ] **Step 3, photo + Tenglish:** home → **Report with photo** → **Use demo photo**, which fills the photo, Miyapur X Roads and `Miyapur X roads lo pedda gunta undi` → Continue → Confirm. Expect "32 people already reported this" → **Add my support**.
- [ ] **Step 5, trust:** P4 → Suspicious streetlight → Verify chain. Then P2 → the home **"Is it fixed?"** card → **No, not fixed** → reason → Reopen.
- [ ] **Step 6, time travel:** P4 → +48h. Read the escalation toast aloud.

## 7. Recording
- [ ] **One dry run** without recording. Fix anything slow, then reset again (section 3).
- [ ] Record **one take per step** (8 clips), not one 4-minute take. Pause the recorder between steps and switch tabs while paused.
- [ ] Leave 1–2 s still at the start and end of each clip for cutting.
- [ ] Don't refresh pages mid-step. The backup site in particular resets its mock data on reload.
- [ ] If an AI answer is slow (> 5 s), stop that clip, re-run `record_demo.py`, and retake from the start of the step. Don't reset the data again mid-session unless the story state is broken.
- [ ] Narrate from `demo-script.md`, or record the voice-over separately afterwards.

## 8. After recording
- [ ] Watch the whole cut once at 1× speed. Check that Telugu, Hindi and Urdu render (no boxes), the read-aloud audio is audible, and no personal notifications or bookmarks appear.
- [ ] Export 1080p MP4 (H.264, AAC) under the submission size limit. Name it `janavaani-demo-v1.0.mp4`.
- [ ] Upload it and paste the link into the submission form and `README.md`.
- [ ] **Admin → Reset demo data** once more, so judges see a clean demo city.
