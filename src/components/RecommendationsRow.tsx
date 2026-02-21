import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Play, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoCardPreview from "@/components/VideoCardPreview";

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

interface RecommendationsRowProps {
  videos: any[];
  modelNames: Map<string, string>;
  favoriteIds: Set<string>;
  onToggleFavorite: (videoId: string) => void;
}

const RecommendationsRow = ({ videos, modelNames, favoriteIds, onToggleFavorite }: RecommendationsRowProps) => {
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewTimes, setPreviewTimes] = useState<Map<string, number>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
  }, []);

  const scroll = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
    setTimeout(updateScrollState, 350);
  }, [updateScrollState]);

  if (videos.length === 0) return null;

  return (
    <div className="px-4 md:px-12 mb-8">
      <h2 className="text-foreground text-lg md:text-xl font-semibold mb-3 flex items-center gap-2">
        <Sparkles size={20} className="text-primary" />
        Recommandé pour vous
      </h2>

      <div className="flex items-center gap-2">
        <button
          onClick={() => scroll("left")}
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity",
            "bg-background/80 border border-border/50 hover:border-primary/60",
            canScrollLeft ? "opacity-100 cursor-pointer" : "opacity-0 pointer-events-none"
          )}
        >
          <ChevronLeft size={18} className="text-primary" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 flex-1 min-w-0"
          onScroll={updateScrollState}
        >
          {videos.map((video) => {
            const isHovered = hoveredId === video.id;
            const palette = GRADIENT_PALETTES[hashStr(video.id) % GRADIENT_PALETTES.length];
            const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
            const thumbSrc = video.thumbnail_url;
            const liked = favoriteIds.has(video.id);
            const modelName = video.model_id ? modelNames.get(video.model_id) : undefined;
            const previewTime = previewTimes.get(video.id) || 0;

            return (
              <div
                key={video.id}
                className="flex-shrink-0 w-[140px] md:w-[170px] cursor-pointer group"
                onMouseEnter={() => setHoveredId(video.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => navigate(`/video/${video.id}`)}
              >
                <div className={cn(
                  "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
                  "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
                  !thumbSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60"
                )}>
                  {thumbSrc ? (
                    <img src={thumbSrc} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br p-3", palette.from, palette.to)}>
                      <span className={cn("text-2xl font-bold tracking-wider", palette.text)} style={{ textShadow: '0 0 15px currentColor' }}>{titleAbbrev}</span>
                    </div>
                  )}

                  <VideoCardPreview
                    videoId={video.id}
                    isHovered={isHovered}
                    onTimeUpdate={(t) => setPreviewTimes((prev) => new Map(prev).set(video.id, t))}
                    fallbackUrl={video.original_url}
                  />

                  {video.duration_seconds && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
                      {formatDuration(video.duration_seconds)}
                    </div>
                  )}

                  {isHovered && previewTime > 0 && (
                    <div className="absolute bottom-2 left-2 z-50 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground tabular-nums animate-pulse">
                      {formatDuration(previewTime)}
                    </div>
                  )}

                  {isHovered && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 z-20" />
                  )}

                  {isHovered && (
                    <div className="absolute inset-0 flex items-center justify-center z-40">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/watch?v=${video.id}`); }}
                        className="w-11 h-11 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30"
                      >
                        <Play size={18} fill="currentColor" className="text-primary-foreground ml-0.5" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(video.id); }}
                    className={cn(
                      "absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
                      liked ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <Heart size={14} fill={liked ? "currentColor" : "none"} />
                  </button>
                </div>

                <div className="mt-2 space-y-0.5">
                  <p className="text-foreground text-xs font-medium truncate leading-tight">{video.title?.replace(/\.[^/.]+$/, "")}</p>
                  {modelName && <p className="text-[10px] text-muted-foreground truncate">{modelName}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => scroll("right")}
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity",
            "bg-background/80 border border-border/50 hover:border-primary/60",
            canScrollRight ? "opacity-100 cursor-pointer" : "opacity-0 pointer-events-none"
          )}
        >
          <ChevronRight size={18} className="text-primary" />
        </button>
      </div>
    </div>
  );
};

export default RecommendationsRow;
