import { useState } from "react";
import { Bell, X, Check, CheckCheck, AlertTriangle, Info, Zap, ShieldAlert } from "lucide-react";
import { useInbox } from "@/hooks/useInternalMessages";
import { cn } from "@/lib/utils";

const TYPE_CONFIG = {
  info:    { icon: Info,          color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  warning: { icon: AlertTriangle, color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
  alert:   { icon: ShieldAlert,   color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
  system:  { icon: Zap,           color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "à l'instant";
  if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)} h`;
  return `il y a ${Math.floor(diff / 86400000)} j`;
}

const UserInbox = () => {
  const { messages, unread, markRead, markAllRead } = useInbox();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "relative p-2 rounded-lg transition-colors",
          open ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        title="Messagerie"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-xl shadow-2xl z-50 animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-primary" />
                <span className="font-semibold text-foreground text-sm">Messagerie</span>
                {unread > 0 && (
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                    {unread} non lu{unread > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary/70 hover:text-primary transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/5">
                    <CheckCheck size={12} /> Tout lire
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Messages list */}
            <div className="max-h-96 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Aucun message</p>
                </div>
              ) : messages.map(m => {
                const cfg = TYPE_CONFIG[m.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.info;
                const Icon = cfg.icon;
                const isUnread = !m.read_at;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "group px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer",
                      isUnread ? "bg-secondary/30" : ""
                    )}
                    onClick={() => !m.read_at && markRead(m.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 p-1.5 rounded-lg border", cfg.bg)}>
                        <Icon size={14} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-sm font-medium truncate", isUnread ? "text-foreground" : "text-muted-foreground")}>
                            {m.subject}
                          </p>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                            {isUnread && <span className="w-1.5 h-1.5 bg-primary rounded-full" />}
                            {timeAgo(m.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {m.body}
                        </p>
                        {isUnread && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markRead(m.id); }}
                            className="text-[10px] text-primary/70 hover:text-primary mt-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Check size={10} /> Marquer comme lu
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {messages.length > 0 && (
              <div className="px-4 py-2 border-t border-border text-center">
                <span className="text-[10px] text-muted-foreground">
                  {messages.length} message{messages.length > 1 ? "s" : ""} · {unread} non lu{unread > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default UserInbox;
