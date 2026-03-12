import { useState, useMemo, useCallback, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useModels } from "@/hooks/useModels";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PaginationBar from "@/components/PaginationBar";
import VideoCardPreview from "@/components/VideoCardPreview";
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

const ITEMS_PER_PAGE = 24;

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

// ── Server-side query builder ──────────────────────────────────────────────────
function applyFilters(
  q: any,
  opts: {
    userId?: string;
    search: string;
    sortBy: SortKey;
    sourceFilter: string;
    formatFilter: string;
    durationFilter: DurationRange;
    activeTab: TabKey;
    favoriteIds: Set<string>;
    watchedIds: Set<string>;
  }
) {
  const { userId, search, sortBy, sourceFilter, formatFilter, durationFilter, activeTab, favoriteIds, watchedIds } = opts;

  q = q.eq("is_active", true);
  if (userId) q = q.eq("user_id", userId);

  if (activeTab === "favorites") {
    q = q.in("id", Array.from(favoriteIds));
  } else if (activeTab === "watched") {
    q = q.in("id", Array.from(watchedIds));
  }

  if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);

  if (sourceFilter !== "all") {
    if (sourceFilter === "gdrive") {
      q = q.ilike("original_url", "%drive.google.com%");
    } else {
      q = q.eq("source", sourceFilter);
    }
  }

  if (formatFilter !== "all") q = q.eq("format", formatFilter);

  switch (durationFilter) {
    case "short":    q = q.lt("duration_seconds", 300); break;
    case "medium":   q = q.gte("duration_seconds", 300).lt("duration_seconds", 1200); break;
    case "long":     q = q.gte("duration_seconds", 1200).lt("duration_seconds", 3600); break;
    case "very_long": q = q.gte("duration_seconds", 3600); break;
  }

  switch (sortBy) {
    case "date_new":       q = q.order("imported_at", { ascending: false }); break;
    case "date_old":       q = q.order("imported_at", { ascending: true }); break;
    case "title_asc":      q = q.order("title", { ascending: true }); break;
    case "title_desc":     q = q.order("title", { ascending: false }); break;
    case "duration_long":  q = q.order("duration_seconds", { ascending: false, nullsFirst: false }); break;
    case "duration_short": q = q.order("duration_seconds", { ascending: true, nullsFirst: false }); break;
    case "size_big":       q = q.order("file_size", { ascending: false, nullsFirst: false }); break;
    case "size_small":     q = q.order("file_size", { ascending: true, nullsFirst: false }); break;
  }

  return q;
}

// ── VideoCard ──────────────────────────────────────────────────────────────────
const VideoCard = ({ video, liked, percent, onNavigate, onPlay, onToggleFavorite, modelName, modelImage, formatDuration, formatPosition, onModelClick }: {
  video: any; liked: boolean; percent: number;
  onNavigate: () => void; onPlay: () => void; onToggleFavorite: () => void;
  modelName?: string; modelImage?: string;
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

          <VideoCardPreview videoId={video.id} isHovered={hovered} onTimeUpdate={setPreviewTime} />

          {video.duration_seconds && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
              {formatDuration(video.duration_seconds)}
            </div>
          )}

          {hovered && previewTime > 0 && (
            <div className="absolute bottom-2 left-2 z-50 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground tabular-nums animate-pulse">
              {formatPosition(previewTime)}
            </div>
          )}

          <div className={cn("absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20", hovered ? "opacity-100" : "opacity-0")} />

          <div className={cn("absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none", hovered ? "opacity-100" : "opacity-0")}>
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30 transition-transform hover:scale-110 pointer-events-auto"
            >
              <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
            </button>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={cn("absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
              liked ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100"
            )}
          >
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
          </button>

          {video.source === "1fichier" && (
            <div className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
              <Crown size={12} className="text-yellow-400" />
            </div>
          )}

          {percent > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
              <div className={cn("h-full transition-all", percent >= 95 ? "bg-primary/70 w-full" : "bg-primary")} style={percent < 95 ? { width: `${percent}%` } : undefined} />
            </div>
          )}
        </div>

        <div className="mt-2 space-y-0.5">
          <div className="flex items-start gap-2">
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
                {percent > 0 && percent < 95 && <><span>•</span><span className="text-primary">{percent}%</span></>}
                {percent >= 95 && <><span>•</span><span className="text-primary/70">✓ Vu</span></>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main ───────────────────────────────────────────────────────────────────────
const Videos = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { favoriteIds, toggleFavorite, isFavorite } = useVideoFavorites();
  const { progressMap, getProgress } = useVideoProgress();
  useScrollRestore("videos");

  const { modelImages, modelNames } = useModels();

  const [search, setSearch] = useSessionState("videos_search", "");
  const [sortBy, setSortBy] = useSessionState<SortKey>("videos_sort", "date_new");
  const [sourceFilter, setSourceFilter] = useSessionState("videos_source", "all");
  const [formatFilter, setFormatFilter] = useSessionState("videos_format", "all");
  const [activeTab, setActiveTab] = useSessionState<TabKey>("videos_tab", "all");
  const [durationFilter, setDurationFilter] = useSessionState<DurationRange>("videos_duration", "all");
  const [page, setPage] = useState(1);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, sortBy, sourceFilter, formatFilter, activeTab, durationFilter]);

  // IDs des vidéos vues
  const watchedIds = useMemo(() => {
    const ids = new Set<string>();
    progressMap.forEach((p, id) => { if (p.position_seconds > 0) ids.add(id); });
    return ids;
  }, [progressMap]);

  const favCount = favoriteIds.size;
  const watchedCount = watchedIds.size;

  // Clé stable pour les tabs qui dépendent de sets
  const favKey = activeTab === "favorites" ? Array.from(favoriteIds).sort().join(",") : "";
  const watchedKey = activeTab === "watched" ? Array.from(watchedIds).sort().join(",") : "";

  // ── Query principale paginée ─────────────────────────────────────────────────
  const { data: pageResult, isLoading, isFetching } = useQuery({
    queryKey: ["videos-page", user?.id, page, search, sortBy, sourceFilter, formatFilter, durationFilter, activeTab, favKey, watchedKey],
    queryFn: async () => {
      if (activeTab === "favorites" && favoriteIds.size === 0) return { data: [], count: 0 };
      if (activeTab === "watched" && watchedIds.size === 0) return { data: [], count: 0 };

      const from = (page - 1) * ITEMS_PER_PAGE;
      let q = supabase
        .from("imported_videos")
        .select("id,title,original_url,thumbnail_url,model_id,source,format,file_size,duration_seconds,imported_at,is_active,average_rating,category_id", { count: "exact" })
        .range(from, from + ITEMS_PER_PAGE - 1);

      q = applyFilters(q, { userId: user?.id, search, sortBy, sourceFilter, formatFilter, durationFilter, activeTab, favoriteIds, watchedIds });

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
  });

  const videos = pageResult?.data ?? [];
  const totalCount = pageResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  // ── Métadonnées pour filtres (sources & formats distincts) ───────────────────
  const { data: metaData } = useQuery({
    queryKey: ["videos-meta", user?.id],
    queryFn: async () => {
      let q = supabase.from("imported_videos").select("source,format").eq("is_active", true);
      if (user) q = q.eq("user_id", user.id);
      const { data } = await q;
      const sources = [...new Set((data ?? []).map((r: any) => r.source).filter(Boolean))].sort() as string[];
      const formats = [...new Set((data ?? []).map((r: any) => r.format).filter(Boolean))].sort() as string[];
      return { sources, formats };
    },
    staleTime: 5 * 60 * 1000,
  });
  const sources: string[] = metaData?.sources ?? [];
  const formats: string[] = metaData?.formats ?? [];

  // ── Player ───────────────────────────────────────────────────────────────────
  const [playingVideo, setPlayingVideo] = useState<{ id: string; signedUrl: string; title: string; modelName?: string; modelId?: string } | null>(null);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  const resolveUrl = useCallback(async (video: any): Promise<string | null> => {
    // Google Drive public → iframe /preview directement
    if (video.original_url?.includes("drive.google.com")) {
      const match = video.original_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const fileId = match?.[1] || video.metadata?.fileId;
      return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : video.original_url;
    }
    // Autres sources → edge function avec fallback sur original_url
    try {
      const { data: tokenData, error } = await supabase.functions.invoke("video-token", { body: { videoId: video.id } });
      if (error || !tokenData?.token) return video.original_url || null;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return video.original_url || null;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/video-token?action=stream&id=${video.id}&t=${tokenData.token}&e=${tokenData.expiresAt}`,
        { headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey } }
      );
      const streamData = await res.json();
      return streamData.url || video.original_url || null;
    } catch { return video.original_url || null; }
  }, []);

  const openPlayer = useCallback(async (video: any, index: number) => {
    setLoadingPlayer(true);
    const url = await resolveUrl(video);
    if (url) {
      const mName = video.model_id ? modelNames.get(video.model_id) : video.metadata?.model_name;
      setPlayingVideo({ id: video.id, signedUrl: url, title: video.title, modelName: mName, modelId: video.model_id });
      setPlayingIndex(index);
    }
    setLoadingPlayer(false);
  }, [resolveUrl, modelNames]);

  const closePlayer = useCallback(() => { setPlayingVideo(null); setPlayingIndex(-1); }, []);

  const navigatePlayer = useCallback(async (direction: 1 | -1) => {
    const newIndex = playingIndex + direction;
    if (newIndex < 0 || newIndex >= videos.length) return;
    const v = videos[newIndex];
    setLoadingPlayer(true);
    const url = await resolveUrl(v);
    if (url) {
      const mName = v.model_id ? modelNames.get(v.model_id) : v.metadata?.model_name;
      setPlayingVideo({ id: v.id, signedUrl: url, title: v.title, modelName: mName, modelId: v.model_id });
      setPlayingIndex(newIndex);
    }
    setLoadingPlayer(false);
  }, [playingIndex, videos, resolveUrl, modelNames]);

  // ── Mix serveur-side ─────────────────────────────────────────────────────────
  const startMix = useCallback(async () => {
    let q = supabase.from("imported_videos").select("id").eq("is_active", true).limit(200);
    if (user) q = q.eq("user_id", user.id);
    if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);
    if (sourceFilter !== "all") {
      if (sourceFilter === "gdrive") q = q.ilike("original_url", "%drive.google.com%");
      else q = q.eq("source", sourceFilter);
    }
    if (formatFilter !== "all") q = q.eq("format", formatFilter);
    const { data } = await q;
    if (!data || data.length === 0) return;
    const pool = [...data];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    navigate(`/watch?mix=${encodeURIComponent(JSON.stringify(pool.slice(0, 50).map((v) => v.id)))}`);
  }, [user, search, sourceFilter, formatFilter, navigate]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const formatDuration = (s: number | null) => {
    if (!s) return "";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  const formatPosition = (s: number) => formatDuration(s) || "0:00";
  const sourceLabel = (s: string) => {
    if (s === "gdrive") return "Google Drive";
    if (s === "1fichier") return "1Fichier";
    if (s === "coomer") return "Coomer";
    return s;
  };
  const hasFilters = sourceFilter !== "all" || formatFilter !== "all" || sortBy !== "date_new" || durationFilter !== "all";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />
      <main className="pt-24 pb-12 px-4 md:px-12">

        <div className="flex flex-col gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground cyber-text-glow">Mes Vidéos</h1>
              <Button onClick={startMix} variant="secondary" size="sm" className="gap-1.5 text-xs md:text-sm">
                <Shuffle size={14} /> Mix
              </Button>
              <span className="text-xs md:text-sm text-muted-foreground">
                {isLoading ? "…" : `${totalCount.toLocaleString()} vidéo${totalCount > 1 ? "s" : ""}`}
              </span>
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

            <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Filter size={14} /><span className="hidden sm:inline">Source :</span></div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[110px] md:w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Toutes</SelectItem>
                <SelectItem value="gdrive" className="text-xs">Google Drive</SelectItem>
                {sources.filter(s => s !== "gdrive").map((s) => <SelectItem key={s} value={s} className="text-xs">{sourceLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>

            {formats.length > 1 && (<>
              <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="w-[90px] md:w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Tous formats</SelectItem>
                  {formats.map((f) => <SelectItem key={f} value={f} className="text-xs uppercase">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </>)}

            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                onClick={() => { setSortBy("date_new"); setSourceFilter("all"); setFormatFilter("all"); setDurationFilter("all"); }}>
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Loading indicator */}
        {(isLoading || isFetching) && (
          <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        )}

        {/* Grid */}
        {!isLoading && videos.length === 0 ? (
          <div className="text-center py-20">
            <Film size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">
              {activeTab === "favorites" ? "Aucun favori" : activeTab === "watched" ? "Aucune vidéo vue" : search ? "Aucun résultat" : "Aucune vidéo importée"}
            </p>
            {activeTab === "all" && !search && (
              <button onClick={() => navigate("/import")} className="mt-3 text-primary hover:underline text-sm">Importer des vidéos</button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {videos.map((video, index) => {
                const progress = getProgress(video.id);
                const posSeconds = progress?.position_seconds || 0;
                const dur = progress?.duration_seconds || video.duration_seconds || 0;
                const percent = progress?.watched_percent || (dur > 0 ? Math.round((posSeconds / dur) * 100) : 0);

                return (
                  <VideoCard
                    key={video.id}
                    video={video}
                    liked={isFavorite(video.id)}
                    percent={percent}
                    onNavigate={() => navigate(`/video/${video.id}`)}
                    onPlay={() => openPlayer(video, index)}
                    onToggleFavorite={() => toggleFavorite(video.id)}
                    modelName={video.model_id ? modelNames.get(video.model_id) : video.metadata?.model_name}
                    modelImage={video.model_id ? modelImages.get(video.model_id) : undefined}
                    formatDuration={formatDuration}
                    formatPosition={formatPosition}
                    onModelClick={(name) => navigate(`/models?select=${encodeURIComponent(name)}`)}
                  />
                );
              })}
            </div>

            <PaginationBar
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              startIndex={(page - 1) * ITEMS_PER_PAGE + 1}
              endIndex={Math.min(page * ITEMS_PER_PAGE, totalCount)}
              onPageChange={setPage}
              hasNext={page < totalPages}
              hasPrev={page > 1}
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
              hasNext={playingIndex >= 0 && playingIndex < videos.length - 1}
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