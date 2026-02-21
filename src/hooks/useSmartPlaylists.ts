import { useMemo } from "react";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useModelFavorites } from "@/hooks/useModelFavorites";

export interface SmartPlaylist {
  id: string;
  title: string;
  icon: string;
  description: string;
  videos: any[];
}

export const useSmartPlaylists = (allVideos: any[], modelNames: Map<string, string>) => {
  const { progressMap } = useVideoProgress();
  const { favoriteIds } = useVideoFavorites();
  const { favoriteModelIds } = useModelFavorites();

  return useMemo(() => {
    if (allVideos.length === 0) return [];

    const completedIds = new Set(
      Array.from(progressMap.values())
        .filter((e) => e.completed)
        .map((e) => e.video_id)
    );

    const inProgressEntries = Array.from(progressMap.values())
      .filter((e) => !e.completed && e.position_seconds > 0);
    const inProgressIds = new Set(inProgressEntries.map((e) => e.video_id));

    const playlists: SmartPlaylist[] = [];

    // 1. Non vues — videos never started
    const unwatched = allVideos.filter(
      (v) => !completedIds.has(v.id) && !inProgressIds.has(v.id)
    );
    if (unwatched.length > 0) {
      playlists.push({
        id: "unwatched",
        title: "Non vues",
        icon: "👁️",
        description: `${unwatched.length} vidéo${unwatched.length > 1 ? "s" : ""} jamais regardée${unwatched.length > 1 ? "s" : ""}`,
        videos: unwatched.slice(0, 50),
      });
    }

    // 2. Les plus longues
    const byDuration = [...allVideos]
      .filter((v) => v.duration_seconds && v.duration_seconds > 0)
      .sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0));
    if (byDuration.length > 0) {
      playlists.push({
        id: "longest",
        title: "Les plus longues",
        icon: "⏱️",
        description: "Triées par durée décroissante",
        videos: byDuration.slice(0, 50),
      });
    }

    // 3. Récemment ajoutées
    const recent = [...allVideos]
      .sort((a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime());
    if (recent.length > 0) {
      playlists.push({
        id: "recent",
        title: "Récemment ajoutées",
        icon: "🆕",
        description: "Les dernières importations",
        videos: recent.slice(0, 50),
      });
    }

    // 4. Mes favoris
    const favVideos = allVideos.filter((v) => favoriteIds.has(v.id));
    if (favVideos.length > 0) {
      playlists.push({
        id: "favorites",
        title: "Mes favoris",
        icon: "❤️",
        description: `${favVideos.length} vidéo${favVideos.length > 1 ? "s" : ""} en favoris`,
        videos: favVideos,
      });
    }

    // 5. Presque terminées (in progress, >50%)
    const almostDone = inProgressEntries
      .filter((e) => (e.watched_percent || 0) >= 50)
      .sort((a, b) => (b.watched_percent || 0) - (a.watched_percent || 0))
      .map((e) => allVideos.find((v) => v.id === e.video_id))
      .filter(Boolean);
    if (almostDone.length > 0) {
      playlists.push({
        id: "almost-done",
        title: "Presque terminées",
        icon: "⏩",
        description: "Plus de 50% visionnées",
        videos: almostDone,
      });
    }

    // 6. Par modèle favori — one playlist per favorite model
    for (const modelId of favoriteModelIds) {
      const name = modelNames.get(modelId);
      if (!name) continue;
      const modelVideos = allVideos.filter((v) => v.model_id === modelId);
      if (modelVideos.length === 0) continue;
      playlists.push({
        id: `model-${modelId}`,
        title: name,
        icon: "⭐",
        description: `${modelVideos.length} vidéo${modelVideos.length > 1 ? "s" : ""} de ${name}`,
        videos: modelVideos.sort(
          (a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime()
        ),
      });
    }

    // 7. Courtes (<5min)
    const short = allVideos
      .filter((v) => v.duration_seconds && v.duration_seconds > 0 && v.duration_seconds < 300)
      .sort((a, b) => (a.duration_seconds || 0) - (b.duration_seconds || 0));
    if (short.length > 0) {
      playlists.push({
        id: "short",
        title: "Courtes (< 5 min)",
        icon: "⚡",
        description: `${short.length} vidéo${short.length > 1 ? "s" : ""} de moins de 5 minutes`,
        videos: short.slice(0, 50),
      });
    }

    // 8. Déjà vues (completed)
    const watched = Array.from(progressMap.values())
      .filter((e) => e.completed)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .map((e) => allVideos.find((v) => v.id === e.video_id))
      .filter(Boolean);
    if (watched.length > 0) {
      playlists.push({
        id: "watched",
        title: "Déjà vues",
        icon: "✅",
        description: `${watched.length} vidéo${watched.length > 1 ? "s" : ""} terminée${watched.length > 1 ? "s" : ""}`,
        videos: watched,
      });
    }

    return playlists;
  }, [allVideos, progressMap, favoriteIds, favoriteModelIds, modelNames]);
};
