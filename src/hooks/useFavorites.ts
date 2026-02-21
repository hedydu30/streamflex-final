import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export const useFavorites = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("favorites")
      .select("movie_id")
      .eq("user_id", user.id);

    if (!error && data) {
      setFavoriteIds(new Set(data.map((f: any) => f.movie_id)));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const toggleFavorite = async (movieId: number) => {
    if (!user) {
      toast({ title: "Connexion requise", description: "Connectez-vous pour ajouter des favoris.", variant: "destructive" });
      return;
    }

    const isFav = favoriteIds.has(movieId);

    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(movieId);
      else next.add(movieId);
      return next;
    });

    if (isFav) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("movie_id", movieId);
      if (error) {
        setFavoriteIds((prev) => new Set(prev).add(movieId));
        toast({ title: "Erreur", description: "Impossible de retirer le favori.", variant: "destructive" });
      }
    } else {
      const { error } = await supabase
        .from("favorites")
        .insert({ user_id: user.id, movie_id: movieId });
      if (error) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(movieId);
          return next;
        });
        toast({ title: "Erreur", description: "Impossible d'ajouter le favori.", variant: "destructive" });
      }
    }
  };

  const isFavorite = (movieId: number) => favoriteIds.has(movieId);

  return { favoriteIds, loading, toggleFavorite, isFavorite };
};
