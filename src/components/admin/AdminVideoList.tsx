import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useImportedVideos } from "@/hooks/useImportedVideos";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2, Search, Pencil, Film, Loader2, CheckSquare, ChevronLeft, ChevronRight, Plus, Star, Eye, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AdminVideoForm from "./AdminVideoForm";

const PAGE_SIZE = 50;

const formatDuration = (seconds: number | null) => {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const AdminVideoList = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: videos = [], isLoading } = useImportedVideos();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Fetch categories
  const [categories, setCategories] = useState<any[]>([]);
  useState(() => {
    supabase.from("categories").select("*").order("display_order").then(({ data }) => {
      if (data) setCategories(data);
    });
  });

  const filtered = useMemo(() => {
    let result = [...videos];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((v: any) =>
        v.title.toLowerCase().includes(q) ||
        (v.short_description || "").toLowerCase().includes(q) ||
        (v.full_description || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") result = result.filter((v: any) => (v as any).status === statusFilter);
    if (categoryFilter !== "all") {
      if (categoryFilter === "none") result = result.filter((v: any) => !(v as any).category_id);
      else result = result.filter((v: any) => (v as any).category_id === categoryFilter);
    }
    // Sort
    switch (sortBy) {
      case "oldest": result.sort((a: any, b: any) => new Date(a.imported_at).getTime() - new Date(b.imported_at).getTime()); break;
      case "most_viewed": result.sort((a: any, b: any) => ((b as any).view_count || 0) - ((a as any).view_count || 0)); break;
      case "best_rated": result.sort((a: any, b: any) => ((b as any).average_rating || 0) - ((a as any).average_rating || 0)); break;
      default: result.sort((a: any, b: any) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime());
    }
    return result;
  }, [videos, search, statusFilter, categoryFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allPageSelected = paginated.length > 0 && paginated.every((v: any) => selectedIds.has(v.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        paginated.forEach((v: any) => next.delete(v.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        paginated.forEach((v: any) => next.add(v.id));
        return next;
      });
    }
  };

  const bulkDelete = async () => {
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      // Clean up non-cascaded relations first
      await Promise.all([
        supabase.from("video_favorites").delete().in("video_id", chunk),
        supabase.from("video_progress").delete().in("video_id", chunk),
      ]);
      const { error } = await supabase.from("imported_videos").delete().in("id", chunk);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setDeleting(false); return; }
    }
    toast({ title: `${ids.length} vidéo(s) supprimée(s)` });
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  const bulkPublish = async () => {
    const ids = Array.from(selectedIds);
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) {
      await supabase.from("imported_videos").update({ status: "published" } as any).in("id", ids.slice(i, i + BATCH));
    }
    toast({ title: `${ids.length} vidéo(s) publiée(s)` });
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
  };

  if (showForm || editingVideoId) {
    return (
      <AdminVideoForm
        videoId={editingVideoId}
        onClose={() => { setShowForm(false); setEditingVideoId(null); }}
        onSaved={() => {
          setShowForm(false);
          setEditingVideoId(null);
          queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
        }}
      />
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Film size={20} className="text-primary" /> Gestion des vidéos ({filtered.length})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
            <Plus size={14} /> Ajouter une vidéo
          </Button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-9 w-56 text-sm" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tous statuts</SelectItem>
              <SelectItem value="published" className="text-xs">Publié</SelectItem>
              <SelectItem value="draft" className="text-xs">Brouillon</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Toutes catégories</SelectItem>
              <SelectItem value="none" className="text-xs">Sans catégorie</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">Plus récent</SelectItem>
              <SelectItem value="oldest" className="text-xs">Plus ancien</SelectItem>
              <SelectItem value="most_viewed" className="text-xs">Plus vues</SelectItem>
              <SelectItem value="best_rated" className="text-xs">Meilleures notes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-accent border border-border">
          <CheckSquare size={16} className="text-primary" />
          <span className="text-sm text-foreground font-medium">{selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Désélectionner</Button>
            <Button size="sm" variant="outline" onClick={bulkPublish} className="gap-1">Publier sélection</Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={deleting} className="gap-1">
              <Trash2 size={14} /> Supprimer ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase bg-muted/50 border-b border-border">
          <div className="w-6"><Checkbox checked={allPageSelected} onCheckedChange={selectAllPage} /></div>
          <div className="w-14">Thumb</div>
          <div className="flex-1">Titre</div>
          <div className="w-24 hidden md:block">Catégorie</div>
          <div className="w-20 hidden md:block">Durée</div>
          <div className="w-16 hidden md:block text-right">Vues</div>
          <div className="w-16 hidden md:block text-right">Note</div>
          <div className="w-24 hidden md:block">Date</div>
          <div className="w-20 hidden md:block">Statut</div>
          <div className="w-24 text-right">Actions</div>
        </div>

        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {paginated.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Aucune vidéo trouvée.</p>
          ) : paginated.map((video: any) => {
            const cat = categories.find(c => c.id === video.category_id);
            return (
              <div key={video.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/50", selectedIds.has(video.id) && "bg-primary/5")}>
                <div className="w-6"><Checkbox checked={selectedIds.has(video.id)} onCheckedChange={() => toggleSelect(video.id)} /></div>
                <div className="w-14 h-9 rounded overflow-hidden bg-muted flex-shrink-0">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setEditingVideoId(video.id)} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Film size={14} /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0"><p className="text-foreground truncate">{video.title}</p></div>
                <div className="w-24 hidden md:block"><span className="text-xs text-muted-foreground truncate block">{cat?.name || "—"}</span></div>
                <div className="w-20 hidden md:block text-xs text-muted-foreground">{formatDuration(video.duration_seconds)}</div>
                <div className="w-16 hidden md:block text-right text-xs text-muted-foreground flex items-center justify-end gap-1"><Eye size={10} />{video.view_count || 0}</div>
                <div className="w-16 hidden md:block text-right text-xs text-muted-foreground flex items-center justify-end gap-1"><Star size={10} />{video.average_rating || "—"}</div>
                <div className="w-24 hidden md:block text-xs text-muted-foreground">{new Date(video.imported_at).toLocaleDateString("fr-FR")}</div>
                <div className="w-20 hidden md:block">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", video.status === "published" ? "bg-emerald-500/20 text-emerald-600" : "bg-yellow-500/20 text-yellow-600")}>
                    {video.status === "published" ? "Publié" : "Brouillon"}
                  </span>
                </div>
                <div className="w-24 flex gap-1 justify-end">
                  <button onClick={() => setEditingVideoId(video.id)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"><Pencil size={13} /></button>
                  <button onClick={async () => { await Promise.all([supabase.from("video_favorites").delete().eq("video_id", video.id), supabase.from("video_progress").delete().eq("video_id", video.id)]); await supabase.from("imported_videos").delete().eq("id", video.id); queryClient.invalidateQueries({ queryKey: ["imported-videos"] }); }} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">Page {page} sur {totalPages} — {filtered.length} vidéo{filtered.length > 1 ? "s" : ""}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></Button>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Supprimer définitivement {selectedIds.size} vidéo(s) ? Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Annuler</Button>
            <Button variant="destructive" onClick={bulkDelete} disabled={deleting}>{deleting ? "Suppression..." : "Supprimer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVideoList;
