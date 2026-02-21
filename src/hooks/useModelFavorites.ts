import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useModelFavorites = () => {
  const { user } = useAuth();
  const [favoriteModelIds, setFavoriteModelIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setFavoriteModelIds(new Set()); return; }
    supabase
      .from("model_favorites")
      .select("model_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) setFavoriteModelIds(new Set(data.map((f: any) => f.model_id)));
      });
  }, [user]);

  const toggleModelFavorite = useCallback(async (modelId: string) => {
    if (!user) return;
    const isFav = favoriteModelIds.has(modelId);

    // Optimistic update
    setFavoriteModelIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(modelId); else next.add(modelId);
      return next;
    });

    if (isFav) {
      const { error } = await supabase
        .from("model_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("model_id", modelId);
      if (error) setFavoriteModelIds((prev) => new Set(prev).add(modelId));
    } else {
      const { error } = await supabase
        .from("model_favorites")
        .insert({ user_id: user.id, model_id: modelId });
      if (error) {
        setFavoriteModelIds((prev) => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
      }
    }
  }, [user, favoriteModelIds]);

  const isModelFavorite = useCallback((modelId: string) => favoriteModelIds.has(modelId), [favoriteModelIds]);

  return { favoriteModelIds, toggleModelFavorite, isModelFavorite };
};
