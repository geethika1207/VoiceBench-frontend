/**
 * Autoplay-unlock utility.
 *
 * Browsers only allow audio-with-sound to autoplay once a page has received
 * a genuine user gesture, and that allowance can be tied to the specific
 * <audio> element (Safari/iOS) rather than the whole document. If we create
 * a fresh <audio> element on the interview page — which mounts *after* an
 * async network round trip to start the interview — the gesture from the
 * "Start Interview" click may no longer cover it, especially if the backend
 * is slow to respond (e.g. a cold-starting free-tier host).
 *
 * The fix: keep ONE persistent <audio> element for the whole app lifetime,
 * and "unlock" it synchronously inside the click handler that starts the
 * interview — before any `await`. Playing (and immediately pausing) it at
 * that moment ties the browser's autoplay grant to this exact element,
 * which we then reuse on the interview screen regardless of how long the
 * network request took.
 */

let sharedAudioEl = null;

// A ~0.01s silent WAV, so `.play()` has something valid to play instead of
// throwing on an empty `src`.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function getSharedAudioElement() {
  if (!sharedAudioEl) {
    sharedAudioEl = new Audio();
    sharedAudioEl.setAttribute('playsinline', '');
    sharedAudioEl.preload = 'auto';
  }
  return sharedAudioEl;
}

/** Call this synchronously inside a real click/submit handler, before any `await`. */
export function unlockAudio() {
  const el = getSharedAudioElement();
  try {
    const previousSrc = el.src;
    el.src = SILENT_WAV;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.src = previousSrc || '';
        })
        .catch(() => {
          // If even the silent unlock clip is blocked, later real playback
          // will fall back to the retry-then-skip behavior in the view.
        });
    } else {
      el.pause();
    }
  } catch {
    /* best-effort only */
  }
}