import { useCallback, useRef } from 'react';

/**
 * Wraps getUserMedia + MediaRecorder + a WebAudio analyser so the interview
 * screen can:
 *  - record the candidate's answer
 *  - measure live volume to know when someone is speaking vs. silent
 *  - show a live transcript via the browser's SpeechRecognition API when
 *    available (Chrome/Edge). Falls back to a generic "Listening…"
 *    indicator on browsers without it (e.g. Safari, Firefox).
 *
 * ISSUE 2/3 FIX: `recognition.stop()` is asynchronous — the browser does
 * not guarantee the previous SpeechRecognition session has fully released
 * before a new one is started. On question 1 there's no prior session to
 * conflict with, so `.start()` always succeeds. From question 2 onward, if
 * the previous session hadn't fully torn down yet, starting a new one can
 * throw `InvalidStateError`, which was being silently swallowed — recording
 * itself kept working (a separate MediaRecorder), but the transcript never
 * started again. This version waits a beat after teardown before starting
 * a new recognition session, and retries once if the browser still throws.
 */
export function useVoiceCapture() {
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recognitionRef = useRef(null);
  const recognitionStopPromiseRef = useRef(Promise.resolve());

  const start = useCallback(async ({ onVolume, onTranscript } = {}) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // --- volume analysis ---
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      onVolume?.(rms);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    // --- recording ---
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;

    // --- live transcript ---
    // Wait for the previous session's teardown to actually finish before
    // starting a new one — this is the fix for the "transcript only works
    // on question 1" bug. `recognitionStopPromiseRef` resolves once the
    // last `stop()`/`cancel()` call has settled.
    await recognitionStopPromiseRef.current;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionClass && onTranscript) {
      startRecognition(SpeechRecognitionClass, onTranscript, /* isRetry */ false);
    }
  }, []);

  function startRecognition(SpeechRecognitionClass, onTranscript, isRetry) {
    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        onTranscript(text);
      };
      recognition.onerror = () => {};
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
      if (!isRetry) {
        // The previous session likely hadn't fully released yet — wait a
        // beat and try exactly once more before giving up for this
        // question (falling back to no live transcript, but recording
        // continues normally either way).
        setTimeout(() => startRecognition(SpeechRecognitionClass, onTranscript, true), 250);
      }
    }
  }

  /** Stops everything and resolves with the recorded audio Blob. */
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    }).finally(() => {
      teardown();
    });
  }, []);

  function teardown() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    // Track when the recognition session actually finishes stopping, so the
    // *next* start() can wait for it instead of racing it.
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionStopPromiseRef.current = new Promise((resolve) => {
        const finish = () => resolve();
        try {
          recognition.onend = finish;
          recognition.stop();
          // Safety net: some browsers never fire onend reliably after stop().
          setTimeout(finish, 300);
        } catch {
          finish();
        }
      });
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    recorderRef.current = null;
  }

  /** Hard cancel without resolving a blob (e.g. component unmount). */
  const cancel = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
    teardown();
  }, []);

  return { start, stop, cancel };
}