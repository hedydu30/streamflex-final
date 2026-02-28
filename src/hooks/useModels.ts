import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useModels = () => {
  const { user } = useAuth();

  const { data: models = [] } = useQuery({
    queryKey: ["models", user?.id ?? "public"],
    queryFn: async () => {
      // Paginer — Supabase limite à 1000 rows par requête
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("models")
          .select("id, name, profile_image_url, source_platform")
          .order("name")
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) { hasMore = false; break; }
        all = [...all, ...data];
        from += 1000;
        if (data.length < 1000) hasMore = false;
      }
      return all;
    },
    // Always enabled - models are publicly readable now
    enabled: true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const modelImages = useMemo(() => {
    const map = new Map<string, string>();
    models.forEach((m: any) => {
      if (m.profile_image_url) map.set(m.id, m.profile_image_url);
    });
    return map;
  }, [models]);

  const modelNames = useMemo(() => {
    const map = new Map<string, string>();
    models.forEach((m: any) => map.set(m.id, m.name));
    return map;
  }, [models]);

  return { models, modelImages, modelNames };
};