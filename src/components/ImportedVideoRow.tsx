import { useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Play, Heart, Crown, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import VideoCardPreview from "./VideoCardPreview";
import { cn } from "@/lib/utils";

const GRADIENT_PALETTES = [
  { from: "from-violet-900", to: "to-purple-600", text: "text-fuchsia-400", border: "border-purple-500/40" },
  { from: "from-blue-900", to: "to-cyan-700", text: "text-cyan-300", border: "border-cyan-500/40" },
  { from: "from-rose-900", to: "to-pink-600", text: "text-pink-300", border: "border-pink-500/40" },
  { from: "from-amber-900", to: "to-yellow-600", text: "text-yellow-300", border: "border-yellow-500/40" },
  { from: "from-emerald-900", to: "to-teal-600", text: "text-emerald-300", border: "border-emerald-500/40" },
  { from: "from-indigo-900", to: "to-blue-600", text: "text-blue-300", border: "border-blue-500/40" },
  { from: "from-orange-900", to: "to-red-600", text: "text-orange-300", border: "border-orange-500/40" },
  { from: "from-fuchsia-900", to: "to-purple-500", text: "text-fuchsia-300", border: "border-fuchsia-500/40" },
];

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
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

interface ImportedVideoRowProps {
  title: string;
  videos: any[];
  modelNames?: Map<string, string>;
  modelImages?: Map<string, string>;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (videoId: string) => void;
  progressMap?: Map<string, any>;
}

const VideoThumb = ({ video, modelName, modelImage, liked, percent, onToggleFavorite }: {
  video: any; modelName?: string; modelImage?: string; liked: boolean; percent: number; onToggleFavorite?: () => void;
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const palette = GRADIENT_PALETTES[hashStr(video.id) % GRADIENT_PALETTES.length];
  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
  const isGuest = !user;

  const openPlayer = useCallback(async () => {
    if (isGuest) { navigate("/auth"); return; }
    navigate(`/watch?v=${video.id}`);
  }, [video.id, navigate, isGuest]);

  const thumbSrc = !imgError ? (video.thumbnail_url || modelImage) : null;

  return (
    <div className="flex-shrink-0 w-[160px] md:w-[180px] group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/video/${video.id}`)}>
      <div className={cn(
        "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
        "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
        !thumbSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60"
      )}>
        {thumbSrc ? (
          <img src={thumbSrc} alt={video.title} className="w-full h-full object-cover" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br p-3", palette.from, palette.to)}>
            <span className={cn("text-3xl font-bold tracking-wider", palette.text)} style={{ textShadow: '0 0 15px currentColor' }}>{titleAbbrev}</span>
          </div>
        )}

        {!isGuest && <VideoCardPreview videoId={video.id} isHovered={hovered} onTimeUpdate={setPreviewTime} fallbackUrl={video.original_url} />}

        {video.duration_seconds && (
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
            {formatDuration(video.duration_seconds)}
          </div>
        )}

        {hovered && previewTime > 0 && (
          <div className="absolute bottom-2 left-1.5 z-50 text-[10px] font-semibold px-1 py-0.5 rounded bg-primary/90 text-primary-foreground tabular-nums animate-pulse">
            {formatDuration(previewTime)}
          </div>
        )}

        <div className={cn("absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20", hovered ? "opacity-100" : "opacity-0")} />

        <div className={cn("absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none", hovered ? "opacity-100" : "opacity-0")}>
          <button onClick={(e) => { e.stopPropagation(); openPlayer(); }}
            className="w-10 h-10 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30 pointer-events-auto">
            <Play size={16} fill="currentColor" className="text-primary-foreground ml-0.5" />
          </button>
        </div>

        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}
          className={cn("absolute top-1.5 left-1.5 z-40 p-1 rounded-full bg-black/50 backdrop-blur-sm transition-all",
            liked ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100")}>
          <Heart size={12} fill={liked ? "currentColor" : "none"} />
        </button>

        {video.source === "1fichier" && (
          <div className="absolute top-1.5 right-1.5 z-40 p-1 rounded-full bg-black/50 backdrop-blur-sm">
            <Crown size={10} className="text-yellow-400" />
          </div>
        )}

        {isGuest && (
          <div className="absolute top-1.5 right-1.5 z-50 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/90 backdrop-blur-sm shadow-lg shadow-primary/30">
            <Lock size={9} className="text-primary-foreground" />
            <span className="text-[9px] font-bold text-primary-foreground tracking-wide uppercase">Premium</span>
          </div>
        )}

        {isGuest && hovered && (
          <div className="absolute inset-0 z-[45] flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-lg">
            <Lock size={20} className="text-primary mb-1.5" />
            <p className="text-[10px] text-foreground/90 font-medium mb-2">Contenu Premium</p>
            <button
              onClick={(e) => { e.stopPropagation(); navigate("/auth"); }}
              className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/80 transition-colors shadow-md shadow-primary/30"
            >
              S'inscrire
            </button>
          </div>
        )}

        {percent > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
            <div className={cn("h-full transition-all", percent >= 95 ? "bg-primary/70 w-full" : "bg-primary")} style={percent < 95 ? { width: `${percent}%` } : undefined} />
          </div>
        )}
      </div>

      <div className="mt-1.5 space-y-0.5">
        <p className="text-foreground text-xs font-medium truncate leading-tight">{video.title}</p>
        {modelName && (
          <p className="text-[10px] text-muted-foreground truncate">{modelName}</p>
        )}
      </div>
    </div>
  );
};

const ImportedVideoRow = ({ title, videos, modelNames, modelImages, favoriteIds, onToggleFavorite, progressMap }: ImportedVideoRowProps) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: dir === "left" ? -500 : 500, behavior: "smooth" });
    }
  };

  if (videos.length === 0) return null;

  return (
    <div className="mb-8 group/row">
      <h2 className="text-lg md:text-xl font-semibold text-foreground px-4 md:px-12 mb-3">{title}</h2>
      <div className="relative">
        <button onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 hover:bg-background/80">
          <ChevronLeft size={28} />
        </button>
        <div ref={rowRef} className="flex gap-2 overflow-x-auto scrollbar-hide px-4 md:px-12 pb-6">
          {videos.map((video) => {
            const modelName = video.model_id ? modelNames?.get(video.model_id) : undefined;
            const modelImage = video.model_id ? modelImages?.get(video.model_id) : undefined;
            const progress = progressMap?.get(video.id);
            const percent = progress?.watched_percent || 0;
            const liked = favoriteIds?.has(video.id) || false;
            return (
              <VideoThumb
                key={video.id}
                video={video}
                modelName={modelName}
                modelImage={modelImage}
                liked={liked}
                percent={percent}
                onToggleFavorite={() => onToggleFavorite?.(video.id)}
              />
            );
          })}
        </div>
        <button onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 hover:bg-background/80">
          <ChevronRight size={28} />
        </button>
      </div>
    </div>
  );
};

export default ImportedVideoRow;
