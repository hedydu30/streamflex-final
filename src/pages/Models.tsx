import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { usePagination } from "@/hooks/usePagination";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useImportedVideos, useImportedVideosProgress } from "@/hooks/useImportedVideos";
import { useModels } from "@/hooks/useModels";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Search,
  User,
  Film,
  Play,
  Camera,
  Link,
  X,
  Upload,
  Check,
  Heart,
  Clock,
  Crown,
  Shuffle,
  ArrowUpDown,
  Filter,
  Eye,
} from "lucide-react";
import { useModelFavorites } from "@/hooks/useModelFavorites";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import PaginationBar from "@/components/PaginationBar";
import VideoCardPreview from "@/components/VideoCardPreview";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Deterministic gradient palettes (same as Videos page)
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

interface ModelProfile {
  id: string;
  name: string;
  profile_image_url: string | null;
  source_platform: string | null;
}

interface Model {
  name: string;
  videoCount: number;
  thumbnail: string | null;
  videos: any[];
  profile?: ModelProfile;
}

const ModelVideoCard = ({
  video,
  onClick,
  liked,
  percent,
  onToggleFavorite,
  formatPosition,
}: {
  video: any;
  onClick: () => void;
  liked?: boolean;
  percent?: number;
  onToggleFavorite?: () => void;
  formatPosition?: (s: number) => string;
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const palette = GRADIENT_PALETTES[hashString(video.id) % GRADIENT_PALETTES.length];
  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
  const pct = percent || 0;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          imgError || !video.thumbnail_url
            ? `${palette.border} ring-0 border`
            : "ring-border/30 group-hover:ring-primary/60",
        )}
      >
        {!imgError && video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex flex-col items-center justify-center bg-gradient-to-br p-4",
              palette.from,
              palette.to,
            )}
          >
            <span
              className={cn("text-4xl md:text-5xl font-bold font-cyber tracking-wider", palette.text)}
              style={{ textShadow: "0 0 20px currentColor" }}
            >
              {titleAbbrev}
            </span>
          </div>
        )}

        <VideoCardPreview videoId={video.id} isHovered={hovered} onTimeUpdate={setPreviewTime} />

        {/* Total duration top center */}
        {video.duration_seconds && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
            {formatDuration(video.duration_seconds)}
          </div>
        )}

        {/* Preview elapsed time counter */}
        {hovered && previewTime > 0 && formatPosition && (
          <div className="absolute bottom-2 left-2 z-50 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground tabular-nums animate-pulse">
            {formatPosition(previewTime)}
          </div>
        )}

        {/* Gradient overlay on hover */}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20",
            hovered ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Center play button on hover */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30">
            <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
          </div>
        </div>

        {/* Favorite button */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
              liked
                ? "text-red-500 opacity-100"
                : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100",
            )}
          >
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
          </button>
        )}

        {/* Premium badge */}
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
        {pct > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
            <div
              className={cn("h-full transition-all", pct >= 95 ? "bg-primary/70 w-full" : "bg-primary")}
              style={pct < 95 ? { width: `${pct}%` } : undefined}
            />
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-foreground text-sm font-medium truncate leading-tight">{video.title}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          {video.format && <span className="uppercase">{video.format}</span>}
          {video.format && video.file_size && <span>•</span>}
          {video.file_size && <span>{(video.file_size / 1024 / 1024).toFixed(0)} Mo</span>}
          {pct > 0 && pct < 95 && (
            <>
              <span>•</span>
              <span className="text-primary">{pct}%</span>
            </>
          )}
          {pct >= 95 && (
            <>
              <span>•</span>
              <span className="text-primary/70">✓ Vu</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ModelGridCard = ({
  model,
  onClick,
  onEdit,
  isFav,
  onToggleFav,
}: {
  model: Model;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  isFav?: boolean;
  onToggleFav?: (e: React.MouseEvent) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const firstVideoId = model.videos[0]?.id;
  const palette = GRADIENT_PALETTES[hashString(model.name) % GRADIENT_PALETTES.length];
  const nameAbbrev = (model.name || "M").substring(0, 2).toUpperCase();
  const imgSrc = !imgError ? model.profile?.profile_image_url || model.thumbnail : null;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          !imgSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60",
        )}
      >
        {/* Background gradient always shown */}
        <div
          className={cn(
            "w-full h-full flex flex-col items-center justify-center bg-gradient-to-br",
            palette.from,
            palette.to,
          )}
        >
          {imgSrc ? (
            /* Circular photo centered in card */
            <div className="w-3/4 aspect-square rounded-full overflow-hidden ring-4 ring-white/20 shadow-xl shadow-black/50 flex-shrink-0">
              <img
                src={imgSrc}
                alt={model.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            </div>
          ) : (
            <span
              className={cn("text-4xl md:text-5xl font-bold font-cyber tracking-wider", palette.text)}
              style={{ textShadow: "0 0 20px currentColor" }}
            >
              {nameAbbrev}
            </span>
          )}
        </div>
        {firstVideoId && <VideoCardPreview videoId={firstVideoId} isHovered={hovered} />}

        {/* Favorite heart button */}
        {onToggleFav && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFav(e);
            }}
            className={cn(
              "absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
              isFav
                ? "text-red-500 opacity-100"
                : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100",
            )}
          >
            <Heart size={14} fill={isFav ? "currentColor" : "none"} />
          </button>
        )}

        {/* Edit button */}
        <button
          onClick={onEdit}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 z-40"
          title="Modifier la photo de profil"
        >
          <Camera size={14} className="text-foreground" />
        </button>

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Info */}
        <div className="absolute bottom-0 inset-x-0 p-3 z-20">
          <p className="text-foreground text-sm font-semibold truncate">{model.name}</p>
          <p className="text-foreground/70 text-xs">
            {model.videoCount} vidéo{model.videoCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
};

