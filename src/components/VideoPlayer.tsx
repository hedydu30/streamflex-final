import { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { refreshVideoToken } from "@/lib/secure-video";
import { usePlayerSettings, getPlayerStyles } from "@/hooks/usePlayerSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useActivityLog } from "@/hooks/useActivityLog";
import PlayerSettingsPanel from "@/components/PlayerSettingsPanel";
import EndScreenRecommendations from "@/components/EndScreenRecommendations";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, RotateCcw, Settings, X,
  Heart, ChevronUp, ChevronDown, PictureInPicture2
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useVerticalSwipe } from "@/hooks/useVerticalSwipe";

interface VideoPlayerProps {
  videoId: string;
  src: string;
  title: string;
  autoPlay?: boolean;
  onClose?: () => void;
  contentId?: string;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  mixIndex?: number;
  mixTotal?: number;
  modelName?: string;
  modelId?: string;
}

const SAVE_INTERVAL = 5;
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const VideoPlayer = ({ videoId, src, title, autoPlay = true, onClose, contentId, onNext, onPrev, hasNext, hasPrev, mixIndex, mixTotal, modelName, modelId }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef(0);

  const playerNavigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isFavorite, toggleFavorite } = useVideoFavorites();
  const { logEvent } = useActivityLog();
  const { settings: playerSettings } = usePlayerSettings();
  const playerStyles = getPlayerStyles(playerSettings);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [hoverTime, setHoverTime] = useState(0);
  const [hoverPct, setHoverPct] = useState(0);
  const [showHoverTime, setShowHoverTime] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [showEndScreen, setShowEndScreen] = useState(false);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbnailVideoRef = useRef<HTMLVideoElement | null>(null);

  const QUALITY_OPTIONS = [
    { value: "auto", label: "Auto (Meilleure)" },
    { value: "4k", label: "4K Ultra HD" },
    { value: "1080p", label: "1080p Full HD" },
    { value: "720p", label: "720p HD" },
    { value: "480p", label: "480p" },
    { value: "360p", label: "360p" },
  ];

  // --- Progress load/save ---
  useEffect(() => {
    if (!user || !videoId) return;
    const loadProgress = async () => {
      const { data } = await supabase
        .from("video_progress")
        .select("position_seconds, completed")
        .eq("user_id", user.id)
        .eq("video_id", videoId)
        .maybeSingle();
      if (data && data.position_seconds > 10 && !data.completed) {
        setResumePosition(data.position_seconds);
        setShowResumePrompt(true);
        const vid = videoRef.current;
        if (vid) { vid.pause(); setIsPlaying(false); }
        return;
      }
      const savedPos = localStorage.getItem(`video_progress_${videoId}`);
      if (savedPos) {
        const pos = parseFloat(savedPos);
        if (pos > 10) {
          setResumePosition(pos);
          setShowResumePrompt(true);
          const vid = videoRef.current;
          if (vid) { vid.pause(); setIsPlaying(false); }
        }
      }
    };
    loadProgress();
  }, [user, videoId]);

  const saveProgress = useCallback(async (time: number, dur: number) => {
    if (!user || !videoId || dur === 0) return;
    const now = Date.now();
    if (now - lastSaveRef.current < SAVE_INTERVAL * 1000) return;
    lastSaveRef.current = now;
    const percent = Math.round((time / dur) * 100);
    const completed = percent >= 95;
    localStorage.setItem(`video_progress_${videoId}`, time.toString());
    await supabase.from("video_progress").upsert(
      { user_id: user.id, video_id: videoId, position_seconds: Math.floor(time), duration_seconds: Math.floor(dur), watched_percent: percent, completed, updated_at: new Date().toISOString() },
      { onConflict: "user_id,video_id" }
    );
    if (contentId) {
      await supabase.from("content_views").upsert(
        { user_id: user.id, content_id: contentId, position_seconds: Math.floor(time), duration_seconds: Math.floor(dur), watched_percent: percent, completed, watched_at: new Date().toISOString(), device_info: navigator.userAgent.substring(0, 100) },
        { onConflict: "user_id,content_id" }
      );
    }
    await supabase.from("imported_videos").update({ last_accessed_at: new Date().toISOString() }).eq("id", videoId).eq("user_id", user.id);
  }, [user, videoId, contentId]);

  // --- Playback handlers ---
  const autoPlayAttemptedRef = useRef(false);
  const prevSrcRef = useRef<string | null>(null);
  const isMixTransition = useRef(false);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    if (user && videoId && video.duration && isFinite(video.duration)) {
      supabase.from("imported_videos").update({ duration_seconds: Math.floor(video.duration) }).eq("id", videoId).eq("user_id", user.id).is("duration_seconds", null);
    }
  }, [user, videoId]);

  const handleCanPlay = useCallback(() => {
    setIsLoading(false);
    const video = videoRef.current;
    if (!video) return;
    if (isMixTransition.current) {
      isMixTransition.current = false;
      video.play().catch(() => { video.muted = true; setIsMuted(true); video.play().catch(() => {}); });
      setIsPlaying(true);
      return;
    }
    if (!autoPlay || autoPlayAttemptedRef.current || showResumePrompt) return;
    autoPlayAttemptedRef.current = true;
    video.play().catch(() => { video.muted = true; setIsMuted(true); video.play().catch(() => {}); });
  }, [autoPlay]);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => { if (isPlaying) setShowControls(false); }, 3000);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    saveProgress(video.currentTime, video.duration);
  }, [saveProgress]);

  const handleProgress = () => {
    const video = videoRef.current;
    if (!video || video.buffered.length === 0) return;
    setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
  };

  const handleEnded = useCallback(async () => {
    const video = videoRef.current;
    if (video) video.pause();
    setIsPlaying(false);
    localStorage.removeItem(`video_progress_${videoId}`);
    logEvent("end", videoId, { duration: Math.floor(duration) });
    if (user) {
      await supabase.from("video_progress").upsert(
        { user_id: user.id, video_id: videoId, position_seconds: Math.floor(duration), duration_seconds: Math.floor(duration), watched_percent: 100, completed: true, updated_at: new Date().toISOString() },
        { onConflict: "user_id,video_id" }
      );
      if (contentId) {
        await supabase.from("content_views").upsert(
          { user_id: user.id, content_id: contentId, position_seconds: Math.floor(duration), duration_seconds: Math.floor(duration), watched_percent: 100, completed: true, watched_at: new Date().toISOString() },
          { onConflict: "user_id,content_id" }
        );
      }
    }
    if (playerSettings.loop) {
      if (video) { video.currentTime = 0; video.play().catch(() => {}); setIsPlaying(true); }
    } else if (onNext && hasNext) {
      setTimeout(() => onNext(), 1500);
    } else {
      // Show end screen recommendations
      setShowEndScreen(true);
    }
  }, [user, contentId, duration, videoId, onNext, hasNext, playerSettings.loop]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    if (video.paused || video.ended) {
      video.play().then(() => {
        setIsPlaying(true);
        logEvent("play", videoId, { position: Math.floor(video.currentTime) });
      }).catch(() => { video.muted = true; setIsMuted(true); video.play().catch(() => {}); });
    } else {
      video.pause();
      setIsPlaying(false);
      logEvent("pause", videoId, { position: Math.floor(video.currentTime) });
    }
  }, [videoId, logEvent]);

  const seek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  };

  const changeVolume = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const vol = value[0];
    video.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) { await containerRef.current.requestFullscreen(); setIsFullscreen(true); }
    else { await document.exitFullscreen(); setIsFullscreen(false); }
  };

  const resumePlayback = () => {
    const video = videoRef.current;
    if (!video || resumePosition === null) return;
    video.currentTime = resumePosition;
    video.play().catch(() => {});
    setIsPlaying(true);
    setShowResumePrompt(false);
  };

  const startFromBeginning = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
    setIsPlaying(true);
    setShowResumePrompt(false);
  };

  const setSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setShowSpeedMenu(false);
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); skip(-5); break;
        case "ArrowRight": e.preventDefault(); skip(5); break;
        case "ArrowUp": e.preventDefault(); changeVolume([Math.min(1, volume + 0.1)]); break;
        case "ArrowDown": e.preventDefault(); changeVolume([Math.max(0, volume - 0.1)]); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "s": e.preventDefault(); setShowSettingsPanel(p => !p); break;
        case "Escape":
          if (showSettingsPanel) setShowSettingsPanel(false);
          else if (onClose && !isFullscreen) onClose();
          break;
        case ",": e.preventDefault(); skip(-1 / 30); break; // frame back
        case ".": e.preventDefault(); skip(1 / 30); break; // frame forward
        case "<": e.preventDefault(); { const i = SPEED_OPTIONS.indexOf(playbackRate); if (i > 0) setSpeed(SPEED_OPTIONS[i - 1]); } break;
        case ">": e.preventDefault(); { const i = SPEED_OPTIONS.indexOf(playbackRate); if (i < SPEED_OPTIONS.length - 1) setSpeed(SPEED_OPTIONS[i + 1]); } break;
        default:
          // 0-9 jump to percentage
          if (e.key >= "0" && e.key <= "9" && duration > 0) {
            e.preventDefault();
            const pct = parseInt(e.key) / 10;
            const video = videoRef.current;
            if (video) { video.currentTime = duration * pct; setCurrentTime(duration * pct); }
          }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [volume, isFullscreen, isPlaying, showSettingsPanel, playbackRate, duration]);

  // --- Source management ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (src !== prevSrcRef.current) {
      const isFirstLoad = prevSrcRef.current === null;
      isMixTransition.current = !isFirstLoad && !!onNext;
      prevSrcRef.current = src;
      autoPlayAttemptedRef.current = false;
      if (!isFirstLoad) {
        setCurrentTime(0); setDuration(0); setBuffered(0);
        if (!isMixTransition.current) setIsLoading(true);
        setShowResumePrompt(false); setResumePosition(null); lastSaveRef.current = 0;
        setShowEndScreen(false);
      }
      if (!isMixTransition.current) video.pause();
      video.src = src;
      video.load();
    }
  }, [src, onNext]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video && user && videoId && video.duration > 0) {
        const percent = Math.round((video.currentTime / video.duration) * 100);
        supabase.from("video_progress").upsert(
          { user_id: user.id, video_id: videoId, position_seconds: Math.floor(video.currentTime), duration_seconds: Math.floor(video.duration), watched_percent: percent, completed: percent >= 95, updated_at: new Date().toISOString() },
          { onConflict: "user_id,video_id" }
        );
      }
    };
  }, [user, videoId]);

  // Token rotation: refresh every 30s during playback
  useEffect(() => {
    if (!isPlaying || !videoId) return;
    const interval = setInterval(() => {
      refreshVideoToken(videoId).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [isPlaying, videoId]);

  // Anti-download: block right-click and common download shortcuts on container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const blockContext = (e: MouseEvent) => { e.preventDefault(); };
    const blockKeys = (e: KeyboardEvent) => {
      // Block Ctrl+S, Ctrl+Shift+I (devtools), Ctrl+U (view source)
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.key === "u" || e.key === "U")) {
        e.preventDefault();
      }
    };
    container.addEventListener("contextmenu", blockContext);
    document.addEventListener("keydown", blockKeys);
    return () => {
      container.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("keydown", blockKeys);
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const liked = isFavorite(videoId);

  // Compute video styles from settings
  const videoObjectFit = playerSettings.autoAdapt
    ? (playerSettings.ratio !== "native" ? "cover" : "contain")
    : playerSettings.fitMode;

  const videoFilter = playerStyles.filter !== "none" ? playerStyles.filter : undefined;

  const swipeHandlers = useVerticalSwipe({
    onSwipeUp: () => { if (onNext && hasNext) onNext(); },
    onSwipeDown: () => { if (onPrev && hasPrev) onPrev(); },
    threshold: 50,
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black overflow-hidden group touch-none"
      style={{
        borderRadius: `${playerSettings.borderRadius}px`,
        background: playerSettings.bgColor,
      }}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); setShowVolumeSlider(false); }}
      {...swipeHandlers}
    >
      {/* Vertical Prev/Next nav arrows with red shadow */}
      {onPrev !== undefined && (
        <button
          onClick={(e) => { e.stopPropagation(); if (hasPrev) onPrev(); }}
          disabled={!hasPrev}
          className={cn(
            "absolute top-3 left-1/2 -translate-x-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
            hasPrev ? "text-white/90 hover:text-white hover:scale-110" : "opacity-20 pointer-events-none text-white/30"
          )}
          style={hasPrev ? { filter: "drop-shadow(0 0 8px hsl(0, 100%, 50%)) drop-shadow(0 0 16px hsl(0, 80%, 40%))" } : undefined}
        >
          <ChevronUp size={40} />
        </button>
      )}
      {onNext !== undefined && (
        <button
          onClick={(e) => { e.stopPropagation(); if (hasNext) onNext(); }}
          disabled={!hasNext}
          className={cn(
            "absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
            hasNext ? "text-white/90 hover:text-white hover:scale-110" : "opacity-20 pointer-events-none text-white/30"
          )}
          style={hasNext ? { filter: "drop-shadow(0 0 8px hsl(0, 100%, 50%)) drop-shadow(0 0 16px hsl(0, 80%, 40%))" } : undefined}
        >
          <ChevronDown size={40} />
        </button>
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full cursor-pointer"
        style={{
          objectFit: videoObjectFit as any,
          background: "black",
          height: playerStyles.aspectRatio ? "auto" : "100vh",
          aspectRatio: playerStyles.aspectRatio || undefined,
          maxHeight: "100vh",
          borderRadius: `${playerSettings.borderRadius}px`,
          transform: playerSettings.rotation ? `rotate(${playerSettings.rotation}deg) scale(${(playerSettings.zoom || 100) / 100})` : `scale(${(playerSettings.zoom || 100) / 100})`,
          filter: videoFilter,
          border: playerStyles.border,
          boxShadow: playerStyles.boxShadow,
          objectPosition: playerSettings.position || "center",
        }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePlay(); }}
        onDoubleClick={toggleFullscreen}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={handleCanPlay}
        onError={(e) => { console.error("Video error:", (e.target as HTMLVideoElement).error); setIsLoading(false); }}
        playsInline
        preload="auto"
        loop={playerSettings.loop}
      />

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-12 h-12 border-4 border-[#FF1B6B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Resume prompt */}
      {showResumePrompt && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm text-center space-y-4">
            <RotateCcw className="mx-auto text-[#FF1B6B]" size={32} />
            <p className="text-foreground font-semibold">Reprendre la lecture ?</p>
            <p className="text-muted-foreground text-sm">
              Vous vous étiez arrêté à {formatTime(resumePosition || 0)}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={resumePlayback} className="px-4 py-2 bg-[#FF1B6B] text-white rounded-md font-medium hover:bg-[#FF1B6B]/90 transition-colors">
                Reprendre
              </button>
              <button onClick={startFromBeginning} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-accent transition-colors">
                Depuis le début
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Central play button — rose, circular, pulsing */}
      {!isPlaying && !isLoading && !showResumePrompt && (
        <div className="absolute inset-0 flex items-center justify-center z-30"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePlay(); }}
        >
          <button className="w-20 h-20 rounded-full bg-[#FF1B6B]/90 text-white flex items-center justify-center hover:scale-115 transition-transform animate-pulse pointer-events-none shadow-lg shadow-[#FF1B6B]/40">
            <Play size={36} fill="currentColor" className="ml-1" />
          </button>
        </div>
      )}

      {/* Header — gradient top bar */}
      <div
        className={cn(
          "absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 z-20",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={(e) => { e.stopPropagation(); playerNavigate(`/video/${videoId}`); }}
              className="font-semibold text-sm md:text-base truncate max-w-[40%] hover:opacity-80 transition-colors"
              style={{ color: "hsl(190, 100%, 50%)" }}
              title={title}
            >
              {title.replace(/\.[^/.]+$/, "")}
            </button>
            {modelName && (
              <button
                onClick={(e) => { e.stopPropagation(); if (modelName) playerNavigate(`/models?select=${encodeURIComponent(modelName)}`); }}
                className="flex items-center gap-1.5 truncate max-w-[30%] hover:opacity-80 transition-colors shrink-0"
              >
                <img
                  src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(modelName)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`}
                  alt={modelName}
                  className="w-6 h-6 rounded-full shrink-0"
                />
                <span className="text-xs md:text-sm font-medium truncate" style={{ color: "hsl(30, 100%, 50%)" }}>
                  {modelName}
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(videoId); logEvent(liked ? "unlike" : "like", videoId); }}
              className={cn("transition-all hover:scale-110", liked ? "text-[#FF1B6B]" : "text-white/70 hover:text-[#FF1B6B]")}
            >
              <Heart size={24} fill={liked ? "currentColor" : "none"} />
            </button>
            {mixIndex !== undefined && mixTotal !== undefined && (
              <span className="bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shrink-0">
                Mix • {mixIndex + 1}/{mixTotal}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setShowSettingsPanel(p => !p); }}
              className={cn("text-white/70 hover:text-white transition-colors", showSettingsPanel && "text-[#00FFFF]")}
            >
              <Settings size={24} />
            </button>
            {onClose && (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
                className="w-10 h-10 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-all hover:scale-110 z-50"
              >
                <X size={24} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-12 pb-3 px-4 transition-opacity duration-300 z-20",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress bar - thick rose style with thumbnail preview */}
        <div
          className="relative w-full mb-3 group/progress cursor-pointer"
          style={{ height: "20px", display: "flex", alignItems: "center" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverTime(pct * (duration || 0));
            setHoverPct(pct * 100);
            setShowHoverTime(true);
            // Generate thumbnail from video
            const video = videoRef.current;
            if (video && duration > 0) {
              if (!thumbnailVideoRef.current) {
                const tv = document.createElement("video");
                tv.src = video.src;
                tv.preload = "auto";
                tv.muted = true;
                tv.crossOrigin = "anonymous";
                thumbnailVideoRef.current = tv;
              }
              if (!thumbnailCanvasRef.current) {
                thumbnailCanvasRef.current = document.createElement("canvas");
                thumbnailCanvasRef.current.width = 160;
                thumbnailCanvasRef.current.height = 90;
              }
              const tv = thumbnailVideoRef.current;
              const targetTime = pct * duration;
              tv.currentTime = targetTime;
              tv.onseeked = () => {
                const canvas = thumbnailCanvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.drawImage(tv, 0, 0, 160, 90);
                    setThumbnailUrl(canvas.toDataURL("image/jpeg", 0.6));
                  }
                }
              };
            }
          }}
          onMouseLeave={() => { setShowHoverTime(false); setThumbnailUrl(null); }}
        >
          {/* Thumbnail + time tooltip */}
          {duration > 0 && (
            <div
              className={cn(
                "absolute z-50 pointer-events-none flex flex-col items-center transition-all duration-200 ease-out",
                showHoverTime ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-2"
              )}
              style={{ left: `${hoverPct}%`, bottom: "100%", transform: `translateX(-50%)${showHoverTime ? "" : " translateY(8px)"}`, marginBottom: "8px" }}
            >
              {thumbnailUrl && (
                <div className="w-[160px] h-[90px] rounded-md overflow-hidden border-2 border-[#FF1B6B] shadow-lg shadow-[#FF1B6B]/30 mb-1 bg-black animate-scale-in">
                  <img src={thumbnailUrl} alt="preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="px-2 py-1 rounded bg-black/90 text-white text-xs font-mono tabular-nums whitespace-nowrap border border-white/10">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] group-hover/progress:h-[10px] rounded-full bg-white/20 transition-all">
            <div className="h-full rounded-full bg-white/30" style={{ width: `${buffered}%` }} />
          </div>
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 1}
            step={0.1}
            onValueChange={seek}
            className="relative z-10 [&>span:first-child]:h-[6px] group-hover/progress:[&>span:first-child]:h-[10px] [&>span:first-child]:bg-transparent [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:bg-[#FF1B6B] [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-lg [&_[role=slider]]:shadow-[#FF1B6B]/40 [&_[role=slider]]:opacity-0 group-hover/progress:[&_[role=slider]]:opacity-100 [&>span:first-child>span]:bg-[#FF1B6B]"
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 md:gap-2.5">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-[#00FFFF] transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              {isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
            </button>
            <button onClick={() => skip(-5)} className="text-white hover:text-[#00FFFF] transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <SkipBack size={20} />
            </button>
            <button onClick={() => skip(5)} className="text-white hover:text-[#00FFFF] transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <SkipForward size={20} />
            </button>

            {/* Volume with vertical slider */}
            <div
              className="relative"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button onClick={toggleMute} className="text-white hover:text-[#00FFFF] transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-card/95 backdrop-blur-md border border-border rounded-lg p-3 shadow-xl z-50 h-32 flex flex-col items-center">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    min={0} max={1} step={0.05}
                    orientation="vertical"
                    onValueChange={changeVolume}
                    className="h-full [&>span:first-child]:w-1.5 [&_[role=slider]]:w-3 [&_[role=slider]]:h-3 [&_[role=slider]]:bg-[#FF1B6B] [&_[role=slider]]:border-0 [&>span:first-child>span]:bg-[#FF1B6B]"
                  />
                  <span className="text-[10px] text-white/60 mt-1 font-mono">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
                </div>
              )}
            </div>

            {/* Timer */}
            <span className="text-white/80 text-[10px] md:text-xs font-mono tabular-nums ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Speed selector */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(v => !v); setShowQualityMenu(false); }}
                className="text-white/80 hover:text-white text-xs font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-xl py-1 min-w-[100px] z-50">
                  <p className="text-white/50 text-[10px] uppercase tracking-wider px-3 py-1 font-semibold">Vitesse</p>
                  {SPEED_OPTIONS.map(rate => (
                    <button
                      key={rate}
                      onClick={(e) => { e.stopPropagation(); setSpeed(rate); }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors",
                        playbackRate === rate ? "text-[#FF1B6B] font-medium" : "text-white/80"
                      )}
                    >
                      {rate}x
                      {playbackRate === rate && <span className="float-right text-[#FF1B6B]">●</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowQualityMenu(v => !v); setShowSpeedMenu(false); }}
                className={cn(
                  "text-white/80 hover:text-white transition-colors p-1 rounded flex items-center gap-1",
                  showQualityMenu && "text-[#00FFFF] bg-white/10"
                )}
              >
                <Settings size={18} />
                <span className="text-[10px] font-mono hidden md:inline">
                  {selectedQuality === "auto" ? "AUTO" : selectedQuality.toUpperCase()}
                </span>
              </button>
              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-xl py-1 min-w-[140px] z-50">
                  <p className="text-white/50 text-[10px] uppercase tracking-wider px-3 py-1 font-semibold">Qualité</p>
                  {QUALITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={(e) => { e.stopPropagation(); setSelectedQuality(opt.value); setShowQualityMenu(false); }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors",
                        selectedQuality === opt.value ? "text-[#FF1B6B] font-medium" : "text-white/80"
                      )}
                    >
                      {opt.label}
                      {selectedQuality === opt.value && <span className="float-right text-[#FF1B6B]">●</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture-in-Picture */}
            {document.pictureInPictureEnabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const video = videoRef.current;
                  if (!video) return;
                  if (document.pictureInPictureElement === video) {
                    document.exitPictureInPicture().catch(() => {});
                  } else {
                    video.requestPictureInPicture().catch(() => {});
                  }
                }}
                className="text-white hover:text-[#00FFFF] transition-colors p-1"
                title="Picture-in-Picture"
              >
                <PictureInPicture2 size={20} />
              </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white hover:text-[#00FFFF] transition-colors p-1">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic watermark — désactivable depuis Admin > CMS > Lecteur vidéo */}
      {user && (window as any).__sf_watermark !== false && (
        <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
          <div
            className="absolute text-white/15 text-sm font-medium tracking-wider"
            style={{
              top: `${20 + ((Date.now() / 10000) % 60)}%`,
              left: `${10 + ((Date.now() / 7000) % 60)}%`,
              transform: "rotate(-25deg)",
            }}
          >
            {user.email || user.id.slice(0, 12)}
          </div>
          <div
            className="absolute text-white/10 text-xs"
            style={{ bottom: "15%", right: "5%", transform: "rotate(-15deg)" }}
          >
            {user.email || user.id.slice(0, 12)}
          </div>
        </div>
      )}

      {/* End screen recommendations */}
      {showEndScreen && (
        <EndScreenRecommendations
          currentVideoId={videoId}
          modelId={modelId}
          modelName={modelName}
          onPlayVideo={(id) => {
            setShowEndScreen(false);
            playerNavigate(`/watch?v=${id}`);
          }}
          onReplay={() => {
            setShowEndScreen(false);
            const video = videoRef.current;
            if (video) {
              video.currentTime = 0;
              video.play().catch(() => {});
              setIsPlaying(true);
            }
          }}
          onClose={() => setShowEndScreen(false)}
        />
      )}

      {/* Settings panel (slide-in from right) */}
      {showSettingsPanel && (
        <div className="absolute top-0 right-0 bottom-0 w-[380px] max-w-full bg-background/95 backdrop-blur-md border-l border-border z-40 animate-slide-in-right">
          <PlayerSettingsPanel
            settings={playerSettings}
            onChange={() => {}}
            onClose={() => setShowSettingsPanel(false)}
            compact
          />
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;