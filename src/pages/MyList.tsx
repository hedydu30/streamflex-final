import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useModelFavorites } from "@/hooks/useModelFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useModels } from "@/hooks/useModels";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Film, Heart, Eye, Clock, Play, Crown, Trash2, RotateCcw, User, Shuffle } from "lucide-react";
import VideoCardPreview from "@/components/VideoCardPreview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Reuse exact same gradient palettes and hash from Videos page
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

function formatDuration(s: number | null): string {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Same card as Videos page
const FavVideoCard = ({ video, onRemove, onNavigate, modelName, modelImage }: {
  video: any; onRemove: () => void; onNavigate: () => void;
  modelName?: string; modelImage?: string;
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
      <div onClick={onNavigate}>
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
              {formatDuration(previewTime)}
            </div>
          )}

          <div className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20",
            hovered ? "opacity-100" : "opacity-0"
          )} />

          <div className={cn(
            "absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none",
            hovered ? "opacity-100" : "opacity-0"
          )}>
            <div className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30 pointer-events-auto">
              <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
            </div>
          </div>

          <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-red-500 opacity-100">
            <Heart size={14} fill="currentColor" />
          </button>

          {video.source === "1fichier" && (
            <div className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
              <Crown size={12} className="text-yellow-400" />
            </div>
          )}

          {video.duration_seconds && !hovered && (
            <div className="absolute bottom-2 right-2 z-30 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-black/80 text-foreground/90 tabular-nums">
              {formatDuration(video.duration_seconds)}
            </div>
          )}
        </div>

        <div className="mt-2 space-y-0.5">
          <div className="flex items-start gap-2">
            {modelImage && !imgError ? (
              <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full overflow-hidden ring-1 ring-border">
                <img src={modelImage} alt={modelName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            ) : modelName && modelName !== "Non classé" ? (
              <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold ring-1 ring-primary/30">
                {modelName.charAt(0).toUpperCase()}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium truncate leading-tight">{video.title?.replace(/\.[^/.]+$/, "")}</p>
              {modelName && modelName !== "Non classé" && (
                <p className="text-xs text-muted-foreground truncate">{modelName}</p>
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mt-0.5">
                {video.format && <span className="uppercase">{video.format}</span>}
                {video.format && video.file_size && <span>•</span>}
                {video.file_size && <span>{(video.file_size / 1024 / 1024).toFixed(0)} Mo</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MyList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { favoriteIds: videoFavIds, toggleFavorite: toggleVideoFav } = useVideoFavorites();
  const { favoriteModelIds, toggleModelFavorite, isModelFavorite } = useModelFavorites();
  const { modelImages, modelNames, models: modelsList } = useModels();
  const { progressMap } = useVideoProgress();

  // Charger les favoris directement depuis Supabase — pas besoin de charger 430k vidéos
  const { data: favVideos = [], isLoading: videosLoading } = useQuery({
    queryKey: ["fav-videos", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("imported_videos")
        .select("id,title,thumbnail_url,model_id,source,format,file_size,duration_seconds,imported_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("id", Array.from(videoFavIds).slice(0, 1000));
      return data || [];
    },
    enabled: !!user && videoFavIds.size > 0,
    staleTime: 5 * 60 * 1000,
  });

  // allVideos vide — plus nécessaire pour Ma Liste
  const allVideos: any[] = [];

  // Favorite models
  const favModels = useMemo(() => {
    return (modelsList || []).filter((m: any) => favoriteModelIds.has(m.id));
  }, [modelsList, favoriteModelIds]);

  // Count videos per favorite model — basé sur les modèles chargés
  const modelVideoCounts = useMemo(() => new Map<string, number>(), []);

  // Watched videos: any video with progress > 0
  const watchedVideos = useMemo(() => {
    const entries: any[] = [];
    progressMap.forEach((p, videoId) => {
      const video = allVideos.find((v: any) => v.id === videoId);
      if (video && p.position_seconds > 0) {
        entries.push({ ...video, progress: p });
      }
    });
    entries.sort((a, b) => new Date(b.progress.updated_at).getTime() - new Date(a.progress.updated_at).getTime());
    return entries;
  }, [allVideos, progressMap]);

  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  const formatTime = (s: number | null) => {
    if (!s) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " +
      date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />

      <div className="pt-24 px-4 md:px-12 pb-12">
        <h1 className="text-3xl md:text-4xl font-display text-foreground tracking-wider mb-2">
          Ma Liste
        </h1>

        <Tabs defaultValue="videos" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="videos" className="gap-1.5">
              <Heart size={14} /> Favoris ({favVideos.length})
            </TabsTrigger>
            <TabsTrigger value="watched" className="gap-1.5">
              <Eye size={14} /> Vu ({watchedVideos.length})
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-1.5">
              <User size={14} /> Modèles ({favModels.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos">
            {videosLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : favVideos.length === 0 ? (
              <div className="text-center py-20">
                <Heart size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground text-lg mb-2">Aucune vidéo favorite</p>
                <p className="text-sm text-muted-foreground">
                  Ajoutez des vidéos en cliquant sur le ♥ des jaquettes.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {favVideos.map((video: any) => (
                  <FavVideoCard
                    key={video.id}
                    video={video}
                    onRemove={() => toggleVideoFav(video.id)}
                    onNavigate={() => navigate(`/video/${video.id}`)}
                    modelName={video.model_id ? modelNames.get(video.model_id) : undefined}
                    modelImage={video.model_id ? modelImages.get(video.model_id) : undefined}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="watched">
            <p className="text-sm text-muted-foreground mb-4 italic">{watchedVideos.length} vidéo{watchedVideos.length > 1 ? "s" : ""} visionnée{watchedVideos.length > 1 ? "s" : ""}</p>
            {videosLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : watchedVideos.length === 0 ? (
              <div className="text-center py-20">
                <Eye size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground text-lg mb-2">Aucune vidéo visionnée</p>
              </div>
            ) : (
              <div className="space-y-3">
                {watchedVideos.map((video: any) => {
                  const p = video.progress as any;
                  const palette = GRADIENT_PALETTES[hashString(video.id) % GRADIENT_PALETTES.length];
                  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
                  const isCompleted = p.watched_percent >= 95;
                  const modelName = video.model_id ? modelNames.get(video.model_id) : undefined;

                  return (
                    <div
                      key={video.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/watch?v=${video.id}`)}
                    >
                      {/* Thumbnail */}
                      <div className="relative shrink-0 w-[80px] sm:w-[120px] aspect-[2/3] rounded-lg overflow-hidden">
                        {video.thumbnail_url ? (
                          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className={cn("w-full h-full flex flex-col items-center justify-center bg-gradient-to-br", palette.from, palette.to)}>
                            <span className={cn("text-2xl font-bold tracking-wider", palette.text)} style={{ textShadow: '0 0 15px currentColor' }}>{titleAbbrev}</span>
                            {modelName && <span className="text-[9px] text-foreground/50 mt-1 truncate max-w-full px-1">{modelName}</span>}
                          </div>
                        )}
                        {isCompleted && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-semibold truncate">{video.title?.replace(/\.[^/.]+$/, "")}</p>
                        {modelName && <p className="text-muted-foreground text-sm truncate">{modelName}</p>}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <Clock size={12} />
                          <span>{formatTime(p.position_seconds)} / {formatTime(p.duration_seconds)}</span>
                          <span className={cn("font-bold", p.watched_percent >= 95 ? "text-primary" : "text-primary")}>{p.watched_percent}%</span>
                          <span>{formatDate(p.updated_at)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 bg-gradient-to-r from-primary/80 to-accent/80 border-primary/50 text-primary-foreground hover:from-primary hover:to-accent"
                          onClick={(e) => { e.stopPropagation(); navigate(`/watch?v=${video.id}`); }}
                        >
                          <RotateCcw size={14} />
                          {isCompleted ? "Revoir" : "Reprendre"}
                        </Button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleVideoFav(video.id); }}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="models">
            {favModels.length === 0 ? (
              <div className="text-center py-20">
                <User size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground text-lg mb-2">Aucun modèle favori</p>
                <p className="text-sm text-muted-foreground">
                  Ajoutez des modèles en cliquant sur le ♥ sur la page Modèles.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => navigate("/models")}>
                  Parcourir les modèles
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {favModels.map((model: any) => {
                  const videoCount = modelVideoCounts.get(model.id) || 0;
                  const palette = GRADIENT_PALETTES[hashString(model.id) % GRADIENT_PALETTES.length];
                  const nameAbbrev = (model.name || "M").substring(0, 2).toUpperCase();
                  const imgSrc = model.profile_image_url;

                  return (
                    <div key={model.id} className="group cursor-pointer" onClick={() => navigate(`/models?select=${encodeURIComponent(model.name)}`)}>
                      <div className={cn(
                        "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
                        "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
                        !imgSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60"
                      )}>
                        {imgSrc ? (
                          <img src={imgSrc} alt={model.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                        ) : (
                          <div className={cn("w-full h-full flex flex-col items-center justify-center bg-gradient-to-br p-4", palette.from, palette.to)}>
                            <span className={cn("text-4xl md:text-5xl font-bold tracking-wider", palette.text)} style={{ textShadow: '0 0 20px currentColor' }}>
                              {nameAbbrev}
                            </span>
                          </div>
                        )}

                        {/* Remove favorite */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleModelFavorite(model.id); }}
                          className="absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-red-500"
                        >
                          <Heart size={14} fill="currentColor" />
                        </button>

                        {/* Mix button */}
                        {videoCount >= 2 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const modelVideos = allVideos.filter((v: any) => v.model_id === model.id);
                              const shuffled = [...modelVideos].sort(() => Math.random() - 0.5);
                              const mixIds = shuffled.slice(0, 50).map((v: any) => v.id);
                              navigate(`/watch?mix=${encodeURIComponent(JSON.stringify(mixIds))}`);
                            }}
                            className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm text-foreground/80 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Shuffle size={14} />
                          </button>
                        )}

                        {/* Gradient overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                        {/* Info */}
                        <div className="absolute bottom-0 inset-x-0 p-3 z-20">
                          <p className="text-foreground text-sm font-semibold truncate">{model.name}</p>
                          <p className="text-foreground/70 text-xs">{videoCount} vidéo{videoCount > 1 ? "s" : ""}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
};

export default MyList;