import { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Play, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoPlayer from "@/components/VideoPlayer";
import VideoCardPreview from "@/components/VideoCardPreview";
import { supabase } from "@/integrations/supabase/client";

const GRADIENT_PALETTES = [
  { from: "from-violet-900", to: "to-purple-600", text: "text-fuchsia-400", border: "border-purple-500/40" },
  { from: "from-blue-900", to: "to-cyan-700", text: "text-cyan-300", border: "border-cyan-500/40" },
  { from: "from-rose-900", to: "to-pink-600", text: "text-pink-300", border: "border-pink-500/40" },
  { from: "from-amber-900", to: "to-yellow-600", text: "text-yellow-300", border: "border-yellow-500/40" },
  { from: "from-emerald-900", to: "to-teal-600", text: "text-emerald-300", border: "border-emerald-500/40" },
];

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function formatDuration(s: number | null) {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface ContinueVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  thumbnail_hover_url: string | null;
  original_url?: string;
  position_seconds: number;
  duration_seconds: number;
  watched_percent: number;
}

interface ContinueWatchingRowProps {
  videos: ContinueVideo[];
}

const ContinueWatchingRow = ({ videos }: ContinueWatchingRowProps) => {
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Overlay player state
  const [playingVideo, setPlayingVideo] = useState<{ id: string; signedUrl: string; title: string } | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
  }, []);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = dir === "left" ? -300 : 300;
    el.scrollBy({ left: amount, behavior: "smooth" });
    setTimeout(updateScrollState, 350);
  }, [updateScrollState]);

  const fetchSignedUrl = useCallback(async (videoId: string): Promise<string | null> => {
    try {
      const { data: tokenData, error } = await supabase.functions.invoke("video-token", { body: { videoId } });
      if (error || !tokenData?.token) return null;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return null;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/video-token?action=stream&id=${videoId}&t=${tokenData.token}&e=${tokenData.expiresAt}`,
        { headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey } }
      );
      const streamData = await res.json();
      return streamData.url || null;
    } catch { return null; }
  }, []);

  const openPlayer = useCallback(async (video: ContinueVideo) => {
    setLoadingPlayer(true);
    const url = await fetchSignedUrl(video.id);
    if (url) setPlayingVideo({ id: video.id, signedUrl: url, title: video.title });
    setLoadingPlayer(false);
  }, [fetchSignedUrl]);

  const closePlayer = useCallback(() => setPlayingVideo(null), []);

  const playingIndex = playingVideo ? videos.findIndex((v) => v.id === playingVideo.id) : -1;

  const navigatePlayer = useCallback(async (direction: 1 | -1) => {
    const newIndex = playingIndex + direction;
    if (newIndex < 0 || newIndex >= videos.length) return;
    const nextVideo = videos[newIndex];
    setLoadingPlayer(true);
    const url = await fetchSignedUrl(nextVideo.id);
    if (url) setPlayingVideo({ id: nextVideo.id, signedUrl: url, title: nextVideo.title });
    setLoadingPlayer(false);
  }, [playingIndex, videos, fetchSignedUrl]);

  if (videos.length === 0) return null;

  // Render overlay player via portal to escape stacking contexts (hero z-index)
  const overlayPortal = createPortal(
    <>
      {loadingPlayer && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00FFFF', borderTopColor: 'transparent' }} />
        </div>
      )}
      {playingVideo && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closePlayer(); }}>
          <div className="w-full max-w-5xl mx-4">
            <VideoPlayer
              videoId={playingVideo.id}
              src={playingVideo.signedUrl}
              title={playingVideo.title}
              autoPlay={true}
              onClose={closePlayer}
              onNext={() => navigatePlayer(1)}
              onPrev={() => navigatePlayer(-1)}
              hasNext={playingIndex >= 0 && playingIndex < videos.length - 1}
              hasPrev={playingIndex > 0}
            />
          </div>
        </div>
      )}
    </>,
    document.body
  );

  return (
    <>
      <div className="px-4 md:px-12 mb-8">
        <h2 className="text-foreground text-lg md:text-xl font-semibold mb-3 flex items-center gap-2">
          <Clock size={20} style={{ color: '#00FFFF' }} />
          Continuer à regarder
        </h2>

        {/* Layout: arrow | cards | arrow */}
        <div className="flex items-center gap-2">
          {/* Left arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); scroll("left"); }}
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity",
              "bg-background/80 border border-border/50 hover:border-[#00FFFF]/60",
              canScrollLeft ? "opacity-100 cursor-pointer" : "opacity-0 pointer-events-none"
            )}
          >
            <ChevronLeft size={18} style={{ color: '#00FFFF' }} />
          </button>

          {/* Scrollable cards */}
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 flex-1 min-w-0"
            onScroll={updateScrollState}
          >
            {videos.slice(0, 10).map((video) => {
              const isHovered = hoveredId === video.id;
              const palette = GRADIENT_PALETTES[hashStr(video.id) % GRADIENT_PALETTES.length];
              const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
              const thumbSrc = video.thumbnail_url;
              const percent = Math.min(video.watched_percent, 100);

              return (
                <div
                  key={video.id}
                  className="flex-shrink-0 w-[140px] md:w-[170px] cursor-pointer"
                  onMouseEnter={() => setHoveredId(video.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => navigate(`/video/${video.id}`)}
                >
                  {/* Jacquette 2:3 */}
                  <div className={cn(
                    "relative aspect-[2/3] rounded-lg overflow-hidden ring-1",
                    isHovered ? "shadow-lg shadow-[#00FFFF]/20 ring-[#00FFFF]/60" : "ring-border/30",
                    !thumbSrc && `${palette.border} ring-0 border`
                  )}>
                    {/* Static thumbnail */}
                    {thumbSrc ? (
                      <img src={thumbSrc} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br p-3", palette.from, palette.to)}>
                        <span className={cn("text-2xl font-bold tracking-wider", palette.text)} style={{ textShadow: '0 0 15px currentColor' }}>{titleAbbrev}</span>
                      </div>
                    )}

                    {/* Video preview on hover – same as Videos page */}
                    <VideoCardPreview
                      videoId={video.id}
                      isHovered={isHovered}
                      fallbackUrl={video.original_url}
                    />

                    {/* Duration badge */}
                    {video.duration_seconds > 0 && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
                        {formatDuration(video.duration_seconds)}
                      </div>
                    )}

                    {/* Hover gradient */}
                    {isHovered && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 z-20" />
                    )}

                    {/* Play button → overlay player */}
                    {isHovered && (
                      <div className="absolute inset-0 flex items-center justify-center z-40">
                        <button
                          onClick={(e) => { e.stopPropagation(); openPlayer(video); }}
                          className="w-11 h-11 rounded-full backdrop-blur-sm flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(0, 255, 255, 0.9)', boxShadow: '0 0 20px rgba(0, 255, 255, 0.4)' }}
                        >
                          <Play size={18} fill="#000" className="ml-0.5" style={{ color: '#000' }} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cyan progress bar */}
                  <div className="mt-1.5 h-[3px] rounded-full bg-muted-foreground/20 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${percent}%`, backgroundColor: '#00FFFF', boxShadow: '0 0 6px #00FFFF80' }}
                    />
                  </div>

                  {/* Title + info */}
                  <div className="mt-1 space-y-0.5">
                    <p className="text-foreground text-xs font-medium truncate leading-tight">{video.title?.replace(/\.[^/.]+$/, "")}</p>
                    <p className="text-muted-foreground text-[10px]">
                      {formatDuration(video.position_seconds)} / {formatDuration(video.duration_seconds)}
                      {" · "}<span style={{ color: '#00FFFF' }}>{percent}%</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right arrow */}
          <button
            onClick={(e) => { e.stopPropagation(); scroll("right"); }}
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity",
              "bg-background/80 border border-border/50 hover:border-[#00FFFF]/60",
              canScrollRight ? "opacity-100 cursor-pointer" : "opacity-0 pointer-events-none"
            )}
          >
            <ChevronRight size={18} style={{ color: '#00FFFF' }} />
          </button>
        </div>
      </div>

      {overlayPortal}
    </>
  );
};

export default ContinueWatchingRow;
