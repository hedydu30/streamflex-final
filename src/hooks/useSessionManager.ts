import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const MAX_SESSIONS = 3;

export const useSessionManager = () => {
  const { user } = useAuth();
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [isBanned, setIsBanned] = useState(false);

  // Check ban status
  useEffect(() => {
    if (!user) return;
    supabase.rpc("is_user_banned", { _user_id: user.id }).then(({ data }) => {
      setIsBanned(!!data);
    });
  }, [user]);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("last_active_at", { ascending: false });
    setActiveSessions(data || []);
    return data || [];
  }, [user]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Register current session (enforce limit)
  const registerSession = useCallback(async () => {
    if (!user) return;
    const sessions = await fetchSessions();
    if (sessions && sessions.length >= MAX_SESSIONS) {
      // Deactivate oldest sessions beyond limit
      const toDeactivate = sessions.slice(MAX_SESSIONS - 1);
      for (const s of toDeactivate) {
        await supabase
          .from("sessions")
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq("id", s.id);
      }
    }

    await supabase.from("sessions").insert({
      user_id: user.id,
      source: "web",
      device_info: navigator.userAgent.substring(0, 200),
    });
  }, [user, fetchSessions]);

  // Global logout (deactivate all sessions)
  const globalLogout = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("sessions")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_active", true);
    setActiveSessions([]);
  }, [user]);

  // Deactivate a specific session
  const deactivateSession = useCallback(async (sessionId: string) => {
    await supabase
      .from("sessions")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    await fetchSessions();
  }, [fetchSessions]);

  return {
    activeSessions,
    isBanned,
    maxSessions: MAX_SESSIONS,
    registerSession,
    globalLogout,
    deactivateSession,
    fetchSessions,
  };
};
