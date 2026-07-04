# Voicebench — AI Voice Interview Frontend

A production-ready React (Vite) frontend for the AI Voice Interview backend, built
against the real FastAPI route handlers (not just the OpenAPI spec, which didn't
publish response schemas).

## Run locally

```bash
npm install
npm run dev
```

The backend URL is already set in `.env.example` — copy it to `.env`:

```
VITE_API_BASE_URL=https://voice-ai-interview-agent.onrender.com
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it in Vercel — it auto-detects Vite.
3. Add the environment variable `VITE_API_BASE_URL` in the Vercel project settings.
4. Deploy. `vercel.json` already handles SPA client-side routing rewrites.

## Interview flow architecture (state machine)

The interview lifecycle lives entirely in `src/hooks/useInterviewMachine.js`.
`src/pages/InterviewScreen.jsx` is a thin view that only renders based on
the current state and wires the `<audio>` element's `onEnded`/`onError` to
it — it holds no interview logic itself, and never touches the microphone
directly.

**States** (exactly one active at a time):
```
AI_SPEAKING → WAITING_AFTER_AUDIO (fixed 4s) → LISTENING ⇄ SILENCE_WARNING
     → PROCESSING_ANSWER → NEXT_QUESTION → AI_SPEAKING (repeat)
     → … → INTERVIEW_ENDED
```
`FATAL_ERROR` is reachable from anywhere on unrecoverable failure (e.g. mic
permission denied, a request that fails outright).

**Rule enforcement, concretely:**
- While `AI_SPEAKING`: the mic-opening effect only runs when `state === LISTENING`, and nothing transitions to `LISTENING` except the timer started in `WAITING_AFTER_AUDIO`. So the mic is structurally incapable of turning on, and no silence timer can start, until playback has actually ended.
- `WAITING_AFTER_AUDIO` runs a single fixed 4000ms timeout, then moves to `LISTENING`.
- Once in `LISTENING`, exactly one timer is armed at a time — first the "no speech yet" watch, then (if it fires) the `SILENCE_WARNING` grace timer, then (if that fires too) a skip. Every timer goes through one `clearPendingTimer()` choke point before a new one is armed, so there is never more than one live timer.

**Two independent generation counters eliminate the race conditions:**
- `sessionGenRef` identifies the current *microphone session*. It only advances when the mic actually opens or fully tears down — starting a fresh `LISTENING` phase, submitting an answer, ending the interview, or unmounting. Moving between `LISTENING` and `SILENCE_WARNING` does **not** advance it, because that's still the same continuous mic session — just a UI/timer distinction — so speech spoken *during* the warning is still correctly detected and cancels it (rule 3).
- `timerGenRef` identifies the current *pending timer*. It advances every time a scheduled timeout/interval should be invalidated — most importantly, the instant real speech is detected. A timer callback checks its own generation snapshot before doing anything, so a timer that was already "in flight" when speech started becomes an inert no-op instead of firing late.

Together these guarantee at most one live mic session, at most one live
timer, and at most one in-flight `submitAnswer` call, at any moment — so a
duplicate silence timer, a stale "still there?" popping up after the user
already answered, or two overlapping `/answer` requests are not just
unlikely but structurally prevented.

Silence handling matches the spec exactly: ~4.5s of silence in `LISTENING`
→ `SILENCE_WARNING` ("Are you still there?") → 3s more → counts as a missed
question, submitted as near-silent audio to advance (no skip endpoint
exists on the backend). Three misses in a row ends the interview
automatically, calling `POST /interview/end/interview/{id}` and navigating
to the report — no button press required.



All of this lives in `src/api/interview.js`. If your backend changes field names later, that's the only file to touch.

| Endpoint | Key fields returned |
|---|---|
| `POST /interview/start` | `id`, `title`, `topics`, `message`, `question`, `audio_url`, `question_created_time` |
| `POST /interview/{id}/answer` | `interview_id`, `question`, `difficulty`, `audio_url`, `created_at` |
| `POST /interview/end/interview/{id}` | `interview_id`, `summary`, `positive_aspects`, `suggestions`, `learning_tags`, `overall_difficulty`, `marks` |
| `GET /interview/history` | array of `{ interview_id, title, topic, created_at, analysis: [{ marks, difficulty }] }` |
| `GET /history/interview/{id}` | `{ analysis: [...], responses: [{ question, difficulty, answer, evaluation, marks, created_at }] }` |

`audio_url` is a relative path like `/audio/xyz.mp3` — the frontend prepends
`VITE_API_BASE_URL` to it automatically (see `resolveAudioUrl` in
`src/api/interview.js`).

## ⚠️ Backend bug worth fixing: `GET /interview/history`

In your `get_history` handler, `analysis = []` is declared **outside** the
`for i in interviews` loop and never reset per interview. Since each
`result.append(...)` stores a reference to that same list, every interview
in the response ends up sharing the *same, fully-accumulated* `analysis`
array by the time the loop finishes — not its own.

**Fix:** move `analysis = []` inside the `for i in interviews:` loop, right
before the inner `for a in i.overall_analysis:` loop.

The frontend works around this defensively (it reads the first `analysis`
entry per card so nothing crashes), but scores/difficulty shown on history
cards won't be reliably correct until this is fixed server-side.

## Other implementation notes

- **No "finished" flag exists anywhere in the API.** The interview never
  signals completion on its own — `/interview/{id}/answer` always returns
  another question. The interview only ends when the user clicks
  **"End interview"**, or when the frontend's own silence-detection logic
  decides to end it after 3 silence strikes. Both call
  `POST /interview/end/interview/{id}` directly.
- **Silence handling** is done entirely client-side via live microphone
  volume analysis (Web Audio `AnalyserNode`) — there's no "skip question"
  endpoint, so a skipped question is submitted as a near-silent audio clip
  to `/interview/{id}/answer`, the only endpoint available to advance the
  interview.
- **Live transcript captions** use the browser's `SpeechRecognition` API when
  available (Chrome/Edge). Safari/Firefox fall back to a generic
  "Listening…" indicator — the actual audio upload to the backend is
  unaffected either way.
- **Recorded audio format**: `MediaRecorder` records in `audio/webm` (or
  `audio/mp4` as a fallback) depending on browser support, but is uploaded
  with a `.mp3` filename to match your `File(...)` field. If your
  `speech_to_text` service is strict about the actual codec matching the
  file extension, you may want to either transcode server-side or accept
  the real MIME type your STT provider requires — worth testing with a
  real recording once deployed.
- **Auth**: JWT from `POST /login` is stored in `localStorage` and attached
  as `Authorization: Bearer <token>` automatically on every protected call.
- **Resuming an interview mid-way** (e.g. after a page refresh) isn't
  possible with the given endpoints — there's no "get current question" GET
  route — so the interview screen requires a freshly started interview
  (it reads the first question from React Router navigation state).
