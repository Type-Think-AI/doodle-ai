/* Voice mode surface — the "talk to your doodle" experience.
 *
 * Rendered INSIDE the DoodleCanvas island (the app's single React graph); see
 * the note in DoodleCanvas.tsx for why it must not be its own island.
 *
 * Design contract:
 *   - It stays OUT OF THE WAY. The canvas is the point; this HUD is a small
 *     floating layer, never a full-screen takeover. Idle is a single
 *     bottom-centre banner ("Talk to Elsa"); live is a small morphing blob
 *     pinned bottom-right, with call controls that appear on hover/tap.
 *     (Reference: Claude Design "Voice Mode".)
 *   - It ALWAYS renders something. Every branch ends in visible UI, including
 *     failures — a blank screen with no action is the worst state.
 *   - The agent speaks FIRST, by name, so the user knows who is on the line.
 *   - ONE microphone prompt. The voice client asks for the mic itself when the
 *     call starts; this component must not pre-flight getUserMedia as well.
 *   - Voice mode hides the chat composer, so the ONLY way to hand over a photo
 *     is here: "Add a photo" uploads and tells the agent in the same
 *     "Attached photo: <url>" form the typed path uses.
 *   - Consumer language only: no socket/STT/TTS/model/latency words.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceAgent } from '@cloudflare/voice/react';

export interface VoiceHudProps {
  /** Fired whenever the doodle sends something for the board to paint. */
  onCanvasEvent?: (event: unknown) => void;
  /** Called when the user closes voice mode. */
  onExit?: () => void;
}

/* The agent's name. "Elsa" — a real European given name, short and warm.
 * Mirrored in src/voice/VoiceRoom.ts (the greeting is both heard and read, so
 * the two must agree). */
const AGENT_NAME = 'Elsa';
const GREETING = `Hey, I'm ${AGENT_NAME}. Tell me what to doodle.`;

/* Warm palette lifted from the reference design. Never blue/violet. */
const C = {
  panelBg: 'rgba(18,15,13,0.82)',
  panelBorder: 'rgba(242,236,228,0.12)',
  text: '#f2ece4',
  dim: '#8b827a',
  iconText: '#cfc7bd',
  iconBorder: 'rgba(242,236,228,0.16)',
  iconBg: 'rgba(255,255,255,0.03)',
  dangerBorder: 'rgba(233,120,90,0.35)',
  dangerBg: 'rgba(233,120,90,0.14)',
  dangerText: '#f0b6a4',
};

/* Conic sweep through the warm blob palette. */
const BLOB_STOPS = '#f7dcae, #dd9c40, #b9762a, #f3cd93, #f7dcae';
const BLOB_GRADIENT = `conic-gradient(from 0deg, ${BLOB_STOPS})`;
const BLOB_GRADIENT_REV = `conic-gradient(from 90deg, ${BLOB_STOPS})`;

type Stage = 'idle' | 'connecting' | 'live' | 'denied' | 'failed';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * The morphing gradient blob. A soft organic shape that breathes and shifts
 * hue — warm and alive at every size. `aura` adds a blurred halo behind it
 * (used at the larger live size; the small banner blob skips it).
 */
