import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useModels = () => {
  const { user } = useAuth();

  const { data: models = [] } = useQuery({
    queryKey: ["models", user?.id ?? "public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("models")
        .select("id, name, profile_image_url");
      if (error) throw error;
      return data || [];
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
