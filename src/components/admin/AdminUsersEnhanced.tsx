import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Users, Search, Pencil, Ban, Trash2, Loader2, ChevronLeft, ChevronRight, Clock, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const AdminUsersEnhanced = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [sanctions, setSanctions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Sanction form
  const [sanctionUserId, setSanctionUserId] = useState<string | null>(null);
  const [sanctionType, setSanctionType] = useState("warning");
  const [sanctionReason, setSanctionReason] = useState("");
  const [sanctionDays, setSanctionDays] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [profilesRes, sanctionsRes, sessionsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_sanctions").select("*").order("created_at", { ascending: false }),
      supabase.from("sessions").select("user_id, last_active_at, is_active").order("last_active_at", { ascending: false }),
    ]);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (sanctionsRes.data) setSanctions(sanctionsRes.data);
    if (sessionsRes.data) setSessions(sessionsRes.data);
    setLoading(false);
  };

  const getLastLogin = (userId: string) => {
    const s = sessions.find(s => s.user_id === userId);
    return s ? new Date(s.last_active_at).toLocaleDateString("fr-FR") : "—";
  };

  const isUserBanned = (userId: string) => sanctions.some(s => s.user_id === userId && s.is_active && ["temp_ban", "permanent_ban"].includes(s.sanction_type));

  const filtered = useMemo(() => {
    let result = [...profiles];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => (p.display_name || "").toLowerCase().includes(q) || p.user_id.includes(q));
    }
    if (planFilter === "free") result = result.filter(p => !p.is_premium);
    if (planFilter === "premium") result = result.filter(p => p.is_premium);
    if (statusFilter === "active") result = result.filter(p => !isUserBanned(p.user_id));
    if (statusFilter === "suspended") result = result.filter(p => isUserBanned(p.user_id));
    return result;
  }, [profiles, search, planFilter, statusFilter, sanctions]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSanction = async () => {
    if (!user || !sanctionUserId || !sanctionReason.trim()) return;
    const expiresAt = sanctionDays ? new Date(Date.now() + sanctionDays * 86400000).toISOString() : null;
    const { error } = await supabase.from("user_sanctions").insert({
      user_id: sanctionUserId,
      sanction_type: sanctionType as any,
      reason: sanctionReason,
      issued_by: user.id,
      expires_at: expiresAt,
    });
    if (error) toast({ title: "Erreur", variant: "destructive" });
    else { toast({ title: "Sanction appliquée" }); setSanctionUserId(null); setSanctionReason(""); loadAll(); }
  };

  const saveUserEdit = async () => {
    if (!editingUser) return;
    const { error } = await supabase.from("profiles").update({
      display_name: editingUser.display_name,
      is_premium: editingUser.is_premium,
    }).eq("id", editingUser.id);
    if (error) toast({ title: "Erreur", variant: "destructive" });
    else { toast({ title: "Utilisateur modifié" }); setEditingUser(null); loadAll(); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Users size={20} className="text-primary" /> Utilisateurs ({filtered.length})
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-9 w-56 text-sm" />
          </div>
          <Select value={planFilter} onValueChange={v => { setPlanFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[110px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tous plans</SelectItem>
              <SelectItem value="free" className="text-xs">Free</SelectItem>
              <SelectItem value="premium" className="text-xs">Premium</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[110px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tous statuts</SelectItem>
              <SelectItem value="active" className="text-xs">Actif</SelectItem>
              <SelectItem value="suspended" className="text-xs">Suspendu</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase bg-muted/50 border-b border-border">
          <div className="w-8">ID</div>
          <div className="flex-1">Username</div>
          <div className="w-20">Plan</div>
          <div className="w-28 hidden md:block">Inscription</div>
          <div className="w-28 hidden md:block">Dernier login</div>
          <div className="w-20">Statut</div>
          <div className="w-28 text-right">Actions</div>
        </div>
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {paginated.map(p => {
            const banned = isUserBanned(p.user_id);
            return (
              <div key={p.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50", banned && "bg-destructive/5")}>
                <div className="w-8 text-xs text-muted-foreground font-mono">{p.user_id.slice(0, 4)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", banned ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary")}>
                      {(p.display_name || "?")[0].toUpperCase()}
                    </div>
                    <span className="text-foreground truncate">{p.display_name || "Sans nom"}</span>
                  </div>
                </div>
                <div className="w-20">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", p.is_premium ? "bg-amber-500/20 text-amber-600" : "bg-muted text-muted-foreground")}>
                    {p.is_premium ? "Premium" : "Free"}
                  </span>
                </div>
                <div className="w-28 hidden md:block text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("fr-FR")}</div>
                <div className="w-28 hidden md:block text-xs text-muted-foreground">{getLastLogin(p.user_id)}</div>
                <div className="w-20">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", banned ? "bg-destructive/20 text-destructive" : "bg-emerald-500/20 text-emerald-600")}>
                    {banned ? "Suspendu" : "Actif"}
                  </span>
                </div>
                <div className="w-28 flex gap-1 justify-end">
                  <button onClick={() => setEditingUser({ ...p })} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"><Pencil size={13} /></button>
                  <button onClick={() => setSanctionUserId(p.user_id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"><Ban size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">Page {page}/{totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* Sanction form */}
      <Dialog open={!!sanctionUserId} onOpenChange={() => setSanctionUserId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Sanctionner l'utilisateur</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={sanctionType} onValueChange={setSanctionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warning">⚠️ Avertissement</SelectItem>
                <SelectItem value="temp_ban">🚫 Ban temporaire</SelectItem>
                <SelectItem value="permanent_ban">🔴 Ban permanent</SelectItem>
              </SelectContent>
            </Select>
            {sanctionType === "temp_ban" && <Input type="number" placeholder="Durée (jours)" value={sanctionDays || ""} onChange={e => setSanctionDays(parseInt(e.target.value) || null)} />}
            <Input placeholder="Raison..." value={sanctionReason} onChange={e => setSanctionReason(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSanctionUserId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleSanction} disabled={!sanctionReason.trim()}>Appliquer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Fiche utilisateur</DialogTitle></DialogHeader>
          {editingUser && (
            <div className="space-y-3">
              <div><Label>Username</Label><Input value={editingUser.display_name || ""} onChange={e => setEditingUser({ ...editingUser, display_name: e.target.value })} /></div>
              <div>
                <Label>Plan</Label>
                <Select value={editingUser.is_premium ? "premium" : "free"} onValueChange={v => setEditingUser({ ...editingUser, is_premium: v === "premium" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><Clock size={12} className="inline mr-1" /> Inscription : {new Date(editingUser.created_at).toLocaleDateString("fr-FR")}</p>
                <p><Clock size={12} className="inline mr-1" /> Dernier login : {getLastLogin(editingUser.user_id)}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Annuler</Button>
            <Button onClick={saveUserEdit}>Sauvegarder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersEnhanced;
