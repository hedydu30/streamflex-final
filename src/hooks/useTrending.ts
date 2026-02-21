/**
 * useTrending — v2
 * ─────────────────────────────────────────────────────────────
 * Primary: reads from mv_trending_weekly materialized view
 *          (pre-computed, instant, 200 rows max)
 * Fallback: client-side score from activity_logs
 *           (used when MV is empty or not yet populated)
 *
 * Caching: React Query, 10-min stale time
 *          (trending data doesn't need to be real-time)
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface TrendingVideo {
  video_id: string;
  score: number;
  rank: number;
}

export function useTrending(allVideos: any[], limit = 10) {
  const { user } = useAuth();

  // ── 1. Try materialized view (fast, server-computed) ────────
  const { data: mvData } = useQuery({
    queryKey: ["trending-mv"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vw_trending_weekly" as any)
        .select("video_id, trend_score")
        .order("trend_score", { ascending: false })
        .limit(limit);
      return (data || []) as unknown as { video_id: string; trend_score: number }[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: true,
  });

  // ── 2. Fallback: client-side from activity_logs ─────────────
  const { data: activityData } = useQuery({
    queryKey: ["trending-activity", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
      const { data } = await supabase
        .from("activity_logs")
        .select("resource_id, event_type, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .limit(500);
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!user,
  });

  // ── Build trending list ─────────────────────────────────────
  const trending = useMemo<TrendingVideo[]>(() => {
    if (allVideos.length === 0) return [];

    // Prefer MV data if it has results
    if (mvData && mvData.length > 0) {
      return mvData
        .filter(row => allVideos.some(v => v.id === row.video_id))
        .slice(0, limit)
        .map((row, i) => ({ video_id: row.video_id, score: row.trend_score, rank: i + 1 }));
    }

    // Client-side fallback
    const scores = new Map<string, number>();
    for (const log of (activityData || [])) {
      if (!log.resource_id) continue;
      const pts =
        log.event_type === "play"  ? 2 :
        log.event_type === "end"   ? 3 :
        log.event_type === "like"  ? 2 :
        log.event_type === "seek"  ? 0.5 : 1;
      scores.set(log.resource_id, (scores.get(log.resource_id) || 0) + pts);
    }

    return allVideos
      .map(v => ({ video_id: v.id, score: scores.get(v.id) || 0, rank: 0 }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x, i) => ({ ...x, rank: i + 1 }));
  }, [allVideos, mvData, activityData, limit]);

  const trendingVideos = useMemo(() =>
    trending
      .map(t => {
        const v = allVideos.find(v => v.id === t.video_id);
        return v ? { ...v, _trendingScore: t.score, _trendingRank: t.rank } : null;
      })
      .filter(Boolean),
    [trending, allVideos]
  );

  return { trendingVideos, trending };
}
