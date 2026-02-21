import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSecureVideoUrl } from "@/lib/secure-video";
import { Play, Film, SkipForward, Volume2, VolumeX, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVerticalSwipe } from "@/hooks/useVerticalSwipe";

const CLIP_DURATION = 15; // seconds per clip

interface HeroVideoMixProps {
  videos: any[];
  modelNames: Map<string, string>;
}

const HeroVideoMix = ({ videos, modelNames }: HeroVideoMixProps) => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  const [currentVideo, setCurrentVideo] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"up" | "down" | null>(null);

  // Pick a random video different from current
  const pickRandom = useCallback((excludeId?: string) => {
    if (videos.length === 0) return null;
    const pool = excludeId ? videos.filter((v) => v.id !== excludeId) : videos;
    if (pool.length === 0) return videos[0];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [videos]);

  // Check if a URL is directly playable (not a hosting page link)
  const isPlayableUrl = (url?: string) => {
    if (!url) return false;
    if (url.includes("1fichier.com") || url.includes("mega.nz")) return false;
    return true;
  };

  // Load a new random video
  const loadNext = useCallback(async (excludeId?: string, direction: "up" | "down" = "up") => {
    const next = pickRandom(excludeId);
    if (!next) return;

    setSlideDirection(direction);
    setTransitioning(true);
    setReady(false);
    setElapsed(0);
    setCurrentVideo(next);

    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      // Authenticated: use secure URL (handles debriding)
      const result = await getSecureVideoUrl(next.id);
      if (!mountedRef.current) return;

      if (result) {
        setVideoUrl(result.blobUrl);
      } else {
        // Try another video if this one fails
        const fallback = pickRandom(next.id);
        if (fallback) {
          setCurrentVideo(fallback);
          const fbResult = await getSecureVideoUrl(fallback.id);
          if (!mountedRef.current) return;
          if (fbResult) {
            setVideoUrl(fbResult.blobUrl);
          } else {
            setVideoUrl(null);
          }
        }
      }
    } else if (isPlayableUrl(next.original_url)) {
      // Guest with direct video URL
      setVideoUrl(next.original_url);
    } else {
      // Guest with non-playable URL: show thumbnail only
      setVideoUrl(null);
    }

    setTimeout(() => { setTransitioning(false); setSlideDirection(null); }, 600);
  }, [pickRandom]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    if (videos.length > 0) {
      loadNext();
    }
    return () => { mountedRef.current = false; clearTimeout(timerRef.current); };
  }, [videos.length > 0]); // Only on first data load

  // Play video when URL is set
  useEffect(() => {
    if (!videoUrl) return;
    const vid = videoRef.current;
    if (!vid) return;

    vid.src = videoUrl;
    vid.muted = muted;
    vid.volume = 0.15;
    vid.playsInline = true;
    vid.load();

    const onCanPlay = () => {
      if (!mountedRef.current) return;
      // Seek to a random point in the video
      if (vid.duration && isFinite(vid.duration) && vid.duration > CLIP_DURATION + 5) {
        const maxStart = vid.duration - CLIP_DURATION - 2;
        vid.currentTime = Math.random() * maxStart + 2;
      }
      setReady(true);
      vid.play().catch(() => {
        vid.muted = true;
        vid.play().catch(() => {});
      });
    };

    vid.addEventListener("canplay", onCanPlay, { once: true });
    return () => vid.removeEventListener("canplay", onCanPlay);
  }, [videoUrl]);

  // Track elapsed time and auto-skip after CLIP_DURATION (once)
  useEffect(() => {
    if (!ready) return;
    const vid = videoRef.current;
    if (!vid) return;

    const startTime = vid.currentTime;
    let skipped = false;

    const onTime = () => {
      const diff = vid.currentTime - startTime;
      setElapsed(Math.min(diff, CLIP_DURATION));
      if (diff >= CLIP_DURATION && !skipped) {
        skipped = true;
        vid.removeEventListener("timeupdate", onTime);
        vid.pause();
        // Auto-load next random clip
        loadNext(currentVideo?.id, "up");
      }
    };

    vid.addEventListener("timeupdate", onTime);
    return () => vid.removeEventListener("timeupdate", onTime);
  }, [ready, currentVideo?.id, loadNext]);

  // Update muted state on video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  if (videos.length === 0) return null;

  const modelName = currentVideo?.model_id ? modelNames.get(currentVideo.model_id) : undefined;
  const progressPercent = (elapsed / CLIP_DURATION) * 100;

  const swipeHandlers = useVerticalSwipe({
    onSwipeUp: () => loadNext(currentVideo?.id, "up"),
    onSwipeDown: () => loadNext(currentVideo?.id, "down"),
    threshold: 40,
  });

  // Slide transition classes with enhanced animation
  const slideClass = transitioning
    ? slideDirection === "up"
      ? "translate-y-[30%] opacity-0 scale-90 blur-sm"
      : slideDirection === "down"
        ? "-translate-y-[30%] opacity-0 scale-90 blur-sm"
        : "opacity-0 scale-90 blur-sm"
    : "translate-y-0 opacity-100 scale-100 blur-0";

  return (
    <div className="relative w-full overflow-hidden bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] mx-auto aspect-[9/16] touch-none overflow-hidden"
        {...swipeHandlers}
      >
      {/* Video background with slide transition */}
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 w-full h-full object-cover rounded-xl transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
          ready && !transitioning ? "opacity-100 translate-y-0 scale-100 blur-0" : slideClass
        )}
        playsInline
        muted={muted}
      />

      {/* Fallback thumbnail while loading */}
      {(!ready || transitioning) && currentVideo?.thumbnail_url && (
        <img
          src={currentVideo.thumbnail_url}
          alt=""
          className={cn(
            "absolute inset-0 w-full h-full object-cover rounded-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            transitioning ? slideClass : "opacity-100"
          )}
        />
      )}
      {(!ready && !currentVideo) && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-background rounded-xl" />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent rounded-xl" />

      {/* Horizontal navigation arrows - left and right sides */}
      <button
        onClick={() => loadNext(currentVideo?.id, "down")}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:scale-110 transition-all bg-background/30 backdrop-blur-sm"
        style={{ filter: "drop-shadow(0 0 8px hsl(0, 100%, 50%)) drop-shadow(0 0 16px hsl(0, 80%, 40%))" }}
      >
        <ChevronLeft size={28} />
      </button>
      <button
        onClick={() => loadNext(currentVideo?.id, "up")}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:scale-110 transition-all bg-background/30 backdrop-blur-sm"
        style={{ filter: "drop-shadow(0 0 8px hsl(0, 100%, 50%)) drop-shadow(0 0 16px hsl(0, 80%, 40%))" }}
      >
        <ChevronRight size={28} />
      </button>

      {/* Clip progress bar - vertical on the left side */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] z-40 bg-muted-foreground/20 rounded-l-xl overflow-hidden">
        <div
          className="w-full bg-primary transition-all duration-300 ease-linear"
          style={{ height: `${progressPercent}%` }}
        />
      </div>

      {/* Controls top-right - z-[60] to be above navbar z-50 */}
      <div className="absolute top-4 right-16 z-[60] flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const next = !muted;
            setMuted(next);
            if (videoRef.current) {
              videoRef.current.muted = next;
              if (!next) videoRef.current.volume = 0.15;
            }
          }}
          className="p-2 rounded-full bg-background/50 backdrop-blur-sm text-foreground/80 hover:text-foreground hover:bg-background/70 transition-all"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); loadNext(currentVideo?.id); }}
          className="p-2 rounded-full bg-background/50 backdrop-blur-sm text-foreground/80 hover:text-foreground hover:bg-background/70 transition-all"
        >
          <SkipForward size={18} />
        </button>
      </div>

      {/* Loading spinner */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Video info overlay */}
      {currentVideo && (
        <div className="absolute bottom-6 left-4 right-4 z-20 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/80 text-primary-foreground uppercase tracking-wider">
              Mix
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.ceil(CLIP_DURATION - elapsed)}s
              {currentVideo.duration_seconds ? ` · ${Math.floor(currentVideo.duration_seconds / 60)}:${String(Math.floor(currentVideo.duration_seconds % 60)).padStart(2, "0")}` : ""}
            </span>
          </div>
          <h1
            className="font-display text-xl tracking-wider mb-1 drop-shadow-lg line-clamp-2 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ color: "hsl(190, 100%, 50%)" }}
            onClick={() => navigate(`/video/${currentVideo.id}`)}
          >
            {currentVideo.title?.replace(/\.[^/.]+$/, "")}
          </h1>
          {modelName && (
            <p
              className="text-sm mb-3 cursor-pointer hover:opacity-80 transition-opacity font-medium"
              style={{ color: "hsl(30, 100%, 50%)" }}
              onClick={() => navigate(`/models?select=${encodeURIComponent(modelName)}`)}
            >
              {modelName}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/watch?v=${currentVideo.id}`)}
              className="flex items-center gap-1.5 bg-foreground text-background font-semibold px-4 py-2 rounded text-sm hover:bg-foreground/80 transition-all"
            >
              <Play size={16} fill="currentColor" /> Regarder
            </button>
            <button
              onClick={() => navigate(`/video/${currentVideo.id}`)}
              className="flex items-center gap-1.5 bg-secondary/80 text-foreground font-semibold px-4 py-2 rounded text-sm hover:bg-secondary transition-all"
            >
              <Film size={16} /> Détails
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default HeroVideoMix;
