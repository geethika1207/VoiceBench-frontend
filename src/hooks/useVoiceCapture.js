import { useCallback, useRef } from 'react';

/**
 * Wraps getUserMedia + MediaRecorder + a WebAudio analyser so the interview
 * screen can:
 *  - record the candidate's answer
 *  - measure live volume to know when someone is speaking vs. silent
 *  - (optionally) show a live transcript via the browser's SpeechRecognition
 *    API when available (Chrome/Edge). Falls back to a generic "Listening…"
 *    indicator on browsers without it (e.g. Safari, Firefox).
 */
export function useVoiceCapture() {
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recognitionRef = useRef(null);

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

    // --- optional live transcript ---
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionClass && onTranscript) {
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
      }
    }
  }, []);

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
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
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
