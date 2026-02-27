import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Progress state for progressive loading UI */
export interface LoadingProgress {
  loaded: number;
  total: number | null;
  percent: number;
  done: boolean;
}

// Module-level progress store so multiple consumers see the same state
const progressListeners = new Set<(p: LoadingProgress) => void>();
let currentProgress: LoadingProgress = { loaded: 0, total: null, percent: 0, done: true };

function notifyProgress(p: LoadingProgress) {
  currentProgress = p;
  progressListeners.forEach((fn) => fn(p));
}

export const useImportedVideosProgress = (): LoadingProgress => {
  const [progress, setProgress] = useState<LoadingProgress>(currentProgress);

  useEffect(() => {
    const listener = (p: LoadingProgress) => setProgress(p);
    progressListeners.add(listener);
    setProgress(currentProgress);
    return () => {
      progressListeners.delete(listener);
    };
  }, []);

  return progress;
};

// BATCH_SIZE augmenté pour réduire le nombre de requêtes (430k vidéos)
const BATCH_SIZE = 5000;
// Nombre de requêtes en parallèle
const PARALLEL = 4;

const COLS = "id,title,original_url,thumbnail_url,model_id,source,format,file_size,duration_seconds,imported_at,is_active,average_rating,category_id";

export const useImportedVideos = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["imported-videos", user?.id ?? "public"];

  return useQuery({
    queryKey,
    queryFn: async () => {
      // 1. Compter le total
      let countQuery = supabase
        .from("imported_videos")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      if (user) countQuery = countQuery.eq("user_id", user.id);
      const { count } = await countQuery;
      const total = count ?? null;
      notifyProgress({ loaded: 0, total, percent: 0, done: false });

      if (!total || total === 0) {
        notifyProgress({ loaded: 0, total: 0, percent: 100, done: true });
        return [];
      }

      // 2. Construire la liste de tous les offsets à charger
      const offsets: number[] = [];
      for (let off = 0; off < total; off += BATCH_SIZE) {
        offsets.push(off);
      }

      // 3. Fetch en parallèle par groupes de PARALLEL
      const all: any[] = new Array(total);
      let loaded = 0;

      const fetchBatch = async (from: number): Promise<any[]> => {
        let q = supabase
          .from("imported_videos")
          .select(COLS)
          .eq("is_active", true)
          .order("imported_at", { ascending: false })
          .range(from, from + BATCH_SIZE - 1);
        if (user) q = q.eq("user_id", user.id);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      };

      // Traiter les offsets par groupes de PARALLEL
      for (let i = 0; i < offsets.length; i += PARALLEL) {
        const group = offsets.slice(i, i + PARALLEL);
        const results = await Promise.all(group.map(fetchBatch));
        for (let j = 0; j < results.length; j++) {
          const off = group[j];
          const rows = results[j];
          for (let k = 0; k < rows.length; k++) {
            all[off + k] = rows[k];
          }
          loaded += rows.length;
        }
        const pct = Math.min(100, Math.round((loaded / total) * 100));
        notifyProgress({ loaded, total, percent: pct, done: false });
        // Mise à jour progressive du cache
        queryClient.setQueryData(queryKey, all.filter(Boolean));
      }

      const final = all.filter(Boolean);
      notifyProgress({ loaded: final.length, total: final.length, percent: 100, done: true });
      return final;
    },
    enabled: true,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
};