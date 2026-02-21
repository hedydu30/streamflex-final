import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import ContinueWatchingRow from "@/components/ContinueWatchingRow";
import RecommendationsRow from "@/components/RecommendationsRow";
import Footer from "@/components/Footer";
import PaginationBar from "@/components/PaginationBar";
import VideoCardPreview from "@/components/VideoCardPreview";
import HeroVideoMix from "@/components/HeroVideoMix";
import { useAuth } from "@/contexts/AuthContext";
import { useImportedVideos, useImportedVideosProgress } from "@/hooks/useImportedVideos";
import { useModels } from "@/hooks/useModels";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useRecommendations } from "@/hooks/useRecommendations";
import { usePagination } from "@/hooks/usePagination";
import { useSiteSettings, gridColsClass, DEFAULT_CMS } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Play, Film, Heart, Crown } from "lucide-react";
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

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
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

const ITEMS_PER_PAGE = 20; // home grid

const HomeVideoCard = ({
  video,
  modelName,
  modelImage,
  liked,
  percent,
  onToggleFavorite,
}: {
  video: any;
  modelName?: string;
  modelImage?: string;
  liked: boolean;
  percent: number;
  onToggleFavorite?: () => void;
}) => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const palette = GRADIENT_PALETTES[hashStr(video.id) % GRADIENT_PALETTES.length];
  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
  const thumbSrc = !imgError ? video.thumbnail_url || modelImage : null;

  return (
    <div
      className="group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/video/${video.id}`)}
    >
      <div
        className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          !thumbSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60",
        )}
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex items-center justify-center bg-gradient-to-br p-3",
              palette.from,
              palette.to,
            )}
          >
            <span
              className={cn("text-3xl font-bold tracking-wider", palette.text)}
              style={{ textShadow: "0 0 15px currentColor" }}
            >
              {titleAbbrev}
            </span>
          </div>
        )}

        <VideoCardPreview
          videoId={video.id}
          isHovered={hovered}
          onTimeUpdate={setPreviewTime}
          fallbackUrl={video.original_url}
        />

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

        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20",
            hovered ? "opacity-100" : "opacity-0",
          )}
        />

        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none",
            hovered ? "opacity-100" : "opacity-0",
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/watch?v=${video.id}`);
            }}
            className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30 pointer-events-auto"
          >
            <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
          </button>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.();
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

        {video.source === "1fichier" && (
          <div className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
            <Crown size={12} className="text-yellow-400" />
          </div>
        )}

        {percent > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
            <div
              className={cn("h-full transition-all", percent >= 95 ? "bg-primary/70 w-full" : "bg-primary")}
              style={percent < 95 ? { width: `${percent}%` } : undefined}
            />
          </div>
        )}
      </div>

      <div className="mt-2 space-y-0.5">
        <p className="text-foreground text-sm font-medium truncate leading-tight">
          {video.title?.replace(/\.[^/.]+$/, "")}
        </p>
        {modelName && <p className="text-xs text-muted-foreground truncate">{modelName}</p>}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          {video.format && <span className="uppercase">{video.format}</span>}
          {video.format && video.file_size && <span>•</span>}
          {video.file_size && <span>{(video.file_size / 1024 / 1024).toFixed(0)} Mo</span>}
        </div>
      </div>
    </div>
  );
};

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: allVideos = [], isLoading, isFetching, refetch } = useImportedVideos();
  const loadingProgress = useImportedVideosProgress();
  const isStillLoading = isFetching && !loadingProgress.done;
  const { models, modelImages, modelNames } = useModels();
  const { favoriteIds, toggleFavorite } = useVideoFavorites();
  const { progressMap } = useVideoProgress();
  const { recommendations, hasEnoughData } = useRecommendations(allVideos);
  const [continueWatching, setContinueWatching] = useState<any[]>([]);

  // Continue watching – uses video_progress table (last 10 watched, not completed)
  useEffect(() => {
    if (!user) {
      setContinueWatching([]);
      return;
    }
    supabase
      .from("video_progress")
      .select("video_id, position_seconds, duration_seconds, watched_percent, updated_at")
      .eq("user_id", user.id)
      .eq("completed", false)
      .order("updated_at", { ascending: false })
      .limit(10)
      .then(async ({ data: progressData }) => {
        if (!progressData || progressData.length === 0) {
          setContinueWatching([]);
          return;
        }
        const videoIds = progressData.map((p) => p.video_id);
        const { data: videos } = await supabase
          .from("imported_videos")
          .select("id, title, thumbnail_url, thumbnail_hover_url, original_url")
          .in("id", videoIds)
          .eq("is_active", true);
        if (!videos) {
          setContinueWatching([]);
          return;
        }
        const videoMap = new Map(videos.map((v) => [v.id, v]));
        const merged = progressData
          .filter((p) => videoMap.has(p.video_id))
          .map((p) => {
            const v = videoMap.get(p.video_id)!;
            return {
              id: v.id,
              title: v.title,
              thumbnail_url: v.thumbnail_url,
              thumbnail_hover_url: v.thumbnail_hover_url,
              original_url: v.original_url,
              position_seconds: p.position_seconds,
              duration_seconds: p.duration_seconds || 0,
              watched_percent: p.watched_percent || 0,
            };
          });
        setContinueWatching(merged);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // No auto-refresh interval — data is cached and only reloaded on navigation or manual refresh

  // Sort all videos by date (newest first) and apply search
  const filtered = useMemo(() => {
    let result = [...allVideos].sort(
      (a: any, b: any) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime(),
    );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (v: any) =>
          v.title?.toLowerCase().includes(q) || (v.model_id && modelNames.get(v.model_id)?.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [allVideos, searchQuery, modelNames]);

  // CMS settings — fallback sur defaults si settings pas encore chargés
  const siteSettings = useSiteSettings();
  const cms = siteSettings?.cms ?? DEFAULT_CMS;
  const gridClass = gridColsClass(cms);
  const itemsPerPage = cms.items_per_page || ITEMS_PER_PAGE;

  const pagination = usePagination(filtered, { pageSize: itemsPerPage, storageKey: "home" });

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={setSearchQuery} />

      {/* Hero Video Mix - random 15s clips */}
      {allVideos.length > 0 && !isLoading && <HeroVideoMix videos={allVideos} modelNames={modelNames} />}

      {/* Loading progress bar - fixed left side below navbar */}
      {isStillLoading && (
        <div className="fixed left-4 top-16 z-50 flex items-center gap-2 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50 shadow-lg">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div className="w-24">
            <Progress value={loadingProgress.percent} className="h-1" />
          </div>
          <span className="text-[10px] text-primary font-semibold shrink-0 tabular-nums">
            {loadingProgress.percent}%
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {loadingProgress.loaded}
            {loadingProgress.total ? ` / ${loadingProgress.total}` : ""}
          </span>
        </div>
      )}

      <div className={searchQuery ? "pt-24" : "-mt-12 relative z-10"}>
        {/* Continue watching – always visible */}
        {continueWatching.length > 0 && <ContinueWatchingRow videos={continueWatching} />}

        {/* Recommendations row */}
        {user && hasEnoughData && recommendations.length > 0 && (
          <RecommendationsRow
            videos={recommendations}
            modelNames={modelNames}
            favoriteIds={favoriteIds}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {/* Paginated grid */}
        <main className="px-4 md:px-12 pb-12">
          {filtered.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {searchQuery ? `Résultats pour "${searchQuery}"` : "🆕 Toutes les vidéos"}
              </h2>
              <span className="text-sm text-muted-foreground">
                {filtered.length} vidéo{filtered.length > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {filtered.length > 0 ? (
            <>
              <div className={`grid gap-4 ${gridClass}`}>
                {pagination.paginatedItems.map((video: any) => {
                  const progress = progressMap.get(video.id);
                  const percent = progress?.watched_percent || 0;
                  const liked = favoriteIds.has(video.id);
                  const modelName = video.model_id ? modelNames.get(video.model_id) : undefined;
                  const modelImage = video.model_id ? modelImages.get(video.model_id) : undefined;

                  return (
                    <HomeVideoCard
                      key={video.id}
                      video={video}
                      modelName={modelName}
                      modelImage={modelImage}
                      liked={liked}
                      percent={percent}
                      onToggleFavorite={() => toggleFavorite(video.id)}
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
          ) : !isLoading && !isFetching ? (
            <div className="text-center py-20">
              <Film size={48} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-lg">
                {searchQuery
                  ? `Aucun résultat pour "${searchQuery}"`
                  : "Aucune vidéo importée. Rendez-vous sur la page Import pour commencer !"}
              </p>
            </div>
          ) : !filtered.length && isLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-sm text-muted-foreground">Chargement en cours…</span>
            </div>
          ) : null}
        </main>
      </div>

      <Footer />
    </div>
  );
};

export default Index;
