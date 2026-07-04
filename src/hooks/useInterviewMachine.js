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
  SILENCE_ENDED: 'SILENCE_ENDED',
  FATAL_ERROR: 'FATAL_ERROR',
};

const WAIT_AFTER_AUDIO_MS = 2000;
const INITIAL_SILENCE_MS = 4500;
const WARNING_GRACE_MS = 2500;
const REPEAT_SILENCE_MS = 4500;

// ISSUE 1 FIX: this was 2800ms combined with a 2-tick debounce (~3.2s total)
// — noticeably longer than the "2-3 seconds" a natural finish should take.
// Lowered to 2200ms with a single-tick check (200ms resolution is already
// fine-grained enough on its own; the previous debounce was compensating
// for a much shorter threshold from an earlier version, not this one).
const TRAILING_SILENCE_MS = 2200;

const VOLUME_THRESHOLD = 0.02;
const MAX_SILENCE_SKIPS = 3;

/**
 * Single-threaded interview state machine — one hook, one owner of every
 * timer and the microphone session. `InterviewScreen.jsx` only renders
 * based on `state` and forwards `<audio>` events into this hook; it never
 * touches the mic or a timer directly.
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
  const isRepeatPassRef = useRef(false);
  const timerHandleRef = useRef(null);
  const activeSessionGenRef = useRef(null); // ISSUE 1 FIX: lets the manual "finish answering" button target the live session

  const clearPendingTimer = useCallback(() => {
    if (timerHandleRef.current) {
      clearTimeout(timerHandleRef.current);
      clearInterval(timerHandleRef.current);
      timerHandleRef.current = null;
    }
    timerGenRef.current += 1;
  }, []);

  const isTimerCurrent = useCallback((gen) => gen === timerGenRef.current, []);
  const isSessionCurrent = useCallback((gen) => gen === sessionGenRef.current, []);

  const handleAudioFinished = useCallback(() => {
    setState((current) => (current === STATES.AI_SPEAKING ? STATES.WAIT_AFTER_AUDIO : current));
  }, []);

  const notifyRepeatFinished = useCallback(() => {
    setState((current) => (current === STATES.REPEAT_QUESTION ? STATES.WAIT_AFTER_AUDIO : current));
  }, []);

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

  useEffect(() => {
    if (state !== STATES.LISTENING || hasSpokenRef.current) return;

    let cancelled = false;
    const mySessionGen = ++sessionGenRef.current;
    activeSessionGenRef.current = mySessionGen;

    // ISSUE 2 FIX: reset the transcript for every new recording session,
    // not just implicitly on the first one — this is the state the view
    // reads, so it must be cleared here every time a fresh mic session
    // begins, regardless of which question number this is.
    setTranscript('');

    (async () => {
      try {
        await capture.start({
          onVolume: (rms) => {
            if (!isSessionCurrent(mySessionGen)) return;
            setLevel((prev) => prev * 0.6 + Math.min(rms * 4, 1) * 0.4);

            if (rms > VOLUME_THRESHOLD) {
              lastVoiceTsRef.current = Date.now();
              const wasFirstSpeech = !hasSpokenRef.current;
              hasSpokenRef.current = true;
              if (wasFirstSpeech) {
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
        capture.cancel();
        return;
      }

      armInitialSilenceWatch(mySessionGen);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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

  /** ISSUE 1 FIX: single source of truth for "the trailing-silence window has elapsed", now reused by both the timer and the manual button. */
  const armTrailingSilenceWatch = useCallback(
    (mySessionGen) => {
      clearPendingTimer();
      const myTimerGen = timerGenRef.current;
      timerHandleRef.current = setInterval(() => {
        if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen)) return;
        if (Date.now() - lastVoiceTsRef.current > TRAILING_SILENCE_MS) {
          finalizeAnswer(mySessionGen);
        }
      }, 200);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearPendingTimer, isTimerCurrent, isSessionCurrent]
  );

  const enterRepeatQuestion = useCallback(
    (mySessionGen) => {
      if (!isSessionCurrent(mySessionGen)) return;
      clearPendingTimer();
      sessionGenRef.current += 1;
      capture.cancel();
      hasSpokenRef.current = false;
      isRepeatPassRef.current = true;
      setNotice(null);
      setState(STATES.REPEAT_QUESTION);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capture, clearPendingTimer, isSessionCurrent]
  );

  const handleSilenceSkip = useCallback(
    async (mySessionGen) => {
      if (!isSessionCurrent(mySessionGen)) return;
      isRepeatPassRef.current = false;
      silenceSkipsRef.current += 1;
      setSilenceCounter(silenceSkipsRef.current);

      if (silenceSkipsRef.current >= MAX_SILENCE_SKIPS) {
        clearPendingTimer();
        sessionGenRef.current += 1;
        capture.cancel();
        setNotice(null);
        setState(STATES.SILENCE_ENDED);
        return;
      }

      await finalizeAnswer(mySessionGen);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capture, isSessionCurrent, clearPendingTimer]
  );

  const finalizeAnswer = useCallback(
    async (mySessionGen) => {
      if (!isSessionCurrent(mySessionGen)) return;
      isRepeatPassRef.current = false;

      clearPendingTimer();
      sessionGenRef.current += 1;
      setState(STATES.PROCESSING_ANSWER);
      setNotice(null);
      const nextSessionGen = sessionGenRef.current;

      let blob = null;
      try {
        blob = await capture.stop();
      } catch {
        /* fall through */
      }
      if (!isSessionCurrent(nextSessionGen)) return;

      const audioBlob = blob || new Blob([], { type: 'audio/mp3' });

      try {
        const next = await submitAnswer(interviewId, audioBlob);
        if (!isSessionCurrent(nextSessionGen)) return;

        if (!next || !next.question) {
          setState(STATES.INTERVIEW_ENDED);
          try {
            const report = await endInterview(interviewId);
            onFinished?.(report);
          } catch {
            onFinished?.(null);
          }
          return;
        }

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

  /**
   * ISSUE 1 FIX (Method 2 — manual finish): lets the view end recording on
   * demand, e.g. from a click on the "Listening…" indicator. Only acts if
   * we're actually in a listening phase for the currently-live session —
   * a stale click after the state has already moved on is a no-op, same
   * generation-guard discipline as every other transition in this file.
   */
  const finishAnswering = useCallback(() => {
    const mySessionGen = activeSessionGenRef.current;
    if (mySessionGen === null || !isSessionCurrent(mySessionGen)) return;
    if (state !== STATES.LISTENING && state !== STATES.SILENCE_WARNING) return;
    finalizeAnswer(mySessionGen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isSessionCurrent, finalizeAnswer]);

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

  const notifyAiFinishedSpeaking = useCallback(() => {
    handleAudioFinished();
  }, [handleAudioFinished]);

  const notifyAiAudioFailed = useCallback(() => {
    handleAudioFinished();
  }, [handleAudioFinished]);

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
    finishAnswering,
  };
}