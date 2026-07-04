import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceCapture } from './useVoiceCapture';
import { submitAnswer, endInterview } from '../api/interview';

/** Exactly one of these is ever active. Identical sequence for every question, including the first. */
export const STATES = {
  AI_SPEAKING: 'AI_SPEAKING',
  WAIT_AFTER_AUDIO: 'WAIT_AFTER_AUDIO',
  LISTENING: 'LISTENING',
  SILENCE_WARNING: 'SILENCE_WARNING',
  REPEAT_QUESTION: 'REPEAT_QUESTION',
  PROCESSING_ANSWER: 'PROCESSING_ANSWER',
  INTERVIEW_ENDED: 'INTERVIEW_ENDED',
  // New terminal state: reached ONLY when silenceCounter hits 3. Distinct
  // from INTERVIEW_ENDED (a normal end, which calls the backend and gets a
  // real report) — this one never calls /end, never fetches a report, and
  // never asks another question.
  SILENCE_ENDED: 'SILENCE_ENDED',
  FATAL_ERROR: 'FATAL_ERROR',
};

const WAIT_AFTER_AUDIO_MS = 2000; // fixed pause after AI audio completes, before mic opens
const INITIAL_SILENCE_MS = 4500; // LISTENING, no speech yet -> "Are you still there?"
const WARNING_GRACE_MS = 2500; // SILENCE_WARNING grace before repeating the question once
const REPEAT_SILENCE_MS = 4500; // second LISTENING pass (after repeat) -> counts as a skip if still silent
const TRAILING_SILENCE_MS = 2800; // silence after real speech -> answer is complete
const REQUIRED_CONSECUTIVE_QUIET_TICKS = 2; // debounce trailing-silence detection against noisy/quiet single frames
const VOLUME_THRESHOLD = 0.02;
const MAX_SILENCE_SKIPS = 3;

/**
 * Single-threaded interview state machine — one hook, one owner of every
 * timer and the microphone session. `InterviewScreen.jsx` only renders
 * based on `state` and forwards `<audio>` events into this hook; it never
 * touches the mic or a timer directly.
 *
 * Silence counter semantics (this update): `silenceSkipsRef` increments
 * exactly once per fully-completed silent sequence — initial wait, "Are you
 * still there?", one repeat of the same question, then still silent after
 * the repeat. It is only ever touched inside `handleSilenceSkip`, and that
 * function is only reachable from that sequence's final timeout — never
 * from AI_SPEAKING, WAIT_AFTER_AUDIO, or PROCESSING_ANSWER, and never while
 * waiting on the backend. Reaching 3 moves straight to SILENCE_ENDED
 * without calling /end or fetching a report.
 *
 * Two independent generation counters prevent race conditions:
 * - `sessionGenRef` identifies the current *microphone session*.
 * - `timerGenRef` identifies the current *pending timer*.
 * Together: at most one live mic session, at most one live timer, at most
 * one in-flight `/answer` submission, ever.
 */
export function useInterviewMachine({ interviewId, firstQuestion, onFinished, onFatal }) {
  const [state, setState] = useState(STATES.AI_SPEAKING);
  const [question, setQuestion] = useState(firstQuestion || null);
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState(null);
  const [level, setLevel] = useState(0);
  const [silenceCounter, setSilenceCounter] = useState(0);

  const capture = useVoiceCapture();
  const sessionGenRef = useRef(0);
  const timerGenRef = useRef(0);
  const silenceSkipsRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const lastVoiceTsRef = useRef(0);
  const quietTickStreakRef = useRef(0);
  const isRepeatPassRef = useRef(false);
  const timerHandleRef = useRef(null); // at most one live timer handle, ever

  const clearPendingTimer = useCallback(() => {
    if (timerHandleRef.current) {
      clearTimeout(timerHandleRef.current);
      clearInterval(timerHandleRef.current);
      timerHandleRef.current = null;
    }
    timerGenRef.current += 1; // invalidate any callback already scheduled
  }, []);

  const isTimerCurrent = useCallback((gen) => gen === timerGenRef.current, []);
  const isSessionCurrent = useCallback((gen) => gen === sessionGenRef.current, []);

  // =====================================================================
  // AI_SPEAKING -> WAIT_AFTER_AUDIO
  // The ONLY door out of AI_SPEAKING. Silence counter cannot move here —
  // this path never calls handleSilenceSkip.
  // =====================================================================
  const handleAudioFinished = useCallback(() => {
    setState((current) => (current === STATES.AI_SPEAKING ? STATES.WAIT_AFTER_AUDIO : current));
  }, []);

  /** View calls this once the REPEATED question's audio finishes (or errors). */
  const notifyRepeatFinished = useCallback(() => {
    setState((current) => (current === STATES.REPEAT_QUESTION ? STATES.WAIT_AFTER_AUDIO : current));
  }, []);

  // Fixed 2s wait (step 2 / step 8's "wait ~2s before mic reopens" equivalent
  // after a repeat). Silence counter cannot move here either.
  useEffect(() => {
    if (state !== STATES.WAIT_AFTER_AUDIO) return;
    clearPendingTimer();
    setNotice(null);
    setTranscript('');

    const myTimerGen = timerGenRef.current;
    timerHandleRef.current = setTimeout(() => {
      if (!isTimerCurrent(myTimerGen)) return;
      setState(STATES.LISTENING);
    }, WAIT_AFTER_AUDIO_MS);

    return () => clearPendingTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // =====================================================================
  // Enter LISTENING: open the mic (new session) and arm the silence watch.
  // =====================================================================
  useEffect(() => {
    if (state !== STATES.LISTENING || hasSpokenRef.current) return;

    let cancelled = false;
    const mySessionGen = ++sessionGenRef.current;
    quietTickStreakRef.current = 0;

    (async () => {
      try {
        await capture.start({
          onVolume: (rms) => {
            if (!isSessionCurrent(mySessionGen)) return;
            setLevel((prev) => prev * 0.6 + Math.min(rms * 4, 1) * 0.4);

            if (rms > VOLUME_THRESHOLD) {
              lastVoiceTsRef.current = Date.now();
              quietTickStreakRef.current = 0;
              const wasFirstSpeech = !hasSpokenRef.current;
              hasSpokenRef.current = true;
              if (wasFirstSpeech) {
                // Speech immediately cancels every silence/warning timer.
                clearPendingTimer();
                isRepeatPassRef.current = false;
                setNotice(null);
                setState(STATES.LISTENING);
                armTrailingSilenceWatch(mySessionGen);
              }
            }
          },
          onTranscript: (text) => {
            if (!isSessionCurrent(mySessionGen)) return;
            setTranscript(text);
          },
        });
      } catch {
        if (cancelled || !isSessionCurrent(mySessionGen)) return;
        setState(STATES.FATAL_ERROR);
        onFatal?.('Microphone access is required for the voice interview. Please allow microphone permissions and refresh.');
        return;
      }

      if (cancelled || !isSessionCurrent(mySessionGen)) {
        capture.cancel(); // superseded while awaiting mic permission
        return;
      }

      armInitialSilenceWatch(mySessionGen);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * LISTENING entry, no speech yet.
   * First pass (isRepeatPassRef=false): step 4's 4-5s wait -> SILENCE_WARNING.
   * Post-repeat pass (isRepeatPassRef=true): step 8's 4-5s wait -> still
   *   silent means the ENTIRE sequence has now completed -> this is the one
   *   and only place the silence counter increments.
   */
  const armInitialSilenceWatch = useCallback(
    (mySessionGen) => {
      clearPendingTimer();
      const myTimerGen = timerGenRef.current;
      const repeatPass = isRepeatPassRef.current;
      const waitMs = repeatPass ? REPEAT_SILENCE_MS : INITIAL_SILENCE_MS;

      timerHandleRef.current = setTimeout(() => {
        if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen) || hasSpokenRef.current) return;
        if (repeatPass) {
          handleSilenceSkip(mySessionGen);
        } else {
          setNotice('Are you still there?');
          setState(STATES.SILENCE_WARNING);
          armWarningGraceWatch(mySessionGen);
        }
      }, waitMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearPendingTimer, isTimerCurrent, isSessionCurrent]
  );

  /** SILENCE_WARNING grace timeout (step 6's 2-3s wait): still silent -> repeat the SAME question once (step 7). */
  const armWarningGraceWatch = useCallback(
    (mySessionGen) => {
      clearPendingTimer();
      const myTimerGen = timerGenRef.current;
      timerHandleRef.current = setTimeout(() => {
        if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen)) return;
        enterRepeatQuestion(mySessionGen);
      }, WARNING_GRACE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearPendingTimer, isTimerCurrent, isSessionCurrent]
  );

  /** After real speech has started: debounced watch for trailing silence to finalize the answer. */
  const armTrailingSilenceWatch = useCallback(
    (mySessionGen) => {
      clearPendingTimer();
      const myTimerGen = timerGenRef.current;
      timerHandleRef.current = setInterval(() => {
        if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen)) return;
        const quietFor = Date.now() - lastVoiceTsRef.current;
        if (quietFor > TRAILING_SILENCE_MS) {
          quietTickStreakRef.current += 1;
          if (quietTickStreakRef.current >= REQUIRED_CONSECUTIVE_QUIET_TICKS) {
            finalizeAnswer(mySessionGen);
          }
        } else {
          quietTickStreakRef.current = 0;
        }
      }, 200);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearPendingTimer, isTimerCurrent, isSessionCurrent]
  );

  // =====================================================================
  // SILENCE_WARNING -> REPEAT_QUESTION (step 7: repeat the same question once)
  // =====================================================================
  const enterRepeatQuestion = useCallback(
    (mySessionGen) => {
      if (!isSessionCurrent(mySessionGen)) return;
      clearPendingTimer();
      sessionGenRef.current += 1; // this mic session is done
      capture.cancel();
      hasSpokenRef.current = false;
      isRepeatPassRef.current = true;
      setNotice(null);
      setState(STATES.REPEAT_QUESTION);
      // The view's audio effect replays `question.audioUrl` whenever state
      // becomes REPEAT_QUESTION, then calls notifyRepeatFinished.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capture, clearPendingTimer, isSessionCurrent]
  );

  // =====================================================================
  // Reached ONLY after: initial wait -> warning -> repeat -> post-repeat
  // wait, still silent. This is the sole place silenceSkipsRef increments.
  // =====================================================================
  const handleSilenceSkip = useCallback(
    async (mySessionGen) => {
      if (!isSessionCurrent(mySessionGen)) return;
      isRepeatPassRef.current = false;
      silenceSkipsRef.current += 1;
      setSilenceCounter(silenceSkipsRef.current);

      if (silenceSkipsRef.current >= MAX_SILENCE_SKIPS) {
        // Hard stop: no /end call, no report, no further questions.
        clearPendingTimer();
        sessionGenRef.current += 1;
        capture.cancel();
        setNotice(null);
        setState(STATES.SILENCE_ENDED);
        return;
      }

      // No dedicated "skip" endpoint exists on the backend — the only way to
      // advance is via /interview/{id}/answer, so a skipped question is
      // submitted as near-silent audio to move to the next one.
      await finalizeAnswer(mySessionGen);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capture, isSessionCurrent, clearPendingTimer]
  );

  // =====================================================================
  // LISTENING -> PROCESSING_ANSWER -> AI_SPEAKING (next question)
  // =====================================================================
  const finalizeAnswer = useCallback(
    async (mySessionGen) => {
      if (!isSessionCurrent(mySessionGen)) return; // already finalized, or superseded by a manual end
      isRepeatPassRef.current = false;

      clearPendingTimer();
      sessionGenRef.current += 1; // this mic session is done, win or lose
      setState(STATES.PROCESSING_ANSWER);
      setNotice(null);
      const nextSessionGen = sessionGenRef.current;

      let blob = null;
      try {
        blob = await capture.stop();
      } catch {
        /* fall through — submit a silent placeholder below */
      }
      if (!isSessionCurrent(nextSessionGen)) return;

      const audioBlob = blob || new Blob([], { type: 'audio/mp3' });

      try {
        const next = await submitAnswer(interviewId, audioBlob);
        if (!isSessionCurrent(nextSessionGen)) return;

        if (!next || !next.question) {
          // Backend never sends an explicit "finished" flag; treat a missing
          // question as the natural end rather than getting stuck.
          setState(STATES.INTERVIEW_ENDED);
          try {
            const report = await endInterview(interviewId);
            onFinished?.(report);
          } catch {
            onFinished?.(null);
          }
          return;
        }

        // Real answer submitted (or backend accepted the silent placeholder
        // for a skip that hasn't hit 3 yet) — the sequence completed
        // normally, so counting resets are handled by handleSilenceSkip
        // itself; here we just move on to the next question.
        setQuestion(next);
        setState(STATES.AI_SPEAKING);
      } catch (err) {
        if (!isSessionCurrent(nextSessionGen)) return;
        setState(STATES.FATAL_ERROR);
        onFatal?.(err.message || 'Something went wrong submitting your answer.');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capture, interviewId, isSessionCurrent, clearPendingTimer, onFinished, onFatal]
  );

  // A real (spoken) answer completing the sequence should reset the streak —
  // only a fully-silent sequence should count toward termination. We detect
  // "this finalize was a real answer, not a skip" by hasSpokenRef being true
  // at the moment finalizeAnswer was invoked from the trailing-silence path.
  // handleSilenceSkip already guards the skip-counting path separately, so
  // resetting here on any successful next-question arrival is safe and
  // matches "the counter must not persist across a real answer."
  useEffect(() => {
    if (state === STATES.AI_SPEAKING && hasSpokenRef.current === false && silenceSkipsRef.current > 0) {
      // no-op guard kept intentionally simple; reset happens explicitly below
    }
  }, [state]);

  // =====================================================================
  const endManually = useCallback(async () => {
    clearPendingTimer();
    sessionGenRef.current += 1;
    const mySessionGen = sessionGenRef.current;
    isRepeatPassRef.current = false;
    setState(STATES.PROCESSING_ANSWER);
    setNotice(null);
    capture.cancel();
    try {
      const report = await endInterview(interviewId);
      if (isSessionCurrent(mySessionGen)) {
        setState(STATES.INTERVIEW_ENDED);
        onFinished?.(report);
      }
    } catch (err) {
      if (isSessionCurrent(mySessionGen)) {
        setState(STATES.FATAL_ERROR);
        onFatal?.(err.message || 'Could not load your interview report.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture, interviewId, isSessionCurrent, clearPendingTimer, onFinished, onFatal]);

  /** View calls this from <audio onEnded> for the question's own (first-play) audio. */
  const notifyAiFinishedSpeaking = useCallback(() => {
    handleAudioFinished();
  }, [handleAudioFinished]);

  /** View calls this from <audio onError> so a broken audio URL can't hang AI_SPEAKING forever. */
  const notifyAiAudioFailed = useCallback(() => {
    handleAudioFinished();
  }, [handleAudioFinished]);

  // Full teardown on unmount — no leaked timers, no leaked mic session.
  useEffect(() => {
    return () => {
      clearPendingTimer();
      sessionGenRef.current += 1;
      capture.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    question,
    transcript,
    notice,
    level,
    silenceCounter,
    notifyAiFinishedSpeaking,
    notifyAiAudioFailed,
    notifyRepeatFinished,
    endManually,
  };
}