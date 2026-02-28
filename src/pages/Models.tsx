import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { usePagination } from "@/hooks/usePagination";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Search, User, Film, Play, Camera, Link, X, Upload, Check,
  Heart, Shuffle, ArrowUpDown, Filter, Eye, Loader2,
} from "lucide-react";
import { useModelFavorites } from "@/hooks/useModelFavorites";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import PaginationBar from "@/components/PaginationBar";
import VideoCardPreview from "@/components/VideoCardPreview";
import { cn } from "@/lib/utils";
import { CardContextMenu, videoContextMenuItems, modelContextMenuItems } from "@/components/CardContextMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Crown } from "lucide-react";

// ── Palettes ─────────────────────────────────────────────────
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
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const formatDuration = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// ── Types ─────────────────────────────────────────────────────
interface ModelProfile {
  id: string;
  name: string;
  profile_image_url: string | null;
  source_platform: string | null;
}

// ── Hook : charger TOUS les modèles depuis la table models ────
function useAllModels(userId?: string) {
  return useQuery({
    queryKey: ["all-models", userId ?? "public"],
    queryFn: async () => {
      let all: ModelProfile[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("models")
          .select("id, name, profile_image_url, source_platform")
          .order("name")
          .range(from, from + 999);
        if (userId) q = (q as any).eq("user_id", userId);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; break; }
        all = [...all, ...(data as ModelProfile[])];
        from += 1000;
        if (data.length < 1000) hasMore = false;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ── Hook : vidéos d'un modèle spécifique (on-demand) ─────────
function useModelVideos(modelId: string | null, userId?: string) {
  return useQuery({
    queryKey: ["model-videos", modelId, userId],
    queryFn: async () => {
      if (!modelId) return [];
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("imported_videos")
          .select("id,title,thumbnail_url,model_id,source,format,file_size,duration_seconds,imported_at,is_active,metadata")
          .eq("model_id", modelId)
          .eq("is_active", true)
          .order("imported_at", { ascending: false })
          .range(from, from + 999);
        if (userId) q = (q as any).eq("user_id", userId);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; break; }
        all = [...all, ...data];
        from += 1000;
        if (data.length < 1000) hasMore = false;
      }
      return all;
    },
    enabled: !!modelId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ── Hook : counts vidéos par modèle (en arrière-plan) ─────────
function useModelVideoCounts(modelIds: string[], userId?: string) {
  return useQuery({
    queryKey: ["model-video-counts", userId ?? "public", modelIds.length],
    queryFn: async () => {
      if (modelIds.length === 0) return new Map<string, number>();
      const countMap = new Map<string, number>();
      // Traiter par batch de 250 (limite du .in())
      for (let i = 0; i < modelIds.length; i += 250) {
        const batch = modelIds.slice(i, i + 250);
        let q = supabase
          .from("imported_videos")
          .select("model_id")
          .eq("is_active", true)
          .in("model_id", batch);
        if (userId) q = (q as any).eq("user_id", userId);
        // Utiliser count groupé
        const { data } = await q;
        (data || []).forEach((v: any) => {
          if (v.model_id) countMap.set(v.model_id, (countMap.get(v.model_id) || 0) + 1);
        });
      }
      return countMap;
    },
    enabled: modelIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

// ── ModelGridCard ─────────────────────────────────────────────
const ModelGridCard = ({
  model, videoCount, onClick, onEdit, isFav, onToggleFav,
}: {
  model: ModelProfile; videoCount: number; onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  isFav?: boolean; onToggleFav?: (e: React.MouseEvent) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const palette = GRADIENT_PALETTES[hashString(model.name) % GRADIENT_PALETTES.length];
  const nameAbbrev = (model.name || "M").substring(0, 2).toUpperCase();
  const imgSrc = !imgError ? model.profile_image_url : null;

  return (
    <CardContextMenu items={modelContextMenuItems(model.name)}>
      <div
        onClick={onClick}
        className="group cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          !imgSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60",
        )}>
          {/* Fond gradient toujours présent */}
          <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br", palette.from, palette.to)}>
            {imgSrc ? (
              <div className="w-3/4 aspect-square rounded-full overflow-hidden ring-4 ring-white/20 shadow-xl shadow-black/50">
                <img
                  src={imgSrc} alt={model.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : (
              <span className={cn("text-4xl md:text-5xl font-bold font-cyber tracking-wider", palette.text)}
                style={{ textShadow: "0 0 20px currentColor" }}>
                {nameAbbrev}
              </span>
            )}
          </div>

          {/* Favorite */}
          {onToggleFav && (
            <button onClick={(e) => { e.stopPropagation(); onToggleFav(e); }}
              className={cn("absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
                isFav ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100")}>
              <Heart size={14} fill={isFav ? "currentColor" : "none"} />
            </button>
          )}

          {/* Edit */}
          <button onClick={onEdit}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 z-40">
            <Camera size={14} className="text-foreground" />
          </button>

          {/* Overlay gradient + infos */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 p-3 z-20">
            <p className="text-foreground text-sm font-semibold truncate">{model.name}</p>
            <p className="text-foreground/70 text-xs">
              {videoCount > 0 ? `${videoCount} vidéo${videoCount > 1 ? "s" : ""}` : "—"}
            </p>
          </div>
        </div>
      </div>
    </CardContextMenu>
  );
};

// ── ModelVideoCard ────────────────────────────────────────────
const ModelVideoCard = ({ video, onClick, liked, percent, onToggleFavorite, formatPosition }: {
  video: any; onClick: () => void; liked?: boolean; percent?: number;
  onToggleFavorite?: () => void; formatPosition?: (s: number) => string;
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const palette = GRADIENT_PALETTES[hashString(video.id) % GRADIENT_PALETTES.length];
  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
  const pct = percent || 0;

  return (
    <CardContextMenu items={videoContextMenuItems(video.id, video.title)}>
      <div onClick={onClick} className="group cursor-pointer"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          imgError || !video.thumbnail_url ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60",
        )}>
          {!imgError && video.thumbnail_url ? (
            <img src={video.thumbnail_url} alt={video.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy" onError={() => setImgError(true)} />
          ) : (
            <div className={cn("w-full h-full flex flex-col items-center justify-center bg-gradient-to-br p-4", palette.from, palette.to)}>
              <span className={cn("text-4xl md:text-5xl font-bold font-cyber tracking-wider", palette.text)}
                style={{ textShadow: "0 0 20px currentColor" }}>{titleAbbrev}</span>
            </div>
          )}

          <VideoCardPreview videoId={video.id} isHovered={hovered} onTimeUpdate={setPreviewTime} />

          {video.duration_seconds && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
              {formatDuration(video.duration_seconds)}
            </div>
          )}

          {hovered && previewTime > 0 && formatPosition && (
            <div className="absolute bottom-2 left-2 z-50 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground tabular-nums animate-pulse">
              {formatPosition(previewTime)}
            </div>
          )}

          <div className={cn("absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20",
            hovered ? "opacity-100" : "opacity-0")} />

          <div className={cn("absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none",
            hovered ? "opacity-100" : "opacity-0")}>
            <div className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30">
              <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
            </div>
          </div>

          {onToggleFavorite && (
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              className={cn("absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
                liked ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100")}>
              <Heart size={14} fill={liked ? "currentColor" : "none"} />
            </button>
          )}

          {video.source === "1fichier" && (
            <div className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
              <Crown size={12} className="text-yellow-400" />
            </div>
          )}

          {pct > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
              <div className={cn("h-full transition-all", pct >= 95 ? "bg-primary/70 w-full" : "bg-primary")}
                style={pct < 95 ? { width: `${pct}%` } : undefined} />
            </div>
          )}
        </div>
        <div className="mt-2 space-y-0.5">
          <p className="text-foreground text-sm font-medium truncate leading-tight">{video.title}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            {video.format && <span className="uppercase">{video.format}</span>}
            {video.format && video.file_size && <span>•</span>}
            {video.file_size && <span>{(video.file_size / 1024 / 1024).toFixed(0)} Mo</span>}
            {pct > 0 && pct < 95 && <><span>•</span><span className="text-primary">{pct}%</span></>}
            {pct >= 95 && <><span>•</span><span className="text-primary/70">✓ Vu</span></>}
          </div>
        </div>
      </div>
    </CardContextMenu>
  );
};

// ── Page principale ───────────────────────────────────────────
const Models = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  useScrollRestore("models");

  const [search, setSearch] = useSessionState("models_search", "");
  const [selectedModelId, setSelectedModelId] = useSessionState<string | null>("models_selected_id", null);
  const [modelSort, setModelSort] = useSessionState<"name_asc" | "name_desc" | "count">("models_sort", "name_asc");

  // Video filters
  const [videoSortBy, setVideoSortBy] = useSessionState<SortKey>("models_vsort", "date_new");
  const [videoSourceFilter, setVideoSourceFilter] = useSessionState("models_vsource", "all");
  const [videoFormatFilter, setVideoFormatFilter] = useSessionState("models_vformat", "all");
  const [videoTab, setVideoTab] = useSessionState<VideoTabKey>("models_vtab", "all");
  const [videoSearch, setVideoSearch] = useSessionState("models_vsearch", "");

  const { favoriteIds: videoFavIds, isFavorite: isVideoFavorite, toggleFavorite: toggleVideoFavorite } = useVideoFavorites();
  const { isModelFavorite, toggleModelFavorite } = useModelFavorites();
  const { progressMap } = useVideoProgress();

  // ── Chargement des modèles depuis la table models ──────────
  const { data: allModels = [], isLoading: modelsLoading } = useAllModels(user?.id);

  // Counts en arrière-plan
  const modelIds = useMemo(() => allModels.map((m) => m.id), [allModels]);
  const { data: countMap = new Map<string, number>() } = useModelVideoCounts(modelIds, user?.id);

  // ── Modèle sélectionné ─────────────────────────────────────
  const selectedModel = selectedModelId ? allModels.find((m) => m.id === selectedModelId) || null : null;

  // Charger les vidéos ON DEMAND quand on clique sur un modèle
  const { data: modelVideos = [], isLoading: videosLoading } = useModelVideos(selectedModelId, user?.id);

  // Handle ?select= param (nom de modèle dans l'URL)
  useEffect(() => {
    const selectParam = searchParams.get("select");
    if (selectParam && allModels.length > 0) {
      const name = decodeURIComponent(selectParam);
      const found = allModels.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (found) setSelectedModelId(found.id);
    }
  }, [searchParams, allModels]);

  // Edit modal
  const [editModel, setEditModel] = useState<ModelProfile | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type SortKey = "title_asc" | "title_desc" | "date_new" | "date_old" | "duration_long" | "duration_short" | "size_big" | "size_small";
  type VideoTabKey = "all" | "favorites" | "watched";

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

  // ── Filtrage et tri de la liste modèles ────────────────────
  const filtered = useMemo(() => {
    let result = search.trim()
      ? allModels.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
      : [...allModels];
    switch (modelSort) {
      case "name_asc": result.sort((a, b) => a.name.localeCompare(b.name, "fr")); break;
      case "name_desc": result.sort((a, b) => b.name.localeCompare(a.name, "fr")); break;
      case "count": result.sort((a, b) => (countMap.get(b.id) || 0) - (countMap.get(a.id) || 0)); break;
    }
    return result;
  }, [allModels, search, modelSort, countMap]);

  const modelsPagination = usePagination(filtered, { pageSize: 30, storageKey: "models" });

  // ── Filtrage et tri des vidéos du modèle sélectionné ──────
  const modelVideoFavCount = useMemo(() => modelVideos.filter((v: any) => videoFavIds.has(v.id)).length, [modelVideos, videoFavIds]);
  const modelVideoWatchedCount = useMemo(() => modelVideos.filter((v: any) => {
    const p = progressMap.get(v.id);
    return p && p.position_seconds > 0;
  }).length, [modelVideos, progressMap]);

  const modelVideoSources = useMemo(() => {
    const set = new Set(modelVideos.map((v: any) => v.source).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [modelVideos]);

  const modelVideoFormats = useMemo(() => {
    const set = new Set(modelVideos.map((v: any) => v.format).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [modelVideos]);

  const filteredModelVideos = useMemo(() => {
    let result = [...modelVideos];
    if (videoTab === "favorites") result = result.filter((v: any) => videoFavIds.has(v.id));
    else if (videoTab === "watched") result = result.filter((v: any) => { const p = progressMap.get(v.id); return p && p.position_seconds > 0; });
    if (videoSearch.trim()) { const q = videoSearch.toLowerCase(); result = result.filter((v: any) => v.title.toLowerCase().includes(q)); }
    if (videoSourceFilter !== "all") result = result.filter((v: any) => v.source === videoSourceFilter);
    if (videoFormatFilter !== "all") result = result.filter((v: any) => v.format === videoFormatFilter);
    result.sort((a: any, b: any) => {
      switch (videoSortBy) {
        case "title_asc": return (a.title || "").localeCompare(b.title || "", "fr");
        case "title_desc": return (b.title || "").localeCompare(a.title || "", "fr");
        case "date_new": return new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime();
        case "date_old": return new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime();
        case "duration_long": { const ad = a.duration_seconds, bd = b.duration_seconds; if (!ad && !bd) return 0; if (!ad) return 1; if (!bd) return -1; return bd - ad; }
        case "duration_short": { const ad = a.duration_seconds, bd = b.duration_seconds; if (!ad && !bd) return 0; if (!ad) return 1; if (!bd) return -1; return ad - bd; }
        case "size_big": return (b.file_size || 0) - (a.file_size || 0);
        case "size_small": return (a.file_size || 0) - (b.file_size || 0);
        default: return 0;
      }
    });
    return result;
  }, [modelVideos, videoSearch, videoSortBy, videoSourceFilter, videoFormatFilter, videoTab, videoFavIds, progressMap]);

  const modelVideosPagination = usePagination(filteredModelVideos, { pageSize: ITEMS_PER_PAGE, storageKey: "model-videos" });

  // Mix
  const startModelMix = useCallback((videos: any[]) => {
    if (videos.length === 0) return;
    const pool = [...videos];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    navigate(`/watch?mix=${encodeURIComponent(JSON.stringify(pool.slice(0, 50).map((v) => v.id)))}`);
  }, [navigate]);

  // Save profile image
  const saveImageFromUrl = async (model: ModelProfile, url: string) => {
    if (!user || !url.trim()) return;
    setUploading(true);
    try {
      await supabase.from("models").update({ profile_image_url: url.trim(), source_platform: detectPlatform(url) } as any).eq("id", model.id);
      queryClient.invalidateQueries({ queryKey: ["all-models", user.id] });
      toast({ title: "Photo de profil mise à jour" });
      setEditModel(null);
      setImageUrl("");
    } catch { toast({ title: "Erreur", variant: "destructive" }); }
    setUploading(false);
  };

  const handleFileUpload = async (model: ModelProfile, file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${model.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
    const { error } = await supabase.storage.from("model-avatars").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Erreur upload", variant: "destructive" }); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("model-avatars").getPublicUrl(path);
    await saveImageFromUrl(model, pub.publicUrl + "?t=" + Date.now());
  };

  const detectPlatform = (url: string) => {
    if (url.includes("onlyfans")) return "onlyfans";
    if (url.includes("fansly")) return "fansly";
    if (url.includes("coomer")) return "coomer";
    return "custom";
  };

  const openEditModal = (model: ModelProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditModel(model);
    setImageUrl(model.profile_image_url || "");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />
      <main className="pt-24 pb-12 px-4 md:px-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            {selectedModelId && (
              <button onClick={() => { setSelectedModelId(null); setVideoSortBy("date_new"); setVideoSourceFilter("all"); setVideoFormatFilter("all"); setVideoSearch(""); setVideoTab("all"); }}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm">
                ← Retour
              </button>
            )}
            <h1 className="text-3xl font-bold text-foreground">
              {selectedModel ? selectedModel.name : "Modèles"}
            </h1>
            {selectedModel && (
              <span className="text-muted-foreground text-sm">
                {modelVideos.length} vidéo{modelVideos.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            {!selectedModelId && (
              <Select value={modelSort} onValueChange={(v) => setModelSort(v as any)}>
                <SelectTrigger className="w-auto h-9 text-xs gap-1">
                  <ArrowUpDown size={12} /> <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="count" className="text-xs">Par nombre</SelectItem>
                  <SelectItem value="name_asc" className="text-xs">A → Z</SelectItem>
                  <SelectItem value="name_desc" className="text-xs">Z → A</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 md:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher un modèle..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-destructive hover:text-destructive/80 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Loading modèles */}
        {modelsLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 size={28} className="animate-spin text-primary" />
            <span className="text-muted-foreground">Chargement des modèles…</span>
          </div>
        ) : selectedModelId && selectedModel ? (
          <>
            {/* Model header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border">
                  {selectedModel.profile_image_url ? (
                    <img src={selectedModel.profile_image_url} alt={selectedModel.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br",
                      GRADIENT_PALETTES[hashString(selectedModel.name) % GRADIENT_PALETTES.length].from,
                      GRADIENT_PALETTES[hashString(selectedModel.name) % GRADIENT_PALETTES.length].to)}>
                      <span className={cn("text-2xl font-bold", GRADIENT_PALETTES[hashString(selectedModel.name) % GRADIENT_PALETTES.length].text)}>
                        {selectedModel.name.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={(e) => openEditModal(selectedModel, e)}
                  className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={20} className="text-foreground" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedModel.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {videosLoading ? "Chargement…" : `${modelVideos.length} vidéo${modelVideos.length > 1 ? "s" : ""}`}
                  </p>
                  {selectedModel.source_platform && <span className="text-xs text-primary capitalize">{selectedModel.source_platform}</span>}
                </div>
                <button onClick={() => toggleModelFavorite(selectedModel.id)}
                  className={cn("p-2 rounded-full transition-all",
                    isModelFavorite(selectedModel.id) ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-red-400 bg-muted")}>
                  <Heart size={18} fill={isModelFavorite(selectedModel.id) ? "currentColor" : "none"} />
                </button>
                {modelVideos.length >= 2 && (
                  <Button onClick={() => startModelMix(modelVideos)} variant="secondary" size="sm" className="gap-1.5">
                    <Shuffle size={16} /> Mix ({Math.min(modelVideos.length, 50)})
                  </Button>
                )}
              </div>
            </div>

            {/* Videos loading */}
            {videosLoading ? (
              <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 size={24} className="animate-spin text-primary" />
                <span className="text-muted-foreground">Chargement des vidéos…</span>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-col gap-3 mb-6">
                  <div className="flex items-center gap-1 border-b border-border">
                    {[
                      { key: "all" as VideoTabKey, icon: Film, label: "Toutes", count: undefined as number | undefined },
                      { key: "favorites" as VideoTabKey, icon: Heart, label: "Favoris", count: modelVideoFavCount },
                      { key: "watched" as VideoTabKey, icon: Eye, label: "Vus", count: modelVideoWatchedCount },
                    ].map(({ key, icon: Icon, label, count }) => (
                      <button key={key} onClick={() => setVideoTab(key)}
                        className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                          videoTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
                        <Icon size={14} /> {label}
                        {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full md:w-56">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Rechercher..." value={videoSearch} onChange={(e) => setVideoSearch(e.target.value)} className="pl-8 pr-7 h-8 text-xs" />
                      {videoSearch && <button onClick={() => setVideoSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive"><X size={14} /></button>}
                    </div>
                    <Select value={videoSortBy} onValueChange={(v) => setVideoSortBy(v as SortKey)}>
                      <SelectTrigger className="w-auto h-8 text-xs gap-1"><ArrowUpDown size={12} /> <SelectValue /></SelectTrigger>
                      <SelectContent>{SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {modelVideoSources.length > 1 && (
                      <Select value={videoSourceFilter} onValueChange={setVideoSourceFilter}>
                        <SelectTrigger className="w-auto h-8 text-xs gap-1"><Filter size={12} /> <SelectValue placeholder="Source" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">Toutes sources</SelectItem>
                          {modelVideoSources.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {modelVideoFormats.length > 1 && (
                      <Select value={videoFormatFilter} onValueChange={setVideoFormatFilter}>
                        <SelectTrigger className="w-auto h-8 text-xs gap-1"><Filter size={12} /> <SelectValue placeholder="Format" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">Tous formats</SelectItem>
                          {modelVideoFormats.map((f) => <SelectItem key={f} value={f} className="text-xs uppercase">{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {(videoSourceFilter !== "all" || videoFormatFilter !== "all" || videoSortBy !== "date_new" || videoSearch) && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                        onClick={() => { setVideoSortBy("date_new"); setVideoSourceFilter("all"); setVideoFormatFilter("all"); setVideoSearch(""); }}>
                        Réinitialiser
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {filteredModelVideos.length} vidéo{filteredModelVideos.length > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {filteredModelVideos.length === 0 ? (
                  <div className="text-center py-12">
                    <Film size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">Aucune vidéo trouvée</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {modelVideosPagination.paginatedItems.map((video: any) => {
                        const prog = progressMap.get(video.id);
                        const pct = prog?.watched_percent || 0;
                        return (
                          <ModelVideoCard key={video.id} video={video}
                            onClick={() => navigate(`/watch?v=${video.id}`)}
                            liked={isVideoFavorite(video.id)} percent={pct}
                            onToggleFavorite={() => toggleVideoFavorite(video.id)}
                            formatPosition={(s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60); return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`; }}
                          />
                        );
                      })}
                    </div>
                    <PaginationBar currentPage={modelVideosPagination.currentPage} totalPages={modelVideosPagination.totalPages}
                      totalItems={modelVideosPagination.totalItems} startIndex={modelVideosPagination.startIndex}
                      endIndex={modelVideosPagination.endIndex} onPageChange={modelVideosPagination.goToPage}
                      hasNext={modelVideosPagination.hasNext} hasPrev={modelVideosPagination.hasPrev} />
                  </>
                )}
              </>
            )}
          </>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <User size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">{search ? "Aucun résultat" : "Aucun modèle trouvé"}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {modelsPagination.paginatedItems.map((model) => (
                <ModelGridCard key={model.id} model={model} videoCount={countMap.get(model.id) || 0}
                  onClick={() => { setSelectedModelId(model.id); setVideoSortBy("date_new"); setVideoSourceFilter("all"); setVideoFormatFilter("all"); setVideoSearch(""); setVideoTab("all"); }}
                  onEdit={(e) => openEditModal(model, e)}
                  isFav={isModelFavorite(model.id)}
                  onToggleFav={(e) => { e.stopPropagation(); toggleModelFavorite(model.id); }}
                />
              ))}
            </div>
            <PaginationBar currentPage={modelsPagination.currentPage} totalPages={modelsPagination.totalPages}
              totalItems={modelsPagination.totalItems} startIndex={modelsPagination.startIndex}
              endIndex={modelsPagination.endIndex} onPageChange={modelsPagination.goToPage}
              hasNext={modelsPagination.hasNext} hasPrev={modelsPagination.hasPrev} />
          </>
        )}
      </main>
      <Footer />

      {/* Edit modal */}
      <Dialog open={!!editModel} onOpenChange={(open) => { if (!open) { setEditModel(null); setImageUrl(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Photo de profil — {editModel?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-28 h-28 rounded-full overflow-hidden bg-muted border-2 border-border">
                {imageUrl || editModel?.profile_image_url ? (
                  <img src={imageUrl || editModel?.profile_image_url || ""} alt={editModel?.name}
                    className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><User size={40} className="text-muted-foreground" /></div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2"><Link size={14} /> Depuis une URL</label>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="flex-1" />
                <Button size="sm" disabled={!imageUrl.trim() || uploading} onClick={() => editModel && saveImageFromUrl(editModel, imageUrl)}>
                  {uploading ? "..." : <Check size={16} />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2"><Upload size={14} /> Importer un fichier</label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f && editModel) handleFileUpload(editModel, f); }} />
              <Button variant="outline" className="w-full" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                <Camera size={16} className="mr-2" /> Choisir une image
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Liens rapides</p>
              <div className="flex flex-wrap gap-2">
                {editModel?.name && editModel.name !== "Non classé" && (
                  <>
                    <Button variant="secondary" size="sm" className="text-xs"
                      onClick={() => setImageUrl(`https://img.coomer.st/icons/onlyfans/${editModel.name}`)}>OnlyFans</Button>
                    <Button variant="secondary" size="sm" className="text-xs"
                      onClick={() => setImageUrl(`https://img.coomer.st/icons/fansly/${editModel.name}`)}>Fansly</Button>
                  </>
                )}
              </div>
            </div>
            {editModel?.profile_image_url && (
              <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!editModel) return;
                  await supabase.from("models").update({ profile_image_url: null } as any).eq("id", editModel.id);
                  queryClient.invalidateQueries({ queryKey: ["all-models", user?.id] });
                  setEditModel(null); setImageUrl("");
                  toast({ title: "Photo supprimée" });
                }}>
                <X size={14} className="mr-1" /> Supprimer la photo
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Models;