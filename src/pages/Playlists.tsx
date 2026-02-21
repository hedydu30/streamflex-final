import { useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VideoCardPreview from "@/components/VideoCardPreview";
import { useAuth } from "@/contexts/AuthContext";
import { useImportedVideos } from "@/hooks/useImportedVideos";
import { useModels } from "@/hooks/useModels";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useSmartPlaylists, SmartPlaylist } from "@/hooks/useSmartPlaylists";
import { Play, Heart, Crown, ChevronLeft, ChevronRight, ListMusic, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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

const PLAYLIST_COLORS: Record<string, string> = {
  unwatched: "from-blue-600 to-cyan-500",
  longest: "from-orange-600 to-amber-500",
  recent: "from-green-600 to-emerald-500",
  favorites: "from-rose-600 to-pink-500",
  "almost-done": "from-purple-600 to-violet-500",
  short: "from-yellow-500 to-orange-400",
  watched: "from-slate-600 to-gray-500",
};

const PlaylistCard = ({ playlist, onClick }: { playlist: SmartPlaylist; onClick: () => void }) => {
  const colorClass = PLAYLIST_COLORS[playlist.id] || "from-primary to-primary/60";
  const thumbs = playlist.videos.slice(0, 4);

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl overflow-hidden transition-all hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/10 bg-card border border-border/50"
    >
      {/* Mosaic thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
          {[0, 1, 2, 3].map((i) => {
            const v = thumbs[i];
            if (!v) return <div key={i} className={cn("bg-gradient-to-br", colorClass)} />;
            const palette = GRADIENT_PALETTES[hashStr(v.id) % GRADIENT_PALETTES.length];
            return v.thumbnail_url ? (
              <img key={i} src={v.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div key={i} className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", palette.from, palette.to)}>
                <span className={cn("text-xs font-bold", palette.text)}>{(v.title || "V").substring(0, 2).toUpperCase()}</span>
              </div>
            );
          })}
        </div>
        {/* Overlay gradient */}
        <div className={cn("absolute inset-0 bg-gradient-to-t opacity-60", colorClass)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl">{playlist.icon}</span>
        </div>
        {/* Count badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-foreground text-[11px] font-semibold px-2 py-0.5 rounded-full">
          {playlist.videos.length} vidéo{playlist.videos.length > 1 ? "s" : ""}
        </div>
      </div>
      <div className="p-3">
        <h3 className="text-foreground font-semibold text-sm truncate group-hover:text-primary transition-colors">{playlist.title}</h3>
        <p className="text-muted-foreground text-xs mt-0.5 truncate">{playlist.description}</p>
      </div>
    </button>
  );
};

const PlaylistDetailView = ({
  playlist,
  modelNames,
  modelImages,
  favoriteIds,
  progressMap,
  onToggleFavorite,
  onBack,
}: {
  playlist: SmartPlaylist;
  modelNames: Map<string, string>;
  modelImages: Map<string, string>;
  favoriteIds: Set<string>;
  progressMap: Map<string, any>;
  onToggleFavorite: (id: string) => void;
  onBack: () => void;
}) => {
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft size={18} />
        <span className="text-sm">Retour aux playlists</span>
      </button>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">{playlist.icon}</span>
        <div>
          <h2 className="text-xl font-bold text-foreground">{playlist.title}</h2>
          <p className="text-sm text-muted-foreground">{playlist.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {playlist.videos.map((video: any) => {
          const progress = progressMap.get(video.id);
          const percent = progress?.watched_percent || 0;
          const liked = favoriteIds.has(video.id);
          const modelName = video.model_id ? modelNames.get(video.model_id) : undefined;
          const palette = GRADIENT_PALETTES[hashStr(video.id) % GRADIENT_PALETTES.length];
          const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();
          const thumbSrc = video.thumbnail_url;

          return (
            <div
              key={video.id}
              className="group cursor-pointer"
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
                    <span className={cn("text-3xl font-bold tracking-wider", palette.text)} style={{ textShadow: '0 0 15px currentColor' }}>{titleAbbrev}</span>
                  </div>
                )}

                {video.duration_seconds && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
                    {formatDuration(video.duration_seconds)}
                  </div>
                )}

                <div className={cn("absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 z-20 opacity-0 group-hover:opacity-100")} />

                <div className="absolute inset-0 flex items-center justify-center z-40 transition-opacity duration-300 pointer-events-none opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/watch?v=${video.id}`); }}
                    className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-primary/30 pointer-events-auto"
                  >
                    <Play size={20} fill="currentColor" className="text-primary-foreground ml-0.5" />
                  </button>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(video.id); }}
                  className={cn(
                    "absolute top-2 left-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm transition-all",
                    liked ? "text-red-500 opacity-100" : "text-foreground/70 hover:text-red-400 opacity-0 group-hover:opacity-100"
                  )}
                >
                  <Heart size={14} fill={liked ? "currentColor" : "none"} />
                </button>

                {percent > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-[3px] bg-foreground/10 z-30">
                    <div className={cn("h-full transition-all", percent >= 95 ? "bg-primary/70 w-full" : "bg-primary")} style={percent < 95 ? { width: `${percent}%` } : undefined} />
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-0.5">
                <p className="text-foreground text-sm font-medium truncate leading-tight">{video.title?.replace(/\.[^/.]+$/, "")}</p>
                {modelName && <p className="text-xs text-muted-foreground truncate">{modelName}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Playlists = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<SmartPlaylist | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: allVideos = [], isLoading } = useImportedVideos();
  const { modelNames, modelImages } = useModels();
  const { favoriteIds, toggleFavorite } = useVideoFavorites();
  const { progressMap } = useVideoProgress();
  const playlists = useSmartPlaylists(allVideos, modelNames);

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar onSearch={setSearchQuery} />
        <div className="pt-24 px-4 md:px-12 text-center">
          <ListMusic size={48} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Connectez-vous pour accéder aux playlists intelligentes.</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={setSearchQuery} />

      <div className="pt-24 px-4 md:px-12 pb-12">
        {selectedPlaylist ? (
          <PlaylistDetailView
            playlist={selectedPlaylist}
            modelNames={modelNames}
            modelImages={modelImages}
            favoriteIds={favoriteIds}
            progressMap={progressMap}
            onToggleFavorite={toggleFavorite}
            onBack={() => setSelectedPlaylist(null)}
          />
        ) : (
          <>
            <div className="flex items-center gap-3 mb-8">
              <ListMusic size={28} className="text-primary" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Playlists intelligentes</h1>
                <p className="text-sm text-muted-foreground">Générées automatiquement selon votre activité</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <span className="text-sm text-muted-foreground">Chargement…</span>
              </div>
            ) : playlists.length === 0 ? (
              <div className="text-center py-20">
                <ListMusic size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Aucune playlist disponible. Importez des vidéos pour commencer !</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {playlists.map((pl) => (
                  <PlaylistCard key={pl.id} playlist={pl} onClick={() => setSelectedPlaylist(pl)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Playlists;