function Blob({
  size,
  aura,
  reducedMotion,
}: {
  size: number;
  aura?: boolean;
  reducedMotion: boolean;
}) {
  return (
    <div
      style={{ position: 'relative', width: size, height: size, flex: 'none' }}
      aria-hidden="true"
    >
      {aura ? (
        <div
          style={{
            position: 'absolute',
            inset: -14,
            borderRadius: '44% 56% 60% 40% / 48% 42% 58% 52%',
            background: BLOB_GRADIENT_REV,
            filter: 'blur(18px)',
            opacity: 0.5,
            animation: reducedMotion
              ? undefined
              : 'doodleBlobMorph 5s ease-in-out infinite reverse, doodleBlobBreathe 2.6s ease-in-out infinite',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '46% 54% 58% 42% / 50% 44% 56% 50%',
          background: BLOB_GRADIENT,
          boxShadow:
            '0 12px 32px rgba(214,146,54,0.4), inset 0 0 20px rgba(255,255,255,0.12)',
          animation: reducedMotion
            ? undefined
            : 'doodleBlobMorph 4.5s ease-in-out infinite, doodleBlobBreathe 1.8s ease-in-out infinite, doodleBlobHue 3.6s ease-in-out infinite',
        }}
      />
    </div>
  );
}

const roundBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  flex: 'none',
  borderRadius: '50%',
  border: `1px solid ${C.iconBorder}`,
  background: C.iconBg,
  color: C.iconText,
  font: 'inherit',
  fontSize: 15,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default function VoiceHud({ onCanvasEvent, onExit }: VoiceHudProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [stage, setStage] = useState<Stage>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const seenMessage = useRef<unknown>(undefined);
  const greetedRef = useRef(false);
  const startedRef = useRef(false);

  const {
    isMuted,
    connected,
    error,
    startCall,
    endCall,
    toggleMute,
    sendText,
    lastCustomMessage,
  } = useVoiceAgent({
    agent: 'VoiceRoom',
    enabled: token !== null,
    query: token ? { token } : undefined,
  });

  useEffect(() => {
    if (lastCustomMessage === undefined || lastCustomMessage === null) return;
    if (seenMessage.current === lastCustomMessage) return;
    seenMessage.current = lastCustomMessage;
    const ev = lastCustomMessage as { type?: string; text?: string };
    if (ev?.type === 'text' && ev.text) {
      setLastLine((prev) => ((prev ?? '') + ev.text!).slice(-180));
    }
    onCanvasEvent?.(lastCustomMessage);
  }, [lastCustomMessage, onCanvasEvent]);

  useEffect(() => {
    if (!connected || greetedRef.current) return;
    greetedRef.current = true;
    setStage('live');
    setLastLine(GREETING);
  }, [connected]);

  /* Never spin forever: if the line does not open, say so and offer a retry. */
  useEffect(() => {
    if (stage !== 'connecting') return;
    const t = window.setTimeout(() => {
      setStage((s) => (s === 'connecting' ? 'failed' : s));
      setNotice(`${AGENT_NAME} couldn't pick up. Try again in a moment.`);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [stage]);

  /* Call timer — runs only while live, resets otherwise. */
  useEffect(() => {
    if (stage !== 'live') {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  const begin = useCallback(async () => {
    setNotice(null);
    setStage('connecting');
    /* No getUserMedia here on purpose — the voice client requests the mic when
       the call starts. Asking first as well produced TWO browser prompts. */
    try {
      /* `Content-Type: application/json` and an explicit body, even though this
         route takes no input. A bodyless POST sends NO content type, which the
         remote preview layer (`wrangler dev --remote`) rejects with a CSRF
         guard BEFORE our Worker runs. Inert in production; keeps local dev
         reachable. */
      const res = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        setStage('failed');
        /* Branch on OUR error envelope, never on the bare status. */
        const body = (await res.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        const code = body?.error?.code;
        if (code === 'unauthenticated') {
          window.dispatchEvent(new Event('doodleai:open-auth'));
          setNotice(`Sign in and ${AGENT_NAME} will be right here.`);
        } else if (code === 'forbidden') {
          setNotice(`Your role can't start talk mode.`);
        } else {
          setNotice("Couldn't start talk mode.");
        }
        return;
      }
      const { token: minted } = (await res.json()) as { token?: string };
      if (!minted) {
        setStage('failed');
        setNotice("Couldn't start talk mode.");
        return;
      }
      setToken(minted);
    } catch {
      setStage('failed');
      setNotice('No connection. Check your network and try again.');
    }
  }, []);

  /* startCall runs once the socket is up (token accepted), not inline in begin. */
  useEffect(() => {
    if (token === null || !connected || startedRef.current) return;
    startedRef.current = true;
    void startCall().catch((err: unknown) => {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStage('denied');
        setNotice(
          `${AGENT_NAME} needs your microphone. Allow it in your browser, then tap Try again.`,
        );
      } else {
        setStage('failed');
        setNotice(`${AGENT_NAME} couldn't pick up. Try again in a moment.`);
      }
    });
  }, [token, connected, startCall]);

  const finish = useCallback(() => {
    try {
      endCall();
    } catch {
      /* already closed */
    }
    greetedRef.current = false;
    startedRef.current = false;
    setToken(null);
    setStage('idle');
    setLastLine(null);
    setNotice(null);
    setControlsOpen(false);
    onExit?.();
  }, [endCall, onExit]);

  /* Photo hand-off. Voice mode hides the composer, so this is the only route
     for a user's own picture. Upload → put it on the board → tell the agent in
     the SAME "Attached photo: <url>" form the typed path uses. */
  const onPickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      setNotice(null);
      try {
        const body = new FormData();
        body.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body });
        if (!res.ok) {
          setNotice("That photo didn't upload. Try another one.");
          return;
        }
        const { url } = (await res.json()) as { url?: string };
        if (!url) {
          setNotice("That photo didn't upload. Try another one.");
          return;
        }
        onCanvasEvent?.({ type: 'image', url });
        try {
          sendText?.(`Attached photo: ${url}`);
        } catch {
          /* not connected yet — the board still has it */
        }
        setLastLine('Got your photo. Tell me what to do with it.');
      } catch {
        setNotice("That photo didn't upload. Try another one.");
      } finally {
        setUploading(false);
      }
    },
    [onCanvasEvent, sendText],
  );

  const live = stage === 'live';
  const connecting = stage === 'connecting';
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const startLabel = connecting
    ? `Getting ${AGENT_NAME}…`
    : stage === 'idle'
      ? 'Start talking'
      : 'Try again';

  const subtitle =
    notice ??
    (error
      ? `${AGENT_NAME} lost you for a second — tap Try again.`
      : 'Say what you want and she sketches it live.');

  return (
    /* Full-stage layer that lets pointer events fall through to the board
       except on the HUD's own controls. */
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 340,
        pointerEvents: 'none',
        font: 'inherit',
        color: C.text,
      }}
    >
      <style>{`
        @keyframes doodleBlobMorph {
          0%   { border-radius: 42% 58% 62% 38% / 46% 40% 60% 54%; }
          25%  { border-radius: 58% 42% 40% 60% / 62% 55% 45% 38%; }
          50%  { border-radius: 48% 52% 55% 45% / 40% 62% 38% 60%; }
          75%  { border-radius: 62% 38% 48% 52% / 54% 42% 58% 46%; }
          100% { border-radius: 42% 58% 62% 38% / 46% 40% 60% 54%; }
        }
        @keyframes doodleBlobBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes doodleBlobHue {
          0%   { filter: hue-rotate(0deg) saturate(1); }
          50%  { filter: hue-rotate(28deg) saturate(1.2); }
          100% { filter: hue-rotate(0deg) saturate(1); }
        }
        @keyframes doodleVoiceRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Screen-reader running commentary — the visible HUD stays minimal. */}
      <p
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {notice ?? lastLine ?? ''}
      </p>

      {/* Hidden picker driving "Add a photo". */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onPickFile(e.target.files?.[0])}
      />

      {live ? (
        /* ---- LIVE: small blob pinned bottom-right, controls on hover/tap ---- */
        <div
          onMouseEnter={() => setControlsOpen(true)}
          onMouseLeave={() => setControlsOpen(false)}
          style={{
            position: 'absolute',
            right: 'clamp(16px, 3vw, 32px)',
            bottom: 'clamp(16px, 3vh, 32px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 12,
            pointerEvents: 'auto',
          }}
        >
          {controlsOpen || isMuted ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                borderRadius: 999,
                background: 'rgba(18,15,13,0.88)',
                border: `1px solid ${C.panelBorder}`,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
                animation: reducedMotion ? undefined : 'doodleVoiceRise .18s ease both',
              }}
            >
              <span
                style={{
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  fontSize: 12,
                  color: '#a89e93',
                  padding: '0 6px',
                }}
              >
                {mm}:{ss}
              </span>
              <button
                type="button"
                style={roundBtn}
                onClick={toggleMute}
                aria-pressed={isMuted}
                aria-label={isMuted ? 'Turn my mic back on' : 'Mute my mic'}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🎙'}
              </button>
              <button
                type="button"
                style={roundBtn}
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Add a photo"
                title={uploading ? 'Adding…' : 'Add a photo'}
              >
                +
              </button>
              <button
                type="button"
                style={{
                  ...roundBtn,
                  border: `1px solid ${C.dangerBorder}`,
                  background: C.dangerBg,
                  color: C.dangerText,
                }}
                onClick={finish}
                aria-label="End call"
                title="End"
              >
                ✕
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setControlsOpen((v) => !v)}
            aria-label="Voice session controls"
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            <Blob size={76} aura reducedMotion={reducedMotion} />
          </button>
        </div>
      ) : (
        /* ---- IDLE / connecting / denied / failed: bottom-centre banner ---- */
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'clamp(14px, 3vh, 30px)',
            transform: 'translateX(-50%)',
            width: 'min(560px, calc(100vw - 24px))',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(12px, 2vw, 18px)',
              flexWrap: 'wrap',
              borderRadius: 26,
              border: `1px solid ${C.panelBorder}`,
              background: C.panelBg,
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              boxShadow:
                '0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
              padding: 'clamp(12px, 2vw, 16px) clamp(14px, 2.2vw, 20px)',
              animation: reducedMotion ? undefined : 'doodleVoiceRise .4s ease both',
            }}
          >
            <Blob size={44} reducedMotion={reducedMotion} />

            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'clamp(16px, 2.2vw, 19px)',
                  fontWeight: 500,
                  letterSpacing: '-0.015em',
                }}
              >
                {connecting ? `Getting ${AGENT_NAME}…` : `Talk to ${AGENT_NAME}`}
              </div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>{subtitle}</div>
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title={uploading ? 'Adding…' : 'Add a photo'}
              aria-label="Add a photo"
              style={{
                width: 44,
                height: 44,
                flex: 'none',
                borderRadius: '50%',
                border: `1px solid rgba(242,236,228,0.16)`,
                background: 'rgba(255,255,255,0.03)',
                color: C.iconText,
                font: 'inherit',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>

            <button
              type="button"
              onClick={begin}
              disabled={connecting || uploading}
              style={{
                height: 46,
                padding: '0 22px',
                flex: 'none',
                borderRadius: 999,
                border: 0,
                background: 'linear-gradient(160deg, #f3cd93, #dd9c40)',
                color: '#24180a',
                font: 'inherit',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: connecting || uploading ? 'default' : 'pointer',
                opacity: connecting || uploading ? 0.75 : 1,
                boxShadow: '0 10px 26px rgba(214,146,54,0.3)',
              }}
            >
              {startLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
