import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Key,
  Copy,
  Check,
  Trash2,
  Shield,
  Users,
  Bell,
  Ban,
  AlertTriangle,
  Activity,
  Monitor,
  LogOut,
  Palette,
  Upload,
  BarChart3,
  Video,
  Film,
  User,
  Settings,
  Tag,
  MessageSquare,
  Lock,
  Server,
  Pipette,
  Menu,
  X as XIcon,
  LayoutDashboard,
  Globe,
} from "lucide-react";
import AdminThemes from "@/components/AdminThemes";
import AdminMediaManagement from "@/components/AdminMediaManagement";
import AdminModels from "@/components/AdminModels";
import AdminPlayerSettings from "@/components/AdminPlayerSettings";
import AdminVideoList from "@/components/admin/AdminVideoList";
import AdminCategories from "@/components/admin/AdminCategories";
import AdminComments from "@/components/admin/AdminComments";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import AdminUsersEnhanced from "@/components/admin/AdminUsersEnhanced";
import AdminSettingsEnhanced from "@/components/admin/AdminSettingsEnhanced";
import AdminSecurity from "@/components/admin/AdminSecurity";
import AdminColorEditor from "@/components/admin/AdminColorEditor";
import AdminCMSSettings from "@/components/admin/AdminCMSSettings";
import AdminCoomerSearch from "@/components/admin/AdminCoomerSearch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { label: "1 jour", days: 1 },
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
  { label: "90 jours", days: 90 },
  { label: "365 jours", days: 365 },
  { label: "À vie", days: null },
];

function generateKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key = "";
  for (let i = 0; i < 25; i++) {
    if (i > 0 && i % 5 === 0) key += "-";
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

type AdminTab =
  | "dashboard"
  | "videos"
  | "categories"
  | "keys"
  | "users"
  | "comments"
  | "analytics"
  | "logs"
  | "media"
  | "models"
  | "player"
  | "themes"
  | "colors"
  | "settings"
  | "security"
  | "cms"
  | "coomer";

const Admin = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dashboard stats
  const [dashStats, setDashStats] = useState({ totalUsers: 0, activeSessions: 0, totalVideos: 0, premiumUsers: 0 });

  // Keys state
  const [keys, setKeys] = useState<any[]>([]);
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[2]);
  const [generating, setGenerating] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterUsed, setFilterUsed] = useState<"all" | "unused" | "used">("all");

  // Notification state
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [sendingNotif, setSendingNotif] = useState(false);

  // Activity logs state
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState("all");

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (data) {
      setIsAdmin(true);
      fetchKeys();
    } else {
      navigate("/", { replace: true });
      toast({
        title: "Accès refusé",
        description: "Vous n'avez pas les droits administrateur.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const fetchKeys = async () => {
    const { data } = await supabase.from("premium_keys").select("*").order("created_at", { ascending: false });
    if (data) setKeys(data);
  };

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    const newKeys = Array.from({ length: batchCount }, () => ({
      key_code: generateKey(),
      duration_days: selectedDuration.days,
      duration_label: selectedDuration.label,
      created_by: user.id,
    }));
    const { error } = await supabase.from("premium_keys").insert(newKeys);
    if (error) toast({ title: "Erreur", description: "Impossible de générer les clés.", variant: "destructive" });
    else {
      toast({ title: `${batchCount} clé(s) créée(s)` });
      fetchKeys();
    }
    setGenerating(false);
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("premium_keys").delete().eq("id", id);
    if (!error) {
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "Clé supprimée" });
    }
  };

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    setSendingNotif(true);
    const { data: allProfiles } = await supabase.from("profiles").select("user_id");
    if (allProfiles && allProfiles.length > 0) {
      const notifs = allProfiles.map((p) => ({
        user_id: p.user_id,
        title: notifTitle,
        message: notifMessage,
        type: "info" as const,
      }));
      await supabase.from("notifications").insert(notifs);
      toast({ title: `Notification envoyée à ${allProfiles.length} utilisateur(s)` });
      setNotifTitle("");
      setNotifMessage("");
    }
    setSendingNotif(false);
  };

  const fetchLogs = async () => {
    let query = supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (logFilter !== "all") query = query.eq("event_type", logFilter);
    const { data } = await query;
    if (data) setActivityLogs(data);
  };

  const fetchDashStats = async () => {
    const [profilesRes, sessionsRes, videosRes] = await Promise.all([
      supabase.from("profiles").select("is_premium", { count: "exact" }),
      supabase.from("sessions").select("id", { count: "exact" }).eq("is_active", true),
      supabase.from("imported_videos").select("id", { count: "exact" }),
    ]);
    setDashStats({
      totalUsers: profilesRes.count || 0,
      activeSessions: sessionsRes.count || 0,
      totalVideos: videosRes.count || 0,
      premiumUsers: (profilesRes.data || []).filter((p: any) => p.is_premium).length,
    });
  };

  useEffect(() => {
    if (isAdmin && activeTab === "dashboard") fetchDashStats();
    if (isAdmin && activeTab === "logs") fetchLogs();
  }, [isAdmin, activeTab, logFilter]);

  const filteredKeys = keys.filter((k) => {
    if (filterUsed === "unused") return !k.is_used;
    if (filterUsed === "used") return k.is_used;
    return true;
  });

  const stats = {
    total: keys.length,
    used: keys.filter((k) => k.is_used).length,
    unused: keys.filter((k) => !k.is_used).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "videos", label: "Vidéos", icon: Video },
    { key: "categories", label: "Catégories", icon: Tag },
    { key: "keys", label: "Clés", icon: Key },
    { key: "users", label: "Utilisateurs", icon: Users },
    { key: "comments", label: "Commentaires", icon: MessageSquare },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "logs", label: "Activité", icon: Activity },
    { key: "media", label: "Médias", icon: Film },
    { key: "models", label: "Modèles", icon: User },
    { key: "player", label: "Player", icon: Monitor },
    { key: "themes", label: "Thèmes", icon: Palette },
    { key: "colors", label: "Couleurs", icon: Pipette },
    { key: "settings", label: "Paramètres", icon: Settings },
    { key: "security", label: "Sécurité", icon: Lock },
    { key: "cms", label: "CMS", icon: LayoutDashboard },
    { key: "coomer", label: "Coomer", icon: Globe },
  ] as const;

  const SidebarContent = () => (
    <>
      {/* Sidebar header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <button
          onClick={() => navigate("/")}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <ArrowLeft size={20} />
        </button>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-1.5 min-w-0">
            <Shield size={18} className="text-primary shrink-0" />
            <span className="text-sm font-bold text-foreground truncate">Administration</span>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1 hidden md:block"
        >
          <ArrowLeft size={14} className={cn("transition-transform", sidebarCollapsed && "rotate-180")} />
        </button>
      </div>

      {/* Sidebar nav */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              setMobileMenuOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
              sidebarCollapsed && "justify-center px-2",
            )}
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon size={16} className="shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{label}</span>}
          </button>
        ))}
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={() => {
            navigate("/import");
            setMobileMenuOpen(false);
          }}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            sidebarCollapsed && "justify-center px-2",
          )}
          title={sidebarCollapsed ? "Importer" : undefined}
        >
          <Upload size={16} className="shrink-0" />
          {!sidebarCollapsed && <span>Importer</span>}
        </button>
        <button
          onClick={signOut}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
            sidebarCollapsed && "justify-center px-2",
          )}
          title={sidebarCollapsed ? "Déconnexion" : undefined}
        >
          <LogOut size={16} className="shrink-0" />
          {!sidebarCollapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 md:hidden bg-card border-b border-border flex items-center gap-3 px-3 py-2">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-md text-foreground hover:bg-accent"
        >
          {mobileMenuOpen ? <XIcon size={22} /> : <Menu size={22} />}
        </button>
        <div className="flex items-center gap-1.5">
          <Shield size={16} className="text-primary" />
          <span className="text-sm font-bold text-foreground">
            {tabs.find((t) => t.key === activeTab)?.label || "Admin"}
          </span>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute top-0 left-0 bottom-0 w-64 bg-card border-r border-border flex flex-col z-50 animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Desktop Left Sidebar */}
      <aside
        className={cn(
          "sticky top-0 h-screen bg-card border-r border-border flex-col shrink-0 transition-all duration-300 z-40 hidden md:flex",
          sidebarCollapsed ? "w-16" : "w-56",
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto pt-12 md:pt-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">
          {/* DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <BarChart3 size={20} className="text-primary" /> Tableau de bord
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Utilisateurs", value: dashStats.totalUsers, icon: Users, color: "text-primary" },
                  {
                    label: "Sessions actives",
                    value: dashStats.activeSessions,
                    icon: Activity,
                    color: "text-emerald-500",
                  },
                  { label: "Vidéos importées", value: dashStats.totalVideos, icon: Video, color: "text-blue-500" },
                  { label: "Utilisateurs Premium", value: dashStats.premiumUsers, icon: Key, color: "text-amber-500" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn("p-2 rounded-lg bg-accent", color)}>
                        <Icon size={20} />
                      </div>
                    </div>
                    <span className="text-3xl font-bold text-foreground">{value}</span>
                    <p className="text-sm text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIDEOS */}
          {activeTab === "videos" && <AdminVideoList />}

          {/* CATEGORIES */}
          {activeTab === "categories" && <AdminCategories />}

          {/* KEYS */}
          {activeTab === "keys" && (
            <>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total", value: stats.total, icon: Key },
                  { label: "Utilisées", value: stats.used, icon: Check },
                  { label: "Disponibles", value: stats.unused, icon: Key },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <Icon size={18} className="text-primary" />
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                    <span className="text-3xl font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </div>

              <section className="bg-card border border-border rounded-lg p-6 space-y-5">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Key size={20} className="text-primary" /> Générer des clés premium
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Durée</label>
                    <select
                      value={selectedDuration.label}
                      onChange={(e) => setSelectedDuration(DURATIONS.find((d) => d.label === e.target.value)!)}
                      className="w-full bg-secondary text-foreground rounded px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border"
                    >
                      {DURATIONS.map((d) => (
                        <option key={d.label} value={d.label}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Nombre</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={batchCount}
                      onChange={(e) => setBatchCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-full bg-secondary text-foreground rounded px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleGenerate} disabled={generating} className="w-full">
                      {generating ? "Génération..." : `Générer ${batchCount} clé(s)`}
                    </Button>
                  </div>
                </div>
              </section>

              <section className="bg-card border border-border rounded-lg p-6 space-y-5">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Bell size={20} className="text-primary" /> Notification globale
                </h2>
                <div className="space-y-3">
                  <Input
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="Titre"
                    maxLength={100}
                  />
                  <textarea
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Message..."
                    maxLength={500}
                    rows={3}
                    className="w-full bg-secondary text-foreground rounded px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border placeholder:text-muted-foreground resize-none"
                  />
                  <Button
                    onClick={handleSendNotification}
                    disabled={sendingNotif || !notifTitle.trim() || !notifMessage.trim()}
                  >
                    {sendingNotif ? "Envoi..." : "Envoyer à tous"}
                  </Button>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-foreground">Clés générées</h2>
                  <div className="flex gap-2">
                    {(["all", "unused", "used"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilterUsed(f)}
                        className={cn(
                          "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                          filterUsed === f
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-secondary-foreground hover:bg-accent",
                        )}
                      >
                        {f === "all" ? "Toutes" : f === "unused" ? "Disponibles" : "Utilisées"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {filteredKeys.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Aucune clé trouvée.</p>
                  ) : (
                    filteredKeys.map((key) => (
                      <div
                        key={key.id}
                        className={cn(
                          "flex items-center justify-between bg-card border rounded-lg px-4 py-3",
                          key.is_used ? "border-border/50 opacity-60" : "border-border",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <code className="text-sm font-mono text-foreground tracking-wider">{key.key_code}</code>
                            <span
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full",
                                key.is_used ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary",
                              )}
                            >
                              {key.is_used ? "Utilisée" : key.duration_label}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Créée le {new Date(key.created_at).toLocaleDateString("fr-FR")}
                            {key.is_used &&
                              key.used_at &&
                              ` • Activée le ${new Date(key.used_at).toLocaleDateString("fr-FR")}`}
                            {key.expires_at && ` • Expire le ${new Date(key.expires_at).toLocaleDateString("fr-FR")}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            onClick={() => handleCopy(key.key_code, key.id)}
                            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedId === key.id ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                          </button>
                          {!key.is_used && (
                            <button
                              onClick={() => handleDelete(key.id)}
                              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}

          {/* USERS */}
          {activeTab === "users" && <AdminUsersEnhanced />}

          {/* COMMENTS */}
          {activeTab === "comments" && <AdminComments />}

          {/* ANALYTICS */}
          {activeTab === "analytics" && <AdminAnalytics />}

          {/* ACTIVITY LOGS */}
          {activeTab === "logs" && (
            <section className="bg-card border border-border rounded-lg p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Activity size={20} className="text-primary" /> Journaux d'activité
                </h2>
                <div className="flex items-center gap-2">
                  <Select value={logFilter} onValueChange={(v) => setLogFilter(v)}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        Tous
                      </SelectItem>
                      <SelectItem value="play" className="text-xs">
                        ▶ Play
                      </SelectItem>
                      <SelectItem value="pause" className="text-xs">
                        ⏸ Pause
                      </SelectItem>
                      <SelectItem value="end" className="text-xs">
                        ⏹ End
                      </SelectItem>
                      <SelectItem value="like" className="text-xs">
                        ❤ Like
                      </SelectItem>
                      <SelectItem value="unlike" className="text-xs">
                        💔 Unlike
                      </SelectItem>
                      <SelectItem value="mix_start" className="text-xs">
                        🔀 Mix
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={fetchLogs}>
                    Rafraîchir
                  </Button>
                </div>
              </div>

              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {activityLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Aucun log trouvé.</p>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent/50 text-sm">
                      <span
                        className={cn(
                          "w-16 text-xs font-medium px-1.5 py-0.5 rounded text-center",
                          log.event_type === "play"
                            ? "bg-emerald-500/20 text-emerald-600"
                            : log.event_type === "pause"
                              ? "bg-yellow-500/20 text-yellow-600"
                              : log.event_type === "end"
                                ? "bg-blue-500/20 text-blue-600"
                                : log.event_type === "like"
                                  ? "bg-pink-500/20 text-pink-600"
                                  : log.event_type === "unlike"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-primary/20 text-primary",
                        )}
                      >
                        {log.event_type}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">{log.user_id.slice(0, 8)}...</span>
                      {log.resource_id && (
                        <span className="text-foreground/70 text-xs font-mono">{log.resource_id.slice(0, 8)}...</span>
                      )}
                      <span className="text-muted-foreground text-xs ml-auto">
                        {new Date(log.created_at).toLocaleString("fr-FR")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* MEDIA */}
          {activeTab === "media" && <AdminMediaManagement />}

          {/* MODELS */}
          {activeTab === "models" && <AdminModels />}

          {/* THEMES */}
          {activeTab === "themes" && user && <AdminThemes userId={user.id} />}

          {/* COLORS */}
          {activeTab === "colors" && <AdminColorEditor />}

          {activeTab === "player" && <AdminPlayerSettings />}

          {/* SETTINGS */}
          {activeTab === "settings" && <AdminSettingsEnhanced />}

          {/* SECURITY */}
          {activeTab === "security" && <AdminSecurity />}
          {activeTab === "cms" && <AdminCMSSettings />}
          {activeTab === "coomer" && <AdminCoomerSearch />}
        </div>
      </main>
    </div>
  );
};

export default Admin;
