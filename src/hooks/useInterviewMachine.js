import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceCapture } from './useVoiceCapture';
import { submitAnswer, endInterview } from '../api/interview';

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
    console.log('[machine] entered WAIT_AFTER_AUDIO');
    clearPendingTimer();
    setNotice(null);
    setTranscript('');

    const myTimerGen = timerGenRef.current;
    timerHandleRef.current = setTimeout(() => {
      if (!isTimerCurrent(myTimerGen)) return;
      console.log('[machine] WAIT_AFTER_AUDIO timer fired -> LISTENING');
      setState(STATES.LISTENING);
    }, WAIT_AFTER_AUDIO_MS);

    return () => clearPendingTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    console.log("========== ENTER LISTENING EFFECT ==========");
    console.log("state:", state);
    console.log("hasSpoken:", hasSpokenRef.current);
    if (state !== STATES.LISTENING || hasSpokenRef.current) return;
    

    let cancelled = false;
    const mySessionGen = ++sessionGenRef.current;
    activeSessionGenRef.current = mySessionGen;
    console.log('[machine] opening new session, sessionGen=', mySessionGen);
    setTranscript('');

    hasSpokenRef.current = false;
    lastVoiceTsRef.current = 0;

    (async () => {
      try {
        console.log("capture.start() called");
        await capture.start({
          onVolume: (rms) => {
            if (!isSessionCurrent(mySessionGen)) return;
            setLevel((prev) => prev * 0.6 + Math.min(rms * 4, 1) * 0.4);

            if (rms > VOLUME_THRESHOLD) {
              lastVoiceTsRef.current = Date.now();
              const wasFirstSpeech = !hasSpokenRef.current;
              hasSpokenRef.current = true;
              if (wasFirstSpeech) {
                console.log('[machine] first speech detected, sessionGen=', mySessionGen);
                clearPendingTimer();
                isRepeatPassRef.current = false;
                setNotice(null);
                setState(STATES.LISTENING);
                fnsRef.current.armTrailingSilenceWatch(mySessionGen);
              }
            }
          },
          onTranscript: (text) => {
            console.log("TRANSCRIPT:", text);
            if (!isSessionCurrent(mySessionGen)) {
              console.log('[machine] onTranscript IGNORED — stale session. mySessionGen=', mySessionGen, 'current=', sessionGenRef.current);
              return;
            }
            setTranscript(text);
          },
        });
        console.log('[machine] capture.start() resolved for sessionGen=', mySessionGen);
      } catch (err) {
        console.log('[machine] capture.start() THREW:', err);
        if (cancelled || !isSessionCurrent(mySessionGen)) return;
        setState(STATES.FATAL_ERROR);
        onFatal?.('Microphone access is required for the voice interview. Please allow microphone permissions and refresh.');
        return;
      }

      if (cancelled || !isSessionCurrent(mySessionGen)) {
        console.log('[machine] session superseded right after capture.start(), cancelling. mySessionGen=', mySessionGen, 'current=', sessionGenRef.current);
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
        console.log('[machine] trailing silence threshold hit, sessionGen=', mySessionGen);
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
    console.log('[machine] finalizeAnswer() called, mySessionGen=', mySessionGen, 'currentSessionGen=', sessionGenRef.current);
    if (!isSessionCurrent(mySessionGen)) {
      console.log('[machine] finalizeAnswer BAILED — session mismatch');
      return;
    }
    isRepeatPassRef.current = false;

    clearPendingTimer();

    hasSpokenRef.current = false;
    lastVoiceTsRef.current = 0;
    activeSessionGenRef.current = null;

    sessionGenRef.current += 1;
    setState(STATES.PROCESSING_ANSWER);
    setNotice(null);
    const nextSessionGen = sessionGenRef.current;

    let blob = null;
    try {
      blob = await capture.stop();
      console.log('[machine] capture.stop() resolved, blob=', blob);
    } catch (err) {
      console.log('[machine] capture.stop() THREW:', err);
    }
    if (!isSessionCurrent(nextSessionGen)) {
      console.log('[machine] finalizeAnswer BAILED after stop() — superseded');
      return;
    }

    const audioBlob = blob || new Blob([], { type: 'audio/mp3' });

    try {
      console.log('[machine] calling submitAnswer()');
      const next = await submitAnswer(interviewId, audioBlob);
      console.log('[machine] submitAnswer() resolved:', next);
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

      hasSpokenRef.current = false;
      activeSessionGenRef.current = null;
      lastVoiceTsRef.current = 0;
      isRepeatPassRef.current = false;

      setTranscript('');
      setNotice(null);
      setLevel(0);

      setQuestion(next);
      setState(STATES.AI_SPEAKING);
    } catch (err) {
      console.log('[machine] submitAnswer() THREW:', err);
      if (!isSessionCurrent(nextSessionGen)) return;
      setState(STATES.FATAL_ERROR);
      onFatal?.(err.message || 'Something went wrong submitting your answer.');
    }
  }

  const finishAnswering = useCallback(() => {
    console.log('[machine] finishAnswering() called, activeSessionGen=', activeSessionGenRef.current, 'isSessionCurrent=', isSessionCurrent(activeSessionGenRef.current), 'state=', state);
    const mySessionGen = activeSessionGenRef.current;
    if (mySessionGen === null || !isSessionCurrent(mySessionGen)) {
      console.log('[machine] finishAnswering BAILED — session mismatch');
      return;
    }
    if (state !== STATES.LISTENING && state !== STATES.SILENCE_WARNING) {
      console.log('[machine] finishAnswering BAILED — wrong state:', state);
      return;
    }
    console.log('[machine] finishAnswering PROCEEDING to finalizeAnswer');
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