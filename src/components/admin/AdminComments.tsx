import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { MessageSquare, CheckSquare, Trash2, Check, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const AdminComments = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<any[]>([]);
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [commentsRes, videosRes, profilesRes] = await Promise.all([
      supabase.from("comments").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("imported_videos").select("id, title"),
      supabase.from("profiles").select("user_id, display_name"),
    ]);
    if (commentsRes.data) setComments(commentsRes.data);
    const vMap: Record<string, string> = {};
    (videosRes.data || []).forEach((v: any) => vMap[v.id] = v.title);
    setVideos(vMap);
    const pMap: Record<string, string> = {};
    (profilesRes.data || []).forEach((p: any) => pMap[p.user_id] = p.display_name || "Anonyme");
    setProfiles(pMap);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = [...comments];
    if (statusFilter !== "all") result = result.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => (videos[c.video_id] || "").toLowerCase().includes(q) || c.content.toLowerCase().includes(q));
    }
    return result;
  }, [comments, statusFilter, search, videos]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allPageSelected = paginated.length > 0 && paginated.every(c => selectedIds.has(c.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const approveComment = async (id: string) => {
    await supabase.from("comments").update({ status: "approved" }).eq("id", id);
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: "approved" } : c));
    toast({ title: "Commentaire approuvé" });
  };

  const deleteComment = async (id: string) => {
    await supabase.from("comments").delete().eq("id", id);
    setComments(prev => prev.filter(c => c.id !== id));
    toast({ title: "Commentaire supprimé" });
  };

  const bulkApprove = async () => {
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from("comments").update({ status: "approved" }).in("id", ids.slice(i, i + 100));
    }
    setComments(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, status: "approved" } : c));
    setSelectedIds(new Set());
    toast({ title: `${ids.length} commentaire(s) approuvé(s)` });
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from("comments").delete().in("id", ids.slice(i, i + 100));
    }
    setComments(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    toast({ title: `${ids.length} commentaire(s) supprimé(s)` });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <MessageSquare size={20} className="text-primary" /> Commentaires ({filtered.length})
        </h2>
        <div className="flex items-center gap-2">
          <Input placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-9 w-56 text-sm" />
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tous</SelectItem>
              <SelectItem value="pending" className="text-xs">En attente</SelectItem>
              <SelectItem value="approved" className="text-xs">Approuvés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-accent border border-border">
          <CheckSquare size={16} className="text-primary" />
          <span className="text-sm font-medium">{selectedIds.size} sélectionné(s)</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Désélectionner</Button>
            <Button size="sm" variant="outline" onClick={bulkApprove} className="gap-1"><Check size={14} /> Approuver</Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)} className="gap-1"><Trash2 size={14} /> Supprimer</Button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase bg-muted/50 border-b border-border">
          <div className="w-6"><Checkbox checked={allPageSelected} onCheckedChange={() => {
            if (allPageSelected) setSelectedIds(prev => { const n = new Set(prev); paginated.forEach(c => n.delete(c.id)); return n; });
            else setSelectedIds(prev => { const n = new Set(prev); paginated.forEach(c => n.add(c.id)); return n; });
          }} /></div>
          <div className="w-28">Utilisateur</div>
          <div className="w-32">Vidéo</div>
          <div className="flex-1">Commentaire</div>
          <div className="w-24">Date</div>
          <div className="w-20">Statut</div>
          <div className="w-20 text-right">Actions</div>
        </div>
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {paginated.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Aucun commentaire.</p>
          ) : paginated.map(c => (
            <div key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50", selectedIds.has(c.id) && "bg-primary/5")}>
              <div className="w-6"><Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></div>
              <div className="w-28 text-xs text-foreground truncate">{profiles[c.user_id] || c.user_id.slice(0, 8)}</div>
              <div className="w-32 text-xs text-muted-foreground truncate">{videos[c.video_id] || "—"}</div>
              <div className="flex-1 text-xs text-foreground truncate">{c.content.slice(0, 50)}{c.content.length > 50 ? "..." : ""}</div>
              <div className="w-24 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
              <div className="w-20">
                <span className={cn("text-xs px-2 py-0.5 rounded-full", c.status === "approved" ? "bg-emerald-500/20 text-emerald-600" : "bg-yellow-500/20 text-yellow-600")}>
                  {c.status === "approved" ? "Approuvé" : "En attente"}
                </span>
              </div>
              <div className="w-20 flex gap-1 justify-end">
                {c.status !== "approved" && <button onClick={() => approveComment(c.id)} className="p-1.5 text-muted-foreground hover:text-emerald-500 rounded hover:bg-accent"><Check size={13} /></button>}
                <button onClick={() => deleteComment(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
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

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Supprimer {selectedIds.size} commentaire(s) ? Irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Annuler</Button>
            <Button variant="destructive" onClick={bulkDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminComments;
