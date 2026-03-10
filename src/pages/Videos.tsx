import { useState, useMemo, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { usePagination } from "@/hooks/usePagination";
import { useImportedVideos, useImportedVideosProgress } from "@/hooks/useImportedVideos";
import { useModels } from "@/hooks/useModels";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PaginationBar from "@/components/PaginationBar";
import VideoCardPreview from "@/components/VideoCardPreview";
import { Progress } from "@/components/ui/progress";
import VideoPlayer from "@/components/VideoPlayer";
import { Play, Clock, Search, Film, Shuffle, ArrowUpDown, Filter, Heart, Eye, X, Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SortKey = "title_asc" | "title_desc" | "date_new" | "date_old" | "duration_long" | "duration_short" | "size_big" | "size_small";
type TabKey = "all" | "favorites" | "watched";
type DurationRange = "all" | "short" | "medium" | "long" | "very_long";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date_new", label: "Plus récent" },
  { value: "date_old", label: "Plus ancien" },
  { value: "title_asc", label: "A → Z" },
  { value: "title_desc", label: "Z → A" },
  { value: "duration_long", label: "Durée ↓" },
  { value: "duration_short", label: "Durée ↑" },
  { value: "size_big", label: "Taille ↓" },
  { value: "size_small", label: "Taille ↑" },
];

const ITEMS_PER_PAGE = 20;

// Deterministic random color palette for cards without images
const GRADIENT_PALETTES = [
  { from: "from-violet-900", to: "to-purple-600", text: "text-fuchsia-400", border: "border-purple-500/40" },
  { from: "from-blue-900", to: "to-cyan-700", text: "text-cyan-300", border: "border-cyan-500/40" },
  { from: "from-rose-900", to: "to-pink-600", text: "text-pink-300", border: "border-pink-500/40" },
  { from: "from-amber-900", to: "to-yellow-600", text: "text-yellow-300", border: "border-yellow-500/40" },
  { from: "from-emerald-900", to: "to-teal-600", text: "text-emerald-300", border: "border-emerald-500/40" },
  { from: "from-indigo-900", to: "to-blue-600", text: "text-blue-300", border: "border-blue-500/40" },
  { from: "from-orange-900", to: "to-red-600", text: "text-orange-300", border: "border-orange-500/40" },
  { from: "from-fuchsia-900", to: "to-purple-500", text: "text-fuchsia-300", border: "border-fuchsia-500/40" },
  { from: "from-teal-900", to: "to-green-600", text: "text-teal-300", border: "border-teal-500/40" },
  { from: "from-slate-800", to: "to-zinc-600", text: "text-zinc-300", border: "border-zinc-500/40" },
  { from: "from-red-900", to: "to-rose-500", text: "text-rose-300", border: "border-rose-500/40" },
  { from: "from-cyan-900", to: "to-sky-600", text: "text-sky-300", border: "border-sky-500/40" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Video card with cyberpunk design
const VideoCard = ({ video, liked, percent, posSeconds, onNavigate, onPlay, onToggleFavorite, modelName, modelImage, modelId, formatDuration, formatPosition, onModelClick }: {
  video: any; liked: boolean; percent: number; posSeconds: number;
  onNavigate: () => void; onPlay: () => void; onToggleFavorite: () => void;
  modelName?: string; modelImage?: string; modelId?: string;
  formatDuration: (s: number | null) => string;
  formatPosition: (s: number) => string;
  onModelClick?: (name: string) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);

  const palette = GRADIENT_PALETTES[hashString(video.id) % GRADIENT_PALETTES.length];
  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();

  return (
    <div className="group cursor-pointer relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      <div onClick={() => onNavigate()}>
        <div className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          imgError || (!video.thumbnail_url && !modelImage)
            ? `${palette.border} ring-0 border`
            : "ring-border/30 group-hover:ring-primary/60"
        )}>
          {/* Thumbnail or colorful gradient fallback */}
          {(() => {
            const thumbSrc = !imgError ? (video.thumbnail_url || modelImage) : null;
            return thumbSrc ? (
              <img src={thumbSrc} alt={video.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" onError={() => setImgError(true)} />
            ) : (
              <div className={cn("w-full h-full flex flex-col items-center justify-center bg-gradient-to-br p-4", palette.from, palette.to)}>
                <span className={cn("text-4xl md:text-5xl font-bold font-cyber tracking-wider", palette.text)} style={{ textShadow: '0 0 20px currentColor' }}>
                  {titleAbbrev}
                </span>
              </div>
            );
          })()}

          {/* Hover preview */}
          <VideoCardPreview videoId={video.id} isHovered={hovered} onTimeUpdate={setPreviewTime} />

          {/* Total duration top center */}
          {video.duration_seconds && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
              {formatDuration(video.duration_seconds)}
            </div>
          )}

          {/* Preview elapsed time counter */}
          {hovered && previewTime > 0 && (
            <div className="absolute bottom-2 left-2 z-50 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground tabular-nums animate-pulse">
              {formatPosition(previewTime)}
            </div>
          )}

          {/* Gradient overlay on hover */}
          <div className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20",
            hovered ? "opacity-100" : "opacity-0"
          )} />

          {/* Center play button on hover */}
          <div className={cn(
            "absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none",
            hovered ? "opacity-100" : "opacity-0"
          )}>
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30 transition-transform hover:scale-110 pointer-events-auto"
            >
              <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
            </button>
          </div>

          {/* Favorite button */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn(
              "absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
              liked ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100"
            )}
          >
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
          </button>

          {/* Premium badge top right */}
          {video.source === "1fichier" && (
            <div className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
              <Crown size={12} className="text-yellow-400" />
            </div>
          )}

          {/* Duration badge bottom-right (only when not hovered) */}
          {video.duration_seconds && !hovered && (
            <div className="absolute bottom-2 right-2 z-30 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-black/80 text-foreground/90 tabular-nums">
              {formatDuration(video.duration_seconds)}
            </div>
          )}

          {/* Progress bar */}
          {percent > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
              <div className={cn("h-full transition-all", percent >= 95 ? "bg-primary/70 w-full" : "bg-primary")} style={percent < 95 ? { width: `${percent}%` } : undefined} />
            </div>
          )}
        </div>

        {/* Info below */}
        <div className="mt-2 space-y-0.5">
          <div className="flex items-start gap-2">
            {/* Model avatar */}
            {modelImage && !imgError ? (
              <button onClick={(e) => { e.stopPropagation(); onModelClick?.(modelName || ""); }}
                className="shrink-0 mt-0.5 w-7 h-7 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition-all">
                <img src={modelImage} alt={modelName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </button>
            ) : modelName && modelName !== "Non classé" ? (
              <button onClick={(e) => { e.stopPropagation(); onModelClick?.(modelName); }}
                className="shrink-0 mt-0.5 w-7 h-7 rounded-full overflow-hidden ring-1 ring-border hover:ring-primary transition-all">
                <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(modelName)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`} alt={modelName} className="w-full h-full object-cover" />
              </button>
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium truncate leading-tight">{video.title?.replace(/\.[^/.]+$/, "")}</p>
              {modelName && modelName !== "Non classé" && (
                <button onClick={(e) => { e.stopPropagation(); onModelClick?.(modelName); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block">
                  {modelName}
                </button>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mt-0.5">
                {video.format && <span className="uppercase">{video.format}</span>}
                {video.format && video.file_size && <span>•</span>}
                {video.file_size && <span>{(video.file_size / 1024 / 1024).toFixed(0)} Mo</span>}
                {percent > 0 && percent < 95 && <>
                  <span>•</span>
                  <span className="text-primary">{percent}%</span>
                </>}
                {percent >= 95 && <>
                  <span>•</span>
                  <span className="text-primary/70">✓ Vu</span>
                </>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Videos = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { favoriteIds, toggleFavorite, isFavorite } = useVideoFavorites();
  const { progressMap, getProgress } = useVideoProgress();
  useScrollRestore("videos");

  const { modelImages, modelNames } = useModels();
  const { data: allVideos = [], isLoading: loading, isFetching } = useImportedVideos();
  const loadingProgress = useImportedVideosProgress();
  const isStillLoading = isFetching && !loadingProgress.done;

  const [search, setSearch] = useSessionState("videos_search", "");
  const [sortBy, setSortBy] = useSessionState<SortKey>("videos_sort", "date_new");
  const [sourceFilter, setSourceFilter] = useSessionState("videos_source", "all");
  const [formatFilter, setFormatFilter] = useSessionState("videos_format", "all");
  const [activeTab, setActiveTab] = useSessionState<TabKey>("videos_tab", "all");
  const [durationFilter, setDurationFilter] = useSessionState<DurationRange>("videos_duration", "all");

  const [playingVideo, setPlayingVideo] = useState<{ id: string; signedUrl: string; title: string; modelName?: string; modelId?: string } | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  const fetchSignedUrl = useCallback(async (videoId: string): Promise<string | null> => {
    try {
      const { data: tokenData, error } = await supabase.functions.invoke("video-token", {
        body: { videoId },
      });
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

  const openPlayer = useCallback(async (video: any) => {
    setLoadingPlayer(true);
    const url = await fetchSignedUrl(video.id);
    if (url) {
      const mName = video.model_id ? modelNames.get(video.model_id) : video.metadata?.model_name;
      setPlayingVideo({ id: video.id, signedUrl: url, title: video.title, modelName: mName, modelId: video.model_id });
    }
    setLoadingPlayer(false);
  }, [fetchSignedUrl, modelNames]);

  const closePlayer = useCallback(() => setPlayingVideo(null), []);

  const sourceLabel = (s: string) => {
    if (s === "gdrive") return "Google Drive";
    if (s === "1fichier") return "1Fichier";
    if (s === "coomer") return "Coomer";
    if (s === "bulk") return "Import massif";
    return s;
  };
  const sources = useMemo(() => {
    const set = new Set(allVideos.map((v) => v.source).filter(Boolean));
    return Array.from(set).sort();
  }, [allVideos]);

  const formats = useMemo(() => {
    const set = new Set(allVideos.map((v) => v.format).filter(Boolean));
    return Array.from(set).sort();
  }, [allVideos]);

  const filtered = useMemo(() => {
    let result = [...allVideos];
    if (activeTab === "favorites") result = result.filter((v) => favoriteIds.has(v.id));
    else if (activeTab === "watched") result = result.filter((v) => { const p = progressMap.get(v.id); return p && p.position_seconds > 0; });
    if (search.trim()) { const q = search.toLowerCase(); result = result.filter((v) => v.title.toLowerCase().includes(q)); }
    if (sourceFilter !== "all") result = result.filter((v) => v.source === sourceFilter);
    if (formatFilter !== "all") result = result.filter((v) => v.format === formatFilter);
    // Duration range filter
    if (durationFilter !== "all") {
      result = result.filter((v) => {
        const d = v.duration_seconds;
        if (!d) return false;
        switch (durationFilter) {
          case "short": return d < 300;
          case "medium": return d >= 300 && d < 1200;
          case "long": return d >= 1200 && d < 3600;
          case "very_long": return d >= 3600;
          default: return true;
        }
      });
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case "title_asc": return (a.title || "").localeCompare(b.title || "", "fr");
        case "title_desc": return (b.title || "").localeCompare(a.title || "", "fr");
        case "date_new": return new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime();
        case "date_old": return new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime();
        case "duration_long": {
          const aDur = a.duration_seconds;
          const bDur = b.duration_seconds;
          if (!aDur && !bDur) return 0;
          if (!aDur) return 1;
          if (!bDur) return -1;
          return bDur - aDur;
        }
        case "duration_short": {
          const aDur = a.duration_seconds;
          const bDur = b.duration_seconds;
          if (!aDur && !bDur) return 0;
          if (!aDur) return 1;
          if (!bDur) return -1;
          return aDur - bDur;
        }
        case "size_big": return (b.file_size || 0) - (a.file_size || 0);
        case "size_small": return (a.file_size || 0) - (b.file_size || 0);
        default: return 0;
      }
    });
    return result;
  }, [allVideos, search, sortBy, sourceFilter, formatFilter, durationFilter, activeTab, favoriteIds, progressMap]);

  // Nav helpers for overlay player — placed after filtered is defined
  const playingIndex = useMemo(() => {
    if (!playingVideo) return -1;
    return filtered.findIndex((v) => v.id === playingVideo.id);
  }, [playingVideo, filtered]);

  const navigatePlayer = useCallback(async (direction: 1 | -1) => {
    const newIndex = playingIndex + direction;
    if (newIndex < 0 || newIndex >= filtered.length) return;
    const nextVideo = filtered[newIndex];
    setLoadingPlayer(true);
    const url = await fetchSignedUrl(nextVideo.id);
    if (url) {
      const mName = nextVideo.model_id ? modelNames.get(nextVideo.model_id) : nextVideo.metadata?.model_name;
      setPlayingVideo({ id: nextVideo.id, signedUrl: url, title: nextVideo.title, modelName: mName, modelId: nextVideo.model_id });
    }
    setLoadingPlayer(false);
  }, [playingIndex, filtered, fetchSignedUrl]);

  const pagination = usePagination(filtered, { pageSize: ITEMS_PER_PAGE, storageKey: "videos" });

  const startMix = () => {
    if (filtered.length === 0) return;
    const pool = [...filtered];
    for (let i = pool.length - 1; i > 0; i--) {
      const rnd = crypto.getRandomValues(new Uint32Array(1))[0];
      const j = rnd % (i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const mixIds = pool.slice(0, 50).map((v) => v.id);
    navigate(`/watch?mix=${encodeURIComponent(JSON.stringify(mixIds))}`);
  };

  const formatDuration = (s: number | null) => {
    if (!s) return "";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatPosition = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const favCount = useMemo(() => allVideos.filter((v) => favoriteIds.has(v.id)).length, [allVideos, favoriteIds]);
  const watchedCount = useMemo(() => allVideos.filter((v) => progressMap.has(v.id) && (progressMap.get(v.id)?.position_seconds || 0) > 0).length, [allVideos, progressMap]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />
      <main className="pt-24 pb-12 px-4 md:px-12">
        <div className="flex flex-col gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground cyber-text-glow">Mes Vidéos</h1>
              {allVideos.length >= 2 && (
              <Button onClick={startMix} variant="secondary" size="sm" className="gap-1.5 text-xs md:text-sm">
                  <Shuffle size={14} /> Mix ({Math.min(filtered.length, 50)})
                </Button>
              )}
              <span className="text-xs md:text-sm text-muted-foreground">{filtered.length} vidéo{filtered.length > 1 ? "s" : ""}</span>
            </div>
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-destructive hover:text-destructive/80 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-hide">
            {([
              { key: "all" as TabKey, icon: Film, label: "Toutes" },
              { key: "favorites" as TabKey, icon: Heart, label: "Favoris", count: favCount },
              { key: "watched" as TabKey, icon: Eye, label: "Vus", count: watchedCount },
            ]).map(({ key, icon: Icon, label, count }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={cn("flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <Icon size={14} /> {label}
                {count !== undefined && count > 0 && <span className="text-[10px] md:text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{count}</span>}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ArrowUpDown size={14} /><span className="hidden sm:inline">Tri :</span></div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-[120px] md:w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {/* Duration range filter */}
            <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock size={14} /><span className="hidden sm:inline">Durée :</span></div>
            <Select value={durationFilter} onValueChange={(v) => setDurationFilter(v as DurationRange)}>
              <SelectTrigger className="w-[110px] md:w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Toutes</SelectItem>
                <SelectItem value="short" className="text-xs">{"< 5 min"}</SelectItem>
                <SelectItem value="medium" className="text-xs">5 – 20 min</SelectItem>
                <SelectItem value="long" className="text-xs">20 min – 1h</SelectItem>
                <SelectItem value="very_long" className="text-xs">{"> 1h"}</SelectItem>
              </SelectContent>
            </Select>
            {(<>
              <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Filter size={14} /><span className="hidden sm:inline">Source :</span></div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[100px] md:w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Toutes</SelectItem>
                  {/* Sources dynamiques + Google Drive toujours présent */}
                  {[...new Set([...sources, "gdrive"])].map((s) => <SelectItem key={s} value={s} className="text-xs">{sourceLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </>)}
            {formats.length > 1 && (<>
              <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="hidden sm:inline">Format :</span></div>
              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="w-[90px] md:w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Tous</SelectItem>
                  {formats.map((f) => <SelectItem key={f} value={f} className="text-xs uppercase">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </>)}
            {(sourceFilter !== "all" || formatFilter !== "all" || sortBy !== "date_new" || durationFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                onClick={() => { setSortBy("date_new"); setSourceFilter("all"); setFormatFilter("all"); setDurationFilter("all"); }}>Réinitialiser</Button>
            )}
          </div>
        </div>

        {/* Inline progress bar (non-blocking) */}
        {isStillLoading && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="flex-1">
              <Progress value={loadingProgress.percent} className="h-1.5" />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {loadingProgress.loaded}{loadingProgress.total ? ` / ${loadingProgress.total}` : ""} vidéos
            </span>
          </div>
        )}

        {filtered.length === 0 && !loading && !isFetching ? (
          <div className="text-center py-20">
            <Film size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">
              {activeTab === "favorites" ? "Aucun favori" : activeTab === "watched" ? "Aucune vidéo vue" : search ? "Aucun résultat" : "Aucune vidéo importée"}
            </p>
            {activeTab === "all" && !search && (
              <button onClick={() => navigate("/import")} className="mt-3 text-primary hover:underline text-sm">Importer des vidéos</button>
            )}
          </div>
        ) : filtered.length === 0 && (loading || isFetching) ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {pagination.paginatedItems.map((video) => {
                const progress = getProgress(video.id);
                const posSeconds = progress?.position_seconds || 0;
                const dur = progress?.duration_seconds || video.duration_seconds || 0;
                const percent = progress?.watched_percent || (dur > 0 ? Math.round((posSeconds / dur) * 100) : 0);
                const liked = isFavorite(video.id);

                return (
                  <VideoCard
                    key={video.id}
                    video={video}
                    liked={liked}
                    percent={percent}
                    posSeconds={posSeconds}
                    onNavigate={() => navigate(`/video/${video.id}`)}
                    onPlay={() => openPlayer(video)}
                    onToggleFavorite={() => toggleFavorite(video.id)}
                    modelName={video.model_id ? modelNames.get(video.model_id) : video.metadata?.model_name}
                    modelImage={video.model_id ? modelImages.get(video.model_id) : undefined}
                    modelId={video.model_id}
                    formatDuration={formatDuration}
                    formatPosition={formatPosition}
                    onModelClick={(name) => navigate(`/models?select=${encodeURIComponent(name)}`)}
                  />
                );
              })}
            </div>

            <PaginationBar
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              startIndex={pagination.startIndex}
              endIndex={pagination.endIndex}
              onPageChange={pagination.goToPage}
              hasNext={pagination.hasNext}
              hasPrev={pagination.hasPrev}
            />
          </>
        )}
      </main>
      <Footer />

      {loadingPlayer && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {playingVideo && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closePlayer(); }}>
          <div className="w-full max-w-5xl mx-2 md:mx-4">
            <VideoPlayer
              videoId={playingVideo.id}
              src={playingVideo.signedUrl}
              title={playingVideo.title}
              autoPlay={true}
              onClose={closePlayer}
              onNext={() => navigatePlayer(1)}
              onPrev={() => navigatePlayer(-1)}
              hasNext={playingIndex >= 0 && playingIndex < filtered.length - 1}
              hasPrev={playingIndex > 0}
              modelName={playingVideo.modelName}
              modelId={playingVideo.modelId}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Videos;