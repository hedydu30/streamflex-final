import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InternalMessage {
  id: string;
  to_user_id: string;
  from_admin: string;
  subject: string;
  body: string;
  type: "info" | "warning" | "alert" | "system";
  read_at: string | null;
  created_at: string;
}

// ── User inbox ───────────────────────────────────────────────
export function useInbox() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("internal_messages" as any)
      .select("*")
      .eq("to_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setMessages(data as unknown as InternalMessage[]);
      setUnread((data as any[]).filter(m => !m.read_at).length);
    }
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "internal_messages",
        filter: `to_user_id=eq.${user.id}`,
      }, (payload) => {
        setMessages(prev => [payload.new as InternalMessage, ...prev]);
        setUnread(n => n + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const markRead = useCallback(async (id: string) => {
    await supabase
      .from("internal_messages" as any)
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
    setUnread(n => Math.max(0, n - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("internal_messages" as any)
      .update({ read_at: new Date().toISOString() })
      .eq("to_user_id", user.id)
      .is("read_at", null);
    setMessages(prev => prev.map(m => ({ ...m, read_at: m.read_at || new Date().toISOString() })));
    setUnread(0);
  }, [user]);

  return { messages, unread, markRead, markAllRead, reload: load };
}

// ── Admin send ───────────────────────────────────────────────
export async function sendInternalMessage(
  adminId: string,
  toUserId: string,
  subject: string,
  body: string,
  type: InternalMessage["type"] = "info"
) {
  return supabase.from("internal_messages" as any).insert({
    to_user_id: toUserId,
    from_admin: adminId,
    subject,
    body,
    type,
  });
}

// ── Admin: load messages for a user ─────────────────────────
export async function loadMessagesForUser(userId: string) {
  const { data } = await supabase
    .from("internal_messages" as any)
    .select("*")
    .eq("to_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data || []) as unknown as InternalMessage[];
}
