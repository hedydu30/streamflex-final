import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useImportedVideos } from "@/hooks/useImportedVideos";
import { useModels } from "@/hooks/useModels";
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
  Trash2, Search, Pencil, Users, Tag, Film, Loader2,
  CheckSquare, X, ChevronLeft, ChevronRight, ExternalLink, Wifi, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const AdminMediaManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use cached react-query hooks instead of manual fetching
  const { data: videos = [], isLoading: loading, refetch } = useImportedVideos();
  const { models } = useModels();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingVideo, setEditingVideo] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editModelId, setEditModelId] = useState<string | null>(null);
  const [bulkModelId, setBulkModelId] = useState<string | null>(null);
  const [showBulkModel, setShowBulkModel] = useState(false);
  const [showCreateModel, setShowCreateModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [creatingModel, setCreatingModel] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Realtime subscription for live updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('admin-media-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'imported_videos' },
        () => {
          // Invalidate cache to trigger refetch
          queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const filtered = useMemo(() => {
    let result = [...videos];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((v: any) => v.title.toLowerCase().includes(q) || v.original_url.toLowerCase().includes(q));
    }
    if (sourceFilter !== "all") result = result.filter((v: any) => v.source === sourceFilter);
    if (modelFilter !== "all") {
      if (modelFilter === "none") result = result.filter((v: any) => !v.model_id);
      else result = result.filter((v: any) => v.model_id === modelFilter);
    }
    return result;
  }, [videos, search, sourceFilter, modelFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sources = useMemo(() => {
    const set = new Set(videos.map((v: any) => v.source).filter(Boolean));
    return Array.from(set).sort();
  }, [videos]);

  // Stats
  const stats = useMemo(() => {
    const withModel = videos.filter((v: any) => v.model_id).length;
    const withoutModel = videos.length - withModel;
    const totalSize = videos.reduce((acc: number, v: any) => acc + (v.file_size || 0), 0);
    return { total: videos.length, withModel, withoutModel, totalSize };
  }, [videos]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select all on CURRENT page
  const selectAllPage = () => {
    if (paginated.every((v: any) => selectedIds.has(v.id))) {
      // Deselect current page
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((v: any) => next.delete(v.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((v: any) => next.add(v.id));
        return next;
      });
    }
  };

  // Select ALL filtered results across all pages
  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((v: any) => v.id)));
  };

  const bulkDelete = async () => {
    setDeleting(true);
    const ids = Array.from(selectedIds);
    const BATCH = 100;
    let failed = false;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      // Clean up non-cascaded relations first
      await Promise.all([
        supabase.from("video_favorites").delete().in("video_id", batch),
        supabase.from("video_progress").delete().in("video_id", batch),
      ]);
      const { error } = await supabase.from("imported_videos").delete().in("id", batch);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); failed = true; break; }
    }
    if (!failed) {
      toast({ title: `${ids.length} vidéo(s) supprimée(s)` });
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    }
    setDeleting(false);
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
  };

  const bulkAssignModel = async () => {
    if (!bulkModelId) return;
    const ids = Array.from(selectedIds);
    const BATCH = 100;
    let failed = false;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const { error } = await supabase.from("imported_videos").update({ model_id: bulkModelId }).in("id", batch);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); failed = true; break; }
    }
    if (!failed) {
      const modelName = models.find((m: any) => m.id === bulkModelId)?.name || "inconnu";
      toast({ title: `${ids.length} vidéo(s) attribuée(s) à ${modelName}` });
      setSelectedIds(new Set());
      setShowBulkModel(false);
      queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
    }
  };

  const bulkCreateAndAssignModel = async () => {
    if (!newModelName.trim() || !user) return;
    setCreatingModel(true);
    try {
      // Check if model already exists
      const { data: existing } = await supabase
        .from("models").select("id").eq("user_id", user.id).eq("name", newModelName.trim()).maybeSingle();
      
      let modelId: string;
      if (existing) {
        modelId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from("models").insert({ user_id: user.id, name: newModelName.trim() }).select("id").single();
        if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
        modelId = created.id;
      }

      // Assign all selected videos
      const ids = Array.from(selectedIds);
      const BATCH = 100;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const { error } = await supabase.from("imported_videos").update({ model_id: modelId }).in("id", batch);
        if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
      }

      toast({ title: `Modèle "${newModelName.trim()}" créé`, description: `${ids.length} vidéo(s) rattachée(s)` });
      setSelectedIds(new Set());
      setShowCreateModel(false);
      setNewModelName("");
      queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
      queryClient.invalidateQueries({ queryKey: ["models"] });
    } finally {
      setCreatingModel(false);
    }
  };

  const saveEdit = async () => {
    if (!editingVideo) return;
    const updates: any = {};
    if (editTitle.trim() && editTitle !== editingVideo.title) updates.title = editTitle.trim();
    if (editModelId !== undefined) updates.model_id = editModelId;

    if (Object.keys(updates).length === 0) { setEditingVideo(null); return; }

    const { error } = await supabase.from("imported_videos").update(updates).eq("id", editingVideo.id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Modifié !" });
      setEditingVideo(null);
      queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
    }
  };

  const getModelName = (modelId: string | null) => {
    if (!modelId) return "—";
    return models.find((m: any) => m.id === modelId)?.name || "—";
  };

  const allPageSelected = paginated.length > 0 && paginated.every((v: any) => selectedIds.has(v.id));

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Film size={20} className="text-primary" /> Gestion des médias ({stats.total})
            {realtimeConnected && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-normal">
                <Wifi size={12} /> Live
              </span>
            )}
          </h2>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
            <span>{stats.withModel} avec modèle</span>
            <span>{stats.withoutModel} sans modèle</span>
            <span>{(stats.totalSize / 1024 / 1024 / 1024).toFixed(1)} Go total</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="destructive" onClick={() => { setSelectedIds(new Set(filtered.map((v: any) => v.id))); setShowDeleteConfirm(true); }} className="gap-1">
            <Trash2 size={14} /> Tout supprimer ({filtered.length})
          </Button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8 h-9 w-64 text-sm" />
          </div>
          {sources.length > 1 && (
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Toutes sources</SelectItem>
                {sources.map((s) => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={modelFilter} onValueChange={(v) => { setModelFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Tous les modèles</SelectItem>
              <SelectItem value="none" className="text-xs">Sans modèle</SelectItem>
              {[...models].sort((a: any, b: any) => a.name.localeCompare(b.name, 'fr')).map((m: any) => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-accent border border-border">
          <CheckSquare size={16} className="text-primary" />
          <span className="text-sm text-foreground font-medium">{selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Désélectionner</Button>
            {selectedIds.size < filtered.length && (
              <Button size="sm" variant="outline" onClick={selectAllFiltered}>
                Tout sélectionner ({filtered.length})
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowBulkModel(true)} className="gap-1">
              <Users size={14} /> Affecter à un modèle
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCreateModel(true)} className="gap-1">
              <Plus size={14} /> Créer un modèle
            </Button>
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
          <div className="flex-1">Titre</div>
          <div className="w-28 hidden md:block">Modèle</div>
          <div className="w-20 hidden md:block">Source</div>
          <div className="w-20 hidden md:block text-right">Taille</div>
          <div className="w-24 hidden md:block">Date</div>
          <div className="w-20 text-right">Actions</div>
        </div>

        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {paginated.map((video: any) => (
            <div
              key={video.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/50",
                selectedIds.has(video.id) && "bg-primary/5"
              )}
            >
              <div className="w-6"><Checkbox checked={selectedIds.has(video.id)} onCheckedChange={() => toggleSelect(video.id)} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground truncate">{video.title}</p>
              </div>
              <div className="w-28 hidden md:block">
                <span className="text-xs text-muted-foreground truncate block">{getModelName(video.model_id)}</span>
              </div>
              <div className="w-20 hidden md:block">
                <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{video.source}</span>
              </div>
              <div className="w-20 hidden md:block text-right text-xs text-muted-foreground">
                {video.file_size ? `${(video.file_size / 1024 / 1024).toFixed(0)} Mo` : "—"}
              </div>
              <div className="w-32 hidden md:block text-xs text-muted-foreground">
                {new Date(video.imported_at).toLocaleDateString("fr-FR")} {new Date(video.imported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="w-20 flex gap-1 justify-end">
                <button
                  onClick={() => { setEditingVideo(video); setEditTitle(video.title); setEditModelId(video.model_id); }}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => {
                    setDeleteTargetId(video.id);
                    setSelectedIds(new Set([video.id]));
                    setShowDeleteConfirm(true);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination with multi-page select hint */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Page {page}/{totalPages} — {filtered.length} vidéo{filtered.length > 1 ? "s" : ""}
            {selectedIds.size > 0 && ` • ${selectedIds.size} sélectionné(s) sur toutes les pages`}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={14} />
            </Button>
            <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingVideo} onOpenChange={(open) => !open && setEditingVideo(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Modifier la vidéo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Titre</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Modèle</label>
              <Select value={editModelId || "none"} onValueChange={(v) => setEditModelId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {[...models].sort((a: any, b: any) => a.name.localeCompare(b.name, 'fr')).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editingVideo && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Source :</strong> {editingVideo.source}</p>
                <p className="truncate"><strong>URL :</strong> {editingVideo.original_url}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVideo(null)}>Annuler</Button>
            <Button onClick={saveEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk model assign dialog */}
      <Dialog open={showBulkModel} onOpenChange={setShowBulkModel}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Affecter à un modèle</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{selectedIds.size} vidéo(s) sélectionnée(s)</p>
          <Select value={bulkModelId || ""} onValueChange={setBulkModelId}>
            <SelectTrigger><SelectValue placeholder="Choisir un modèle" /></SelectTrigger>
            <SelectContent>
              {[...models].sort((a: any, b: any) => a.name.localeCompare(b.name, 'fr')).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkModel(false)}>Annuler</Button>
            <Button onClick={bulkAssignModel} disabled={!bulkModelId}>Affecter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog (individual + bulk) */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) { setShowDeleteConfirm(false); setDeleteTargetId(null); } }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 size={18} className="text-destructive" /> Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-foreground">
            {deleteTargetId
              ? <>Supprimer définitivement cette vidéo ?</>
              : <>Supprimer définitivement <strong>{selectedIds.size}</strong> vidéo(s) ?</>
            }
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}>Annuler</Button>
            <Button variant="destructive" onClick={bulkDelete} disabled={deleting}>
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create model and assign dialog */}
      <Dialog open={showCreateModel} onOpenChange={(open) => { setShowCreateModel(open); if (!open) setNewModelName(""); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus size={18} className="text-primary" /> Créer un modèle</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{selectedIds.size} vidéo(s) seront rattachée(s) au nouveau modèle.</p>
          <Input
            placeholder="Nom du modèle *"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateModel(false); setNewModelName(""); }}>Annuler</Button>
            <Button onClick={bulkCreateAndAssignModel} disabled={!newModelName.trim() || creatingModel}>
              {creatingModel ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Créer et affecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMediaManagement;
