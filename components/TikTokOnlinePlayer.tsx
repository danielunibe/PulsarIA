'use client';

import { useEffect, useRef, useState } from 'react';
import { isTikTokPlayerMessage, tiktokPlayerUrl } from '@/lib/tiktok-player';

interface TikTokOnlinePlayerProps {
  originalUrl: string;
  title: string;
  playing?: boolean;
  muted?: boolean;
  onStateChange?: (playing: boolean) => void;
  onTimeChange?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}

function PlayerFrame({ originalUrl, title, playing = true, muted = false, onStateChange, onTimeChange, onEnded }: TikTokOnlinePlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const callbacksRef = useRef({ onStateChange, onTimeChange, onEnded });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const playerUrl = tiktokPlayerUrl(originalUrl);
  useEffect(() => { callbacksRef.current = { onStateChange, onTimeChange, onEnded }; }, [onEnded, onStateChange, onTimeChange]);

  useEffect(() => {
    let ready = false;
    const timeout = setTimeout(() => { if (!ready) setStatus('error'); }, 20000);
    const receive = (event: MessageEvent) => {
      if (!isTikTokPlayerMessage(event, frameRef.current?.contentWindow)) return;
      if (event.data.type === 'onPlayerReady') { ready = true; clearTimeout(timeout); setStatus('ready'); }
      if (event.data.type === 'onPlayerError') { clearTimeout(timeout); setStatus('error'); }
      if (event.data.type === 'onStateChange') {
        if (event.data.value === 1 || event.data.value === 2) callbacksRef.current.onStateChange?.(event.data.value === 1);
        if (event.data.value === 0) callbacksRef.current.onEnded?.();
      }
      if (event.data.type === 'onCurrentTime') {
        const { currentTime, duration } = event.data.value ?? {};
        if (Number.isFinite(currentTime) && Number.isFinite(duration)) callbacksRef.current.onTimeChange?.(currentTime, duration);
      }
    };
    window.addEventListener('message', receive);
    return () => { clearTimeout(timeout); window.removeEventListener('message', receive); };
  }, [attempt]);

  useEffect(() => {
    if (status !== 'ready') return;
    const frameWindow = frameRef.current?.contentWindow;
    for (const type of [playing ? 'play' : 'pause', muted ? 'mute' : 'unMute']) {
      frameWindow?.postMessage({ type, 'x-tiktok-player': true }, 'https://www.tiktok.com');
    }
  }, [muted, playing, status]);

  if (!playerUrl) return <p role="status">Este enlace no admite reproducción online.</p>;
  return (
    <div className="pulsaria-online-player">
      <iframe key={attempt} ref={frameRef} src={playerUrl} title={`Reproducción online: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      {status === 'loading' && <span className="pulsaria-online-player__status" role="status">Conectando con TikTok…</span>}
      {status === 'error' && <div className="pulsaria-online-player__error" role="status">
        <p>TikTok no ha podido reproducir este video. Comprueba la conexión o su disponibilidad.</p>
        <button type="button" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1); }}>Reintentar</button>
        <a href={originalUrl} target="_blank" rel="noopener noreferrer">Abrir en TikTok</a>
      </div>}
    </div>
  );
}

export function TikTokOnlinePlayer(props: TikTokOnlinePlayerProps) {
  return <PlayerFrame key={props.originalUrl} {...props} />;
}
