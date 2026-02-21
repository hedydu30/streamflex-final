import { useMemo } from "react";
import { useVideoProgress, VideoProgressEntry } from "@/hooks/useVideoProgress";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useModelFavorites } from "@/hooks/useModelFavorites";

interface VideoForScoring {
  id: string;
  model_id: string | null;
  duration_seconds: number | null;
  imported_at: string;
  view_count?: number;
  [key: string]: any;
}

export const useRecommendations = (allVideos: VideoForScoring[], limit = 12) => {
  const { progressMap } = useVideoProgress();
  const { favoriteIds } = useVideoFavorites();
  const { favoriteModelIds } = useModelFavorites();

  return useMemo(() => {
    // Need at least 3 watched videos for meaningful recommendations
    const watchedEntries = Array.from(progressMap.values());
    const hasEnoughData = watchedEntries.length >= 3;

    if (!hasEnoughData || allVideos.length === 0) {
      return { recommendations: [] as VideoForScoring[], hasEnoughData };
    }

    // Completed video IDs
    const completedIds = new Set(
      watchedEntries.filter((e) => e.completed).map((e) => e.video_id)
    );

    // In-progress video IDs
    const inProgressIds = new Set(
      watchedEntries.filter((e) => !e.completed && e.position_seconds > 0).map((e) => e.video_id)
    );

    // Top models: count from progress + model favorites
    const modelCounts = new Map<string, number>();
    for (const entry of watchedEntries) {
      const video = allVideos.find((v) => v.id === entry.video_id);
      if (video?.model_id) {
        modelCounts.set(video.model_id, (modelCounts.get(video.model_id) || 0) + 1);
      }
    }
    // Boost favorited models
    for (const modelId of favoriteModelIds) {
      modelCounts.set(modelId, (modelCounts.get(modelId) || 0) + 2);
    }
    const topModelIds = new Set(
      [...modelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id)
    );

    // Average duration of watched videos
    const durations = watchedEntries
      .map((e) => e.duration_seconds)
      .filter((d): d is number => d != null && d > 0);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Score each unwatched video
    const scored = allVideos
      .filter((v) => !completedIds.has(v.id) && !inProgressIds.has(v.id))
      .map((v) => {
        let score = 0;

        // Preferred model
        if (v.model_id && topModelIds.has(v.model_id)) score += 3;

        // Similar duration
        if (avgDuration > 0 && v.duration_seconds) {
          if (v.duration_seconds >= avgDuration * 0.7 && v.duration_seconds <= avgDuration * 1.3) {
            score += 2;
          }
        }

        // In favorites but not watched
        if (favoriteIds.has(v.id)) score += 1;

        // Recently imported
        if (new Date(v.imported_at).getTime() > sevenDaysAgo) score += 0.5;

        return { video: v, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.video.imported_at).getTime() - new Date(a.video.imported_at).getTime();
      })
      .slice(0, limit)
      .map((s) => s.video);

    return { recommendations: scored, hasEnoughData };
  }, [allVideos, progressMap, favoriteIds, favoriteModelIds, limit]);
};
