import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface VideoProgressEntry {
  video_id: string;
  position_seconds: number;
  duration_seconds: number | null;
  watched_percent: number;
  completed: boolean;
  updated_at: string;
}

export const useVideoProgress = () => {
  const { user } = useAuth();
  const [progressMap, setProgressMap] = useState<Map<string, VideoProgressEntry>>(new Map());

  useEffect(() => {
    if (!user) { setProgressMap(new Map()); return; }
    supabase
      .from("video_progress")
      .select("video_id, position_seconds, duration_seconds, watched_percent, completed, updated_at")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          const map = new Map<string, VideoProgressEntry>();
          data.forEach((d: any) => map.set(d.video_id, d));
          setProgressMap(map);
        }
      });
  }, [user]);

  const saveProgress = useCallback(async (videoId: string, position: number, duration: number) => {
    if (!user || duration === 0) return;
    const percent = Math.round((position / duration) * 100);
    const completed = percent >= 95;

    // Update local map
    setProgressMap((prev) => {
      const next = new Map(prev);
      next.set(videoId, {
        video_id: videoId,
        position_seconds: Math.floor(position),
        duration_seconds: Math.floor(duration),
        watched_percent: percent,
        completed,
        updated_at: new Date().toISOString(),
      });
      return next;
    });

    await supabase.from("video_progress").upsert(
      {
        user_id: user.id,
        video_id: videoId,
        position_seconds: Math.floor(position),
        duration_seconds: Math.floor(duration),
        watched_percent: percent,
        completed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,video_id" }
    );
  }, [user]);

  const getProgress = useCallback((videoId: string) => progressMap.get(videoId), [progressMap]);

  return { progressMap, saveProgress, getProgress };
};