const Models = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  useScrollRestore("models");

  // Use cached hooks instead of manual fetching
  const { data: videos = [], isLoading: videosLoading, isFetching } = useImportedVideos();
  const loadingProgress = useImportedVideosProgress();
  const isStillLoading = isFetching && !loadingProgress.done;
  const { models: modelProfilesList } = useModels();

  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [search, setSearch] = useSessionState("models_search", "");
  const [selectedModel, setSelectedModel] = useSessionState<string | null>("models_selected", null);

  // Video filters (for model detail view)
  const [videoSortBy, setVideoSortBy] = useSessionState<SortKey>("models_vsort", "date_new");
  const [videoSourceFilter, setVideoSourceFilter] = useSessionState("models_vsource", "all");
  const [videoFormatFilter, setVideoFormatFilter] = useSessionState("models_vformat", "all");
  const [videoTab, setVideoTab] = useSessionState<VideoTabKey>("models_vtab", "all");
  const [videoSearch, setVideoSearch] = useSessionState("models_vsearch", "");

  const {
    favoriteIds: videoFavIds,
    isFavorite: isVideoFavorite,
    toggleFavorite: toggleVideoFavorite,
  } = useVideoFavorites();
  const { isModelFavorite, toggleModelFavorite } = useModelFavorites();
  const { progressMap, getProgress } = useVideoProgress();

  // Sync model profiles from hook + local edits
  useEffect(() => {
    const fetchProfiles = async () => {
      let query = supabase.from("models").select("*");
      if (user) {
        query = query.eq("user_id", user.id);
      }
      const res = await query;
      setModelProfiles((res.data as any[]) || []);
    };
    fetchProfiles();
  }, [user, modelProfilesList]);

  const loading = videosLoading;

  // Handle ?select= param from video page links
  useEffect(() => {
    const selectParam = searchParams.get("select");
    if (selectParam) {
      setSelectedModel(decodeURIComponent(selectParam));
    }
  }, [searchParams]);

  // Edit modal state
  const [editModel, setEditModel] = useState<Model | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mix: shuffle and play model's videos
  const startModelMix = useCallback(
    (modelVideos: any[]) => {
      if (modelVideos.length === 0) return;
      const pool = [...modelVideos];
      for (let i = pool.length - 1; i > 0; i--) {
        const rnd = crypto.getRandomValues(new Uint32Array(1))[0];
        const j = rnd % (i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const mixIds = pool.slice(0, 50).map((v: any) => v.id);
      navigate(`/watch?mix=${encodeURIComponent(JSON.stringify(mixIds))}`);
    },
    [navigate],
  );

  type SortKey =
    | "title_asc"
    | "title_desc"
    | "date_new"
    | "date_old"
    | "duration_long"
    | "duration_short"
    | "size_big"
    | "size_small";
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

  const models = useMemo(() => {
    // Build model_id -> profile map
    const profileById = new Map<string, ModelProfile>();
    const profileByName = new Map<string, ModelProfile>();
    for (const p of modelProfiles) {
      profileById.set(p.id, p);
      profileByName.set(p.name.toLowerCase(), p);
    }

    const map = new Map<string, any[]>();

    for (const v of videos) {
      let modelName: string | null = null;

      // Priority 1: model_id foreign key
      if (v.model_id && profileById.has(v.model_id)) {
        modelName = profileById.get(v.model_id)!.name;
      }
      // Priority 2: metadata fallback
      if (!modelName) {
        modelName = v.metadata?.user_id || v.metadata?.model || v.metadata?.model_name || null;
        if (v.source === "coomer" && v.metadata?.service && v.metadata?.user_id) {
          modelName = `${v.metadata.user_id}`;
        }
      }
      if (!modelName) modelName = "Non classé";
      if (!map.has(modelName)) map.set(modelName, []);
      map.get(modelName)!.push(v);
    }

    const result: Model[] = Array.from(map.entries()).map(([name, vids]) => {
      const profile = profileByName.get(name.toLowerCase()) || modelProfiles.find((p) => p.name === name);
      // Use the first video's thumbnail that actually has one
      const firstThumb = vids.find((v) => v.thumbnail_url)?.thumbnail_url || null;
      return {
        name,
        videoCount: vids.length,
        thumbnail: profile?.profile_image_url || firstThumb,
        videos: vids,
        profile,
      };
    });

    return result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [videos, modelProfiles]);

  const [modelSort, setModelSort] = useSessionState<"name_asc" | "name_desc" | "count">("models_sort", "name_asc");

  const filtered = useMemo(() => {
    let result = search.trim()
      ? models.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
      : [...models];
    switch (modelSort) {
      case "name_asc":
        result.sort((a, b) => a.name.localeCompare(b.name, "fr"));
        break;
      case "name_desc":
        result.sort((a, b) => b.name.localeCompare(a.name, "fr"));
        break;
      case "count":
        result.sort((a, b) => b.videoCount - a.videoCount);
        break;
    }
    return result;
  }, [models, search, modelSort]);

  const modelsPagination = usePagination(filtered, { pageSize: 30, storageKey: "models" });

  const selectedModelData = selectedModel ? models.find((m) => m.name === selectedModel) : null;

  // Compute sources/formats for the selected model's videos
  const modelVideoSources = useMemo(() => {
    if (!selectedModelData) return [];
    const set = new Set(selectedModelData.videos.map((v: any) => v.source).filter(Boolean));
    return Array.from(set).sort();
  }, [selectedModelData]);

  const modelVideoFormats = useMemo(() => {
    if (!selectedModelData) return [];
    const set = new Set(selectedModelData.videos.map((v: any) => v.format).filter(Boolean));
    return Array.from(set).sort();
  }, [selectedModelData]);

  const modelVideoFavCount = useMemo(() => {
    if (!selectedModelData) return 0;
    return selectedModelData.videos.filter((v: any) => videoFavIds.has(v.id)).length;
  }, [selectedModelData, videoFavIds]);

  const modelVideoWatchedCount = useMemo(() => {
    if (!selectedModelData) return 0;
    return selectedModelData.videos.filter(
      (v: any) => progressMap.has(v.id) && (progressMap.get(v.id)?.position_seconds || 0) > 0,
    ).length;
  }, [selectedModelData, progressMap]);

  // Filter & sort model videos
  const filteredModelVideos = useMemo(() => {
    if (!selectedModelData) return [];
    let result = [...selectedModelData.videos];
    if (videoTab === "favorites") result = result.filter((v: any) => videoFavIds.has(v.id));
    else if (videoTab === "watched")
      result = result.filter((v: any) => {
        const p = progressMap.get(v.id);
        return p && p.position_seconds > 0;
      });
    if (videoSearch.trim()) {
      const q = videoSearch.toLowerCase();
      result = result.filter((v: any) => v.title.toLowerCase().includes(q));
    }
    if (videoSourceFilter !== "all") result = result.filter((v: any) => v.source === videoSourceFilter);
    if (videoFormatFilter !== "all") result = result.filter((v: any) => v.format === videoFormatFilter);
    result.sort((a: any, b: any) => {
      switch (videoSortBy) {
        case "title_asc":
          return (a.title || "").localeCompare(b.title || "", "fr");
        case "title_desc":
          return (b.title || "").localeCompare(a.title || "", "fr");
        case "date_new":
          return new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime();
        case "date_old":
          return new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime();
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
        case "size_big":
          return (b.file_size || 0) - (a.file_size || 0);
        case "size_small":
          return (a.file_size || 0) - (b.file_size || 0);
        default:
          return 0;
      }
    });
    return result;
  }, [
    selectedModelData,
    videoSearch,
    videoSortBy,
    videoSourceFilter,
    videoFormatFilter,
    videoTab,
    videoFavIds,
    progressMap,
  ]);

  const modelVideosPagination = usePagination(filteredModelVideos, {
    pageSize: ITEMS_PER_PAGE,
    storageKey: "model-videos",
  });

  // Save profile image from URL
  const saveImageFromUrl = async (model: Model, url: string) => {
    if (!user || !url.trim()) return;
    setUploading(true);

    try {
      const profileData = {
        user_id: user.id,
        name: model.name,
        profile_image_url: url.trim(),
        source_platform: detectPlatform(url),
      };

      if (model.profile) {
        await supabase
          .from("models")
          .update({ profile_image_url: url.trim(), source_platform: detectPlatform(url) } as any)
          .eq("id", model.profile.id);
      } else {
        await supabase.from("models").insert(profileData as any);
      }

      // Update local state
      setModelProfiles((prev) => {
        const existing = prev.findIndex((p) => p.name === model.name);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], profile_image_url: url.trim() };
          return updated;
        }
        return [...prev, { id: crypto.randomUUID(), ...profileData }];
      });

      toast({ title: "Photo de profil mise à jour" });
      setEditModel(null);
      setImageUrl("");
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder l'image", variant: "destructive" });
    }
    setUploading(false);
  };

  // Upload file
  const handleFileUpload = async (model: Model, file: File) => {
    if (!user) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `${user.id}/${model.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

    const { error } = await supabase.storage.from("model-avatars").upload(path, file, { upsert: true });

    if (error) {
      toast({ title: "Erreur", description: "Impossible d'uploader l'image", variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("model-avatars").getPublicUrl(path);
    const finalUrl = publicUrl.publicUrl + "?t=" + Date.now();
    await saveImageFromUrl(model, finalUrl);
  };

  const detectPlatform = (url: string): string => {
    if (url.includes("onlyfans")) return "onlyfans";
    if (url.includes("fansly")) return "fansly";
    if (url.includes("coomer")) return "coomer";
    return "custom";
  };

  const openEditModal = (model: Model, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditModel(model);
    setImageUrl(model.profile?.profile_image_url || "");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />
      <main className="pt-24 pb-12 px-4 md:px-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            {selectedModel && (
              <button
                onClick={() => {
                  setSelectedModel(null);
                  setVideoSortBy("date_new");
                  setVideoSourceFilter("all");
                  setVideoFormatFilter("all");
                  setVideoSearch("");
                  setVideoTab("all");
                }}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                ← Retour
              </button>
            )}
            <h1 className="text-3xl font-bold text-foreground">{selectedModel ? selectedModel : "Modèles"}</h1>
            {selectedModelData && (
              <span className="text-muted-foreground text-sm">
                {selectedModelData.videoCount} vidéo{selectedModelData.videoCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            {!selectedModel && (
              <Select value={modelSort} onValueChange={(v) => setModelSort(v as any)}>
                <SelectTrigger className="w-auto h-9 text-xs gap-1">
                  <ArrowUpDown size={12} /> <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="count" className="text-xs">
                    Par nombre
                  </SelectItem>
                  <SelectItem value="name_asc" className="text-xs">
                    A → Z
                  </SelectItem>
                  <SelectItem value="name_desc" className="text-xs">
                    Z → A
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 md:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un modèle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-destructive hover:text-destructive/80 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
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
              {loadingProgress.loaded}
              {loadingProgress.total ? ` / ${loadingProgress.total}` : ""} vidéos
            </span>
          </div>
        )}

        {loading && !isFetching ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : selectedModel && selectedModelData ? (
          <>
            {/* Model header with profile image */}
            <div className="flex items-center gap-4 mb-8">
              <div className="relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border">
                  {selectedModelData.profile?.profile_image_url ? (
                    <img
                      src={selectedModelData.profile.profile_image_url}
                      alt={selectedModel}
                      className="w-full h-full object-cover"
                    />
                  ) : selectedModelData.thumbnail ? (
                    <img src={selectedModelData.thumbnail} alt={selectedModel} className="w-full h-full object-cover" />
                  ) : (
                    <img
                      src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(selectedModel)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`}
                      alt={selectedModel}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <button
                  onClick={(e) => openEditModal(selectedModelData, e)}
                  className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera size={20} className="text-foreground" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedModel}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedModelData.videoCount} vidéo{selectedModelData.videoCount > 1 ? "s" : ""}
                  </p>
                  {selectedModelData.profile?.source_platform && (
                    <span className="text-xs text-primary capitalize">{selectedModelData.profile.source_platform}</span>
                  )}
                </div>
                {selectedModelData.profile && (
                  <button
                    onClick={() => toggleModelFavorite(selectedModelData.profile!.id)}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      isModelFavorite(selectedModelData.profile.id)
                        ? "text-red-500 bg-red-500/10"
                        : "text-muted-foreground hover:text-red-400 bg-muted",
                    )}
                  >
                    <Heart size={18} fill={isModelFavorite(selectedModelData.profile.id) ? "currentColor" : "none"} />
                  </button>
                )}
                {selectedModelData.videoCount >= 2 && (
                  <Button
                    onClick={() => startModelMix(selectedModelData.videos)}
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                  >
                    <Shuffle size={16} /> Mix ({Math.min(selectedModelData.videoCount, 50)})
                  </Button>
                )}
              </div>
            </div>
            {/* Filters bar */}
            <div className="flex flex-col gap-3 mb-6">
              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border">
                {[
                  { key: "all" as VideoTabKey, icon: Film, label: "Toutes", count: undefined as number | undefined },
                  { key: "favorites" as VideoTabKey, icon: Heart, label: "Favoris", count: modelVideoFavCount },
                  { key: "watched" as VideoTabKey, icon: Eye, label: "Vus", count: modelVideoWatchedCount },
                ].map(({ key, icon: Icon, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setVideoTab(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                      videoTab === key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                    )}
                  >
                    <Icon size={14} />
                    {label}
                    {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
                  </button>
                ))}
              </div>

              {/* Search + sort + filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full md:w-56">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={videoSearch}
                    onChange={(e) => setVideoSearch(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs"
                  />
                  {videoSearch && (
                    <button
                      onClick={() => setVideoSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <Select value={videoSortBy} onValueChange={(v) => setVideoSortBy(v as SortKey)}>
                  <SelectTrigger className="w-auto h-8 text-xs gap-1">
                    <ArrowUpDown size={12} /> <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {modelVideoSources.length > 1 && (
                  <Select value={videoSourceFilter} onValueChange={setVideoSourceFilter}>
                    <SelectTrigger className="w-auto h-8 text-xs gap-1">
                      <Filter size={12} /> <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        Toutes sources
                      </SelectItem>
                      {modelVideoSources.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {modelVideoFormats.length > 1 && (
                  <Select value={videoFormatFilter} onValueChange={setVideoFormatFilter}>
                    <SelectTrigger className="w-auto h-8 text-xs gap-1">
                      <Filter size={12} /> <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        Tous formats
                      </SelectItem>
                      {modelVideoFormats.map((f) => (
                        <SelectItem key={f} value={f} className="text-xs uppercase">
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {(videoSourceFilter !== "all" ||
                  videoFormatFilter !== "all" ||
                  videoSortBy !== "date_new" ||
                  videoSearch) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => {
                      setVideoSortBy("date_new");
                      setVideoSourceFilter("all");
                      setVideoFormatFilter("all");
                      setVideoSearch("");
                    }}
                  >
                    Réinitialiser
                  </Button>
                )}

                <span className="text-xs text-muted-foreground ml-auto">
                  {filteredModelVideos.length} vidéo{filteredModelVideos.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Videos grid */}
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
                      <ModelVideoCard
                        key={video.id}
                        video={video}
                        onClick={() => navigate(`/watch?v=${video.id}`)}
                        liked={isVideoFavorite(video.id)}
                        percent={pct}
                        onToggleFavorite={() => toggleVideoFavorite(video.id)}
                        formatPosition={(s: number) => {
                          const h = Math.floor(s / 3600);
                          const m = Math.floor((s % 3600) / 60);
                          const sec = Math.floor(s % 60);
                          if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
                          return `${m}:${sec.toString().padStart(2, "0")}`;
                        }}
                      />
                    );
                  })}
                </div>
                <PaginationBar
                  currentPage={modelVideosPagination.currentPage}
                  totalPages={modelVideosPagination.totalPages}
                  totalItems={modelVideosPagination.totalItems}
                  startIndex={modelVideosPagination.startIndex}
                  endIndex={modelVideosPagination.endIndex}
                  onPageChange={modelVideosPagination.goToPage}
                  hasNext={modelVideosPagination.hasNext}
                  hasPrev={modelVideosPagination.hasPrev}
                />
              </>
            )}
          </>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <User size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">{search ? "Aucun résultat" : "Aucun modèle trouvé"}</p>
            {!search && (
              <button onClick={() => navigate("/import")} className="mt-3 text-primary hover:underline text-sm">
                Importer des vidéos pour commencer
              </button>
            )}
          </div>
        ) : (
          /* Models grid */
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {modelsPagination.paginatedItems.map((model) => (
                <ModelGridCard
                  key={model.name}
                  model={model}
                  onClick={() => {
                    setSelectedModel(model.name);
                    setSearch("");
                    setVideoSortBy("date_new");
                    setVideoSourceFilter("all");
                    setVideoFormatFilter("all");
                    setVideoSearch("");
                    setVideoTab("all");
                  }}
                  onEdit={(e) => openEditModal(model, e)}
                  isFav={model.profile ? isModelFavorite(model.profile.id) : false}
                  onToggleFav={
                    model.profile
                      ? (e) => {
                          e.stopPropagation();
                          toggleModelFavorite(model.profile!.id);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
            <PaginationBar
              currentPage={modelsPagination.currentPage}
              totalPages={modelsPagination.totalPages}
              totalItems={modelsPagination.totalItems}
              startIndex={modelsPagination.startIndex}
              endIndex={modelsPagination.endIndex}
              onPageChange={modelsPagination.goToPage}
              hasNext={modelsPagination.hasNext}
              hasPrev={modelsPagination.hasPrev}
            />
          </>
        )}
      </main>
      <Footer />

      {/* Edit Profile Image Modal */}
      <Dialog
        open={!!editModel}
        onOpenChange={(open) => {
          if (!open) {
            setEditModel(null);
            setImageUrl("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Photo de profil — {editModel?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Current image preview */}
            <div className="flex justify-center">
              <div className="w-28 h-28 rounded-full overflow-hidden bg-muted border-2 border-border">
                {imageUrl || editModel?.profile?.profile_image_url ? (
                  <img
                    src={imageUrl || editModel?.profile?.profile_image_url || ""}
                    alt={editModel?.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User size={40} className="text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* URL input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Link size={14} />
                Depuis une URL
              </label>
              <p className="text-xs text-muted-foreground">Collez un lien d'image (OnlyFans, Fansly, ou autre)</p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  disabled={!imageUrl.trim() || uploading}
                  onClick={() => editModel && saveImageFromUrl(editModel, imageUrl)}
                >
                  {uploading ? "..." : <Check size={16} />}
                </Button>
              </div>
            </div>

            {/* File upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Upload size={14} />
                Importer un fichier
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && editModel) handleFileUpload(editModel, file);
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={16} className="mr-2" />
                Choisir une image
              </Button>
            </div>

            {/* Quick URL suggestions */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Liens rapides</p>
              <div className="flex flex-wrap gap-2">
                {editModel?.name && editModel.name !== "Non classé" && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      onClick={() => setImageUrl(`https://img.coomer.st/icons/onlyfans/${editModel.name}`)}
                    >
                      OnlyFans
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      onClick={() => setImageUrl(`https://img.coomer.st/icons/fansly/${editModel.name}`)}
                    >
                      Fansly
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Remove image */}
            {editModel?.profile?.profile_image_url && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!editModel?.profile) return;
                  await supabase
                    .from("models")
                    .update({ profile_image_url: null } as any)
                    .eq("id", editModel.profile.id);
                  setModelProfiles((prev) =>
                    prev.map((p) => (p.id === editModel.profile!.id ? { ...p, profile_image_url: null } : p)),
                  );
                  setEditModel(null);
                  setImageUrl("");
                  toast({ title: "Photo supprimée" });
                }}
              >
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