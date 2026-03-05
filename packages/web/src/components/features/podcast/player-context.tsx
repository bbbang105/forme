'use client';

import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,} from 'react';
import { addListeningTime } from '@/lib/actions/activity';

export interface Episode {
  id: string;
  title: string;
  description: string | null;
  audioUrl: string;
  duration: number | null;
  fileSize: number | null;
  publishedAt: string;
  createdAt: string;
}

interface PlayerState {
  episode: Episode | null;
  isPlaying: boolean;
  isRestored: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isLoading: boolean;
}

interface PlayerControls {
  play: (episode: Episode, startTime?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  close: () => void;
}

const STORAGE_KEY = 'forme-podcast-progress';

const PlayerContext = createContext<(PlayerState & PlayerControls) | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const savedTimeRef = useRef(0);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => { setIsPlaying(true); setIsLoading(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      localStorage.removeItem(STORAGE_KEY);
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onError = () => { setIsLoading(false); setIsPlaying(false); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Restore last session from localStorage (runs once after mount)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        episode: Episode;
        currentTime: number;
        playbackRate: number;
        volume: number;
      };
      if (saved?.episode?.id && saved.currentTime > 0) {
        savedTimeRef.current = saved.currentTime;
        // Batch state restoration via microtask to avoid cascading render lint
        queueMicrotask(() => {
          setEpisode(saved.episode);
          setCurrentTime(saved.currentTime);
          setIsRestored(true);
          if (saved.episode.duration) setDuration(saved.episode.duration);
          if (saved.playbackRate) setPlaybackRateState(saved.playbackRate);
          if (typeof saved.volume === 'number') setVolumeState(saved.volume);
        });
      }
    } catch { /* ignore corrupted data */ }
  }, []);

  // Save progress + beforeunload (merged — no refs needed)
  useEffect(() => {
    if (!episode || isRestored) return;

    const save = () => {
      const audio = audioRef.current;
      if (!audio || !audio.currentTime) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        episode,
        currentTime: audio.currentTime,
        playbackRate,
        volume,
      }));
    };

    save();
    const interval = setInterval(save, 3000);
    const audio = audioRef.current;
    audio?.addEventListener('pause', save);
    window.addEventListener('beforeunload', save);

    return () => {
      clearInterval(interval);
      audio?.removeEventListener('pause', save);
      window.removeEventListener('beforeunload', save);
    };
  }, [episode, isRestored, playbackRate, volume]);

  // Sync podcast listening time to DB for gamification (every 30s while playing)
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(async () => {
      try {
        await addListeningTime(30);
      } catch { /* gamification non-critical */ }
    }, 30_000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const play = useCallback((ep: Episode, startTime?: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    setEpisode(ep);
    setIsLoading(true);
    setIsRestored(false);
    setCurrentTime(startTime ?? 0);
    setDuration(0);
    audio.src = ep.audioUrl;
    audio.playbackRate = playbackRate;
    audio.volume = volume;

    // Save immediately so progress persists even on quick refresh
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      episode: ep,
      currentTime: startTime ?? 0,
      playbackRate,
      volume,
    }));

    // 충분히 버퍼링된 후 재생 시작 (모바일 네트워크 대응)
    const onReady = () => {
      if (startTime && startTime > 0) {
        audio.currentTime = startTime;
      }
      audio.play().catch(console.error);
      audio.removeEventListener('canplay', onReady);
    };
    audio.addEventListener('canplay', onReady);
    audio.load();
  }, [playbackRate, volume]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(console.error);
  }, []);

  const togglePlay = useCallback(() => {
    if (isRestored && episode) {
      play(episode, savedTimeRef.current);
      return;
    }
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play().catch(console.error);
    }
  }, [isPlaying, isRestored, episode, play]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const skipForward = useCallback((seconds = 15) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(audio.currentTime + seconds, audio.duration || 0);
  }, []);

  const skipBackward = useCallback((seconds = 15) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(audio.currentTime - seconds, 0);
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setEpisode(null);
    setIsPlaying(false);
    setIsRestored(false);
    setCurrentTime(0);
    setDuration(0);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Memoize the context value so that consumers only re-render when a piece of
  // state they actually depend on changes, not on every unrelated update.
  const value = useMemo(
    () => ({
      episode,
      isPlaying,
      isRestored,
      currentTime,
      duration,
      volume,
      playbackRate,
      isLoading,
      play,
      pause,
      resume,
      togglePlay,
      seek,
      setVolume,
      setPlaybackRate,
      skipForward,
      skipBackward,
      close,
    }),
    [
      episode,
      isPlaying,
      isRestored,
      currentTime,
      duration,
      volume,
      playbackRate,
      isLoading,
      play,
      pause,
      resume,
      togglePlay,
      seek,
      setVolume,
      setPlaybackRate,
      skipForward,
      skipBackward,
      close,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
