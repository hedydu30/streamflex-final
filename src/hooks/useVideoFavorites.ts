import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useVideoFavorites = () => {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setFavoriteIds(new Set()); return; }
    supabase
      .from("video_favorites")
      .select("video_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) setFavoriteIds(new Set(data.map((f: any) => f.video_id)));
      });
  }, [user]);

  const toggleFavorite = useCallback(async (videoId: string) => {
    if (!user) return;
    const isFav = favoriteIds.has(videoId);

    // Optimistic
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(videoId); else next.add(videoId);
      return next;
    });

    if (isFav) {
      const { error } = await supabase
        .from("video_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("video_id", videoId);
      if (error) setFavoriteIds((prev) => new Set(prev).add(videoId));
    } else {
      const { error } = await supabase
        .from("video_favorites")
        .insert({ user_id: user.id, video_id: videoId });
      if (error) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
      }
    }
  }, [user, favoriteIds]);

  const isFavorite = useCallback((videoId: string) => favoriteIds.has(videoId), [favoriteIds]);

  return { favoriteIds, toggleFavorite, isFavorite };
};
