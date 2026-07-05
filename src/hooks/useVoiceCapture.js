import { useCallback, useRef } from 'react';

export function useVoiceCapture() {
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recognitionRef = useRef(null); // ONE instance, reused for the whole interview
  const recognitionActiveRef = useRef(false);
  const onTranscriptRef = useRef(null);

  function getOrCreateRecognition() {
    if (recognitionRef.current) return recognitionRef.current;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return null;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      console.log('[capture] onresult fired');
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      onTranscriptRef.current?.(text);
    };
    recognition.onend = () => {
      console.log('[capture] onend fired');
      recognitionActiveRef.current = false;
    };
    recognition.onerror = (event) => {
      console.log('[capture] onerror fired:', event.error);
      recognitionActiveRef.current = false;
    };
    recognitionRef.current = recognition;
    return recognition;
  }

  const start = useCallback(async ({ onVolume, onTranscript } = {}) => {
    console.log('[capture] start() called');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[capture] getUserMedia resolved');
    streamRef.current = stream;

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
    console.log('[capture] MediaRecorder started, state=', recorder.state);

    onTranscriptRef.current = onTranscript || null;
    const recognition = getOrCreateRecognition();
    console.log('[capture] about to call recognition.start(), recognitionActiveRef =', recognitionActiveRef.current, 'recognition exists =', !!recognition);
    if (recognition && !recognitionActiveRef.current) {
      try {
        recognition.start();
        recognitionActiveRef.current = true;
        console.log('[capture] recognition.start() succeeded');
      } catch (err) {
        console.log('[capture] recognition.start() THREW:', err.name, err.message);
        recognitionActiveRef.current = false;
      }
    }
  }, []);

  const stop = useCallback(() => {
    console.log('[capture] stop() called, recorder state=', recorderRef.current?.state);
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        console.log('[capture] stop() — recorder missing or already inactive, resolving null');
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        console.log('[capture] recorder.onstop fired, blob size=', blob.size);
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    }).finally(() => {
      teardown();
    });
  }, []);

  function teardown() {
    console.log('[capture] teardown() called');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (recognitionRef.current && recognitionActiveRef.current) {
      try {
        recognitionRef.current.stop();
        console.log('[capture] recognition.stop() called in teardown');
      } catch (err) {
        console.log('[capture] recognition.stop() THREW in teardown:', err.name, err.message);
      }
    }
    onTranscriptRef.current = null;

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

  const cancel = useCallback(() => {
    console.log('[capture] cancel() called');
    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
    teardown();
  }, []);

  return { start, stop, cancel };
}