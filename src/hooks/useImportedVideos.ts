import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface LoadingProgress {
  loaded: number;
  total: number | null;
  percent: number;
  done: boolean;
}

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
    return () => { progressListeners.delete(listener); };
  }, []);
  return progress;
};

const BATCH = 1000;
const COLS = "id,title,original_url,thumbnail_url,model_id,source,format,file_size,duration_seconds,imported_at,is_active,average_rating,category_id";

export const useImportedVideos = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["imported-videos", user?.id ?? "public"];

  return useQuery({
    queryKey,
    queryFn: async () => {
      // Count
      let countQ = supabase.from("imported_videos").select("*", { count: "exact", head: true }).eq("is_active", true);
      if (user) countQ = countQ.eq("user_id", user.id);
      const { count } = await countQ;
      const total = count ?? 0;
      notifyProgress({ loaded: 0, total, percent: 0, done: false });

      if (total === 0) {
        notifyProgress({ loaded: 0, total: 0, percent: 100, done: true });
        return [];
      }

      const all: any[] = [];
      let from = 0;

      while (from < total) {
        // 5 requêtes en parallèle de 1000 chacune
        const batch = [];
        for (let i = 0; i < 5 && from + i * BATCH < total; i++) {
          const start = from + i * BATCH;
          let q = supabase
            .from("imported_videos")
            .select(COLS)
            .eq("is_active", true)
            .order("imported_at", { ascending: false })
            .range(start, start + BATCH - 1);
          if (user) q = q.eq("user_id", user.id);
          batch.push(q);
        }

        const results = await Promise.all(batch);
        let received = 0;
        for (const { data, error } of results) {
          if (error) throw error;
          if (data) { all.push(...data); received += data.length; }
        }
        from += 5 * BATCH;

        notifyProgress({ loaded: all.length, total, percent: Math.min(100, Math.round(all.length / total * 100)), done: false });
        queryClient.setQueryData(queryKey, [...all]);

        if (received < batch.length * BATCH) break;
      }

      notifyProgress({ loaded: all.length, total: all.length, percent: 100, done: true });
      return all;
    },
    enabled: true,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });
};