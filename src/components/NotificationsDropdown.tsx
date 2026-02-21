import { useState, useEffect } from "react";
import { Bell, X, Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const NotificationsDropdown = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  };

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const typeColors: Record<string, string> = {
    premium: "text-primary",
    success: "text-green-400",
    warning: "text-yellow-400",
    info: "text-blue-400",
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        className="p-2 text-foreground hover:text-primary transition-colors relative"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-2xl z-50 animate-fade-in overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Aucune notification</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                      !n.is_read ? "bg-secondary/30" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0" onClick={() => !n.is_read && markAsRead(n.id)}>
                        <p className={`text-sm font-medium ${typeColors[n.type] || "text-foreground"}`}>
                          {!n.is_read && <span className="inline-block w-2 h-2 bg-primary rounded-full mr-2" />}
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(n.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteNotification(n.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationsDropdown;
