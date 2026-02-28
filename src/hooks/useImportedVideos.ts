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

const BATCH_SIZE = 500;

export const useImportedVideos = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["imported-videos", user?.id ?? "public"];

  return useQuery({
    queryKey,
    queryFn: async () => {
      let countQuery = supabase
        .from("imported_videos")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      if (user) countQuery = countQuery.eq("user_id", user.id);
      const { count } = await countQuery;
      const total = count ?? null;
      notifyProgress({ loaded: 0, total, percent: 0, done: false });

      let all: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("imported_videos")
          .select("id,title,original_url,thumbnail_url,model_id,source,format,file_size,duration_seconds,imported_at,is_active,average_rating,category_id,metadata")
          .eq("is_active", true)
          .order("imported_at", { ascending: false })
          .range(from, from + BATCH_SIZE - 1);
        if (user) query = query.eq("user_id", user.id);

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          all = [...all, ...data];
          from += BATCH_SIZE;
          const pct = total ? Math.min(100, Math.round((all.length / total) * 100)) : 0;
          notifyProgress({ loaded: all.length, total, percent: pct, done: false });
          queryClient.setQueryData(queryKey, [...all]);
          if (data.length < BATCH_SIZE) hasMore = false;
        } else {
          hasMore = false;
        }
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