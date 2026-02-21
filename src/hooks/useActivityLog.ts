import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type VideoEvent = "play" | "pause" | "end" | "like" | "unlike" | "mix_start" | "seek" | "speed_change";

export const useActivityLog = () => {
  const { user } = useAuth();

  const logEvent = useCallback(async (
    eventType: VideoEvent,
    resourceId?: string,
    metadata?: Record<string, any>
  ) => {
    if (!user) return;
    await supabase.from("activity_logs").insert({
      user_id: user.id,
      event_type: eventType,
      resource_type: "video",
      resource_id: resourceId || null,
      metadata: metadata || {},
    });
  }, [user]);

  return { logEvent };
};
