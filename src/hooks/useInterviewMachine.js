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
const TRAILING_SILENCE_MS = 2200;
const VOLUME_THRESHOLD = 0.02;
const MAX_SILENCE_SKIPS = 3;

/**
 * Single-threaded interview state machine — one hook, one owner of every
 * timer and the microphone session.
 *
 * ROOT-CAUSE FIX FOR THIS ROUND: previously, the internal transition
 * functions (armInitialSilenceWatch, armWarningGraceWatch,
 * armTrailingSilenceWatch, enterRepeatQuestion, handleSilenceSkip,
 * finalizeAnswer) called each other by directly referencing the `const`
 * bound in a PREVIOUS render's closure, because their own `useCallback`
 * dependency arrays only listed stable primitives — so React never
 * recreated them, and the names they referenced internally resolved to
 * stale versions of each other (each closing over an old `capture` object
 * from `useVoiceCapture()`, which returns a brand-new object every
 * render). After a few question cycles, enough of these stale layers
 * stacked up that a click or a live transcript callback would silently
 * operate on a dead MediaRecorder/SpeechRecognition instance instead of
 * the real, currently-live one — explaining why Q1/Q2 worked (not enough
 * stale layers yet) and Q3+ didn't.
 *
 * The fix: every one of these functions is now defined ONCE, and they
 * call each other through a single `fnsRef` object that is reassigned in
 * full on every render, right before returning. There is exactly one
 * live copy of "the current version of every transition function" at
 * all times, so a click handler or a timer firing from any point in the
 * interview always reaches code closing over the CURRENT `capture`
 * object — never a stale one from a prior render.
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
  const activeSessionGenRef = useRef(null);

  // Single source of truth for "the current version of every internal
  // transition function." Reassigned every render (see bottom of hook),
  // so anything invoked through it — from a timer, a click, or a mic
  // callback scheduled in ANY prior render — always runs the version
  // closing over this render's `capture`, `interviewId`, etc.
  const fnsRef = useRef({});

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
                fnsRef.current.armTrailingSilenceWatch(mySessionGen);
              }
            }
          },
          onTranscript: (text) => {
            // Reached via the CURRENT render's `capture.start()` call every
            // time — this callback itself was never the stale part, but it's
            // routed the same way as everything else for consistency and to
            // guarantee it, too, is always checked against the live session.
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

      fnsRef.current.armInitialSilenceWatch(mySessionGen);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function armInitialSilenceWatch(mySessionGen) {
    clearPendingTimer();
    const myTimerGen = timerGenRef.current;
    const repeatPass = isRepeatPassRef.current;
    const waitMs = repeatPass ? REPEAT_SILENCE_MS : INITIAL_SILENCE_MS;

    timerHandleRef.current = setTimeout(() => {
      if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen) || hasSpokenRef.current) return;
      if (repeatPass) {
        fnsRef.current.handleSilenceSkip(mySessionGen);
      } else {
        setNotice('Are you still there?');
        setState(STATES.SILENCE_WARNING);
        fnsRef.current.armWarningGraceWatch(mySessionGen);
      }
    }, waitMs);
  }

  function armWarningGraceWatch(mySessionGen) {
    clearPendingTimer();
    const myTimerGen = timerGenRef.current;
    timerHandleRef.current = setTimeout(() => {
      if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen)) return;
      fnsRef.current.enterRepeatQuestion(mySessionGen);
    }, WARNING_GRACE_MS);
  }

  function armTrailingSilenceWatch(mySessionGen) {
    clearPendingTimer();
    const myTimerGen = timerGenRef.current;
    timerHandleRef.current = setInterval(() => {
      if (!isTimerCurrent(myTimerGen) || !isSessionCurrent(mySessionGen)) return;
      if (Date.now() - lastVoiceTsRef.current > TRAILING_SILENCE_MS) {
        fnsRef.current.finalizeAnswer(mySessionGen);
      }
    }, 200);
  }

  function enterRepeatQuestion(mySessionGen) {
    if (!isSessionCurrent(mySessionGen)) return;
    clearPendingTimer();
    sessionGenRef.current += 1;
    capture.cancel();
    hasSpokenRef.current = false;
    isRepeatPassRef.current = true;
    setNotice(null);
    setState(STATES.REPEAT_QUESTION);
  }

  async function handleSilenceSkip(mySessionGen) {
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

    await fnsRef.current.finalizeAnswer(mySessionGen);
  }

  async function finalizeAnswer(mySessionGen) {
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
  }

  /**
   * Manual finish (Problem 2 / Method B). Reads `activeSessionGenRef` —
   * always written by the LISTENING-entry effect for the currently live
   * session — and calls through `fnsRef` so it always reaches the CURRENT
   * render's real `finalizeAnswer`, regardless of how many question
   * cycles have happened. This is what was breaking after Q2: the old
   * code called `finalizeAnswer` directly by name, which (per the root
   * cause above) could be a stale closure by then.
   */
  const finishAnswering = useCallback(() => {
    const mySessionGen = activeSessionGenRef.current;
    if (mySessionGen === null || !isSessionCurrent(mySessionGen)) return;
    if (state !== STATES.LISTENING && state !== STATES.SILENCE_WARNING) return;
    fnsRef.current.finalizeAnswer(mySessionGen);
  }, [state, isSessionCurrent]);

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

  // Reassign EVERY render, unconditionally, so fnsRef.current always holds
  // this render's real functions — the single fix eliminating the stale-
  // closure drift described above.
  fnsRef.current = {
    armInitialSilenceWatch,
    armWarningGraceWatch,
    armTrailingSilenceWatch,
    enterRepeatQuestion,
    handleSilenceSkip,
    finalizeAnswer,
  };

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