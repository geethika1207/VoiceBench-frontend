import { request, BASE_URL } from './client';

/**
 * Response shapes below are taken directly from the backend route handlers
 * (not guessed) — see /interview/start, /interview/{id}/answer,
 * /interview/end/interview/{id}, /interview/history, /history/interview/{id}.
 *
 * Known backend quirk (not a frontend bug): `GET /interview/history` builds
 * its `analysis` list outside the per-interview loop, so every interview in
 * the response ends up sharing the same, fully-accumulated analysis array
 * instead of its own. We defensively read the *first* analysis entry so the
 * UI doesn't crash, but the score/difficulty shown per history card won't be
 * reliably correct until `analysis = []` is moved inside the `for i in
 * interviews` loop on the backend.
 */

function pick(obj, keys, fallback = undefined) {
  if (!obj) return fallback;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

/** Turns the backend's relative "/audio/xyz.mp3" into a full playable URL. */
export function resolveAudioUrl(audioUrl) {
  if (!audioUrl) return null;
  if (audioUrl.startsWith('http') || audioUrl.startsWith('data:') || audioUrl.startsWith('blob:')) {
    return audioUrl;
  }
  return `${BASE_URL}${audioUrl}`;
}

function normalizeQuestion(raw, interviewId) {
  if (!raw) return null;
  return {
    interviewId: pick(raw, ['id', 'interview_id'], interviewId),
    question: pick(raw, ['question'], ''),
    difficulty: pick(raw, ['difficulty'], null), // null on the very first question — backend defaults to "Beginner" server-side
    audioUrl: resolveAudioUrl(pick(raw, ['audio_url'], null)),
    message: pick(raw, ['message'], null), // only present on /interview/start
    title: pick(raw, ['title'], null),
    topic: pick(raw, ['topics'], null),
    raw,
  };
}

function normalizeReport(raw) {
  if (!raw) return null;
  return {
    interviewId: pick(raw, ['interview_id'], null),
    score: pick(raw, ['marks'], null),
    difficulty: pick(raw, ['overall_difficulty'], null),
    summary: pick(raw, ['summary'], ''),
    positives: pick(raw, ['positive_aspects'], []),
    suggestions: pick(raw, ['suggestions'], []),
    tags: pick(raw, ['learning_tags'], []),
    questions: [],
    raw,
  };
}

function normalizeHistoryItem(raw) {
  if (!raw) return null;
  // See the doc-comment above: `analysis` may be shared/accumulated across
  // items due to a backend bug. We read the first entry defensively.
  const analysisList = Array.isArray(raw.analysis) ? raw.analysis : [];
  const firstAnalysis = analysisList[0] || {};

  return {
    id: pick(raw, ['interview_id', 'id'], null),
    title: pick(raw, ['title'], 'Interview'),
    topic: pick(raw, ['topic', 'topics'], ''),
    date: pick(raw, ['created_at'], null),
    score: pick(firstAnalysis, ['marks'], null),
    difficulty: pick(firstAnalysis, ['difficulty', 'overall_difficulty'], null),
    raw,
  };
}

function normalizeInterviewDetail(raw) {
  if (!raw) return null;
  const analysisList = Array.isArray(raw.analysis) ? raw.analysis : [];
  const latestAnalysis = analysisList[0] || {};
  const responses = Array.isArray(raw.responses) ? raw.responses : [];

  return {
    hasAnalysis: analysisList.length > 0,
    interviewId: pick(latestAnalysis, ['interview_id'], null),
    score: pick(latestAnalysis, ['marks'], null),
    difficulty: pick(latestAnalysis, ['overall_difficulty'], null),
    summary: pick(latestAnalysis, ['summary'], ''),
    positives: pick(latestAnalysis, ['positive_aspects'], []),
    suggestions: pick(latestAnalysis, ['suggestions'], []),
    tags: pick(latestAnalysis, ['learning_tags'], []),
    questions: responses
      // Only drop rows with neither a question nor an answer to show — NOT
      // rows where `answer` happens to be falsy (empty string, etc.) but
      // real data otherwise exists. A plain `.filter((r) => r.answer)`
      // silently drops legitimate rows whenever `answer` is `""` or `null`.
      .filter((r) => pick(r, ['question']) || pick(r, ['answer']))
      .map((r, i) => ({
        id: i,
        question: pick(r, ['question'], ''),
        answer: pick(r, ['answer'], ''),
        evaluation: pick(r, ['evaluation'], ''),
        marks: pick(r, ['marks'], null),
        difficulty: pick(r, ['difficulty'], null),
      })),
    raw,
  };
}

/** POST /interview/start — begin a new interview on a topic/concept. */
export async function startInterview(concept) {
  const raw = await request('/interview/start', {
    method: 'POST',
    body: { concept },
  });
  return normalizeQuestion(raw);
}

/** POST /interview/{id}/answer — upload the candidate's spoken answer audio. */
export async function submitAnswer(id, audioBlob, filename = 'answer.mp3') {
  const form = new FormData();
  form.append('audio', audioBlob, filename);
  const raw = await request(`/interview/${id}/answer`, {
    method: 'POST',
    body: form,
  });
  return normalizeQuestion(raw, id);
}

/** POST /interview/end/interview/{id} — end the interview and get the report. */
export async function endInterview(id) {
  const raw = await request(`/interview/end/interview/${id}`, { method: 'POST' });
  return normalizeReport(raw);
}

/**
 * GET /interview/history — list of past interviews.
 *
 * Sorted newest-first by creation timestamp here, once, at the shared data
 * source. The backend returns rows in whatever order the database happens
 * to give them (no ORDER BY), which was oldest-first. Both the Dashboard's
 * "Recent Interviews" (which just takes the first 3 of whatever this
 * returns) and the History page (which renders this list as-is) consume
 * this same function, so sorting it once here fixes both without touching
 * either page's component.
 */
export async function getHistory() {
  const raw = await request('/interview/history', { method: 'GET' });
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map(normalizeHistoryItem)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** GET /history/interview/{id} — full detail + report for one interview. */
export async function getInterviewDetail(id) {
  const raw = await request(`/history/interview/${id}`, { method: 'GET' });
  return normalizeInterviewDetail(raw);
}

/** DELETE /delete/interview/{id} — remove an interview from history. */
export function deleteInterview(id) {
  return request(`/delete/interview/${id}`, { method: 'DELETE' });
}

/** DELETE /delete/history — remove every interview belonging to the current user. */
export function deleteAllInterviews() {
  return request('/delete/history', { method: 'DELETE' });
}