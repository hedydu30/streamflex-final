import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, FolderOpen, Plus, Pencil, Trash2, Loader2, Merge } from "lucide-react";
import { cn } from "@/lib/utils";

const AdminCategories = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  // Categories
  const [categories, setCategories] = useState<any[]>([]);
  const [catForm, setCatForm] = useState({ name: "", slug: "", description: "", display_order: 0, is_visible: true });
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catVideoCounts, setCatVideoCounts] = useState<Record<string, number>>({});

  // Tags
  const [tags, setTags] = useState<any[]>([]);
  const [tagForm, setTagForm] = useState({ name: "", slug: "" });
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);
  const [tagUsageCounts, setTagUsageCounts] = useState<Record<string, number>>({});
  const [showMerge, setShowMerge] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [catsRes, tagsRes, videosRes, videoTagsRes] = await Promise.all([
      supabase.from("categories").select("*").order("display_order"),
      supabase.from("tags").select("*").order("name"),
      supabase.from("imported_videos").select("id, category_id") as any,
      supabase.from("video_tags").select("video_id, tag_id"),
    ]);
    if (catsRes.data) setCategories(catsRes.data);
    if (tagsRes.data) setTags(tagsRes.data);

    // Count videos per category
    const counts: Record<string, number> = {};
    (videosRes.data || []).forEach((v: any) => { if (v.category_id) counts[v.category_id] = (counts[v.category_id] || 0) + 1; });
    setCatVideoCounts(counts);

    // Count tag usages
    const tCounts: Record<string, number> = {};
    (videoTagsRes.data || []).forEach((vt: any) => { tCounts[vt.tag_id] = (tCounts[vt.tag_id] || 0) + 1; });
    setTagUsageCounts(tCounts);

    setLoading(false);
  };

  const generateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Category CRUD
  const openCatForm = (cat?: any) => {
    if (cat) {
      setCatForm({ name: cat.name, slug: cat.slug, description: cat.description || "", display_order: cat.display_order, is_visible: cat.is_visible });
      setEditingCatId(cat.id);
    } else {
      setCatForm({ name: "", slug: "", description: "", display_order: categories.length, is_visible: true });
      setEditingCatId(null);
    }
    setShowCatForm(true);
  };

  const saveCat = async () => {
    if (!catForm.name.trim() || !user) return;
    const slug = catForm.slug.trim() || generateSlug(catForm.name);
    const data = { ...catForm, slug, user_id: user.id };

    if (editingCatId) {
      const { error } = await supabase.from("categories").update(data).eq("id", editingCatId);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("categories").insert(data);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: editingCatId ? "Catégorie modifiée" : "Catégorie créée" });
    setShowCatForm(false);
    loadAll();
  };

  const deleteCat = async (id: string) => {
    if ((catVideoCounts[id] || 0) > 0) { toast({ title: "Impossible", description: "Des vidéos utilisent cette catégorie.", variant: "destructive" }); return; }
    if (!window.confirm("Supprimer cette catégorie ?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Catégorie supprimée" });
    loadAll();
  };

  // Tag CRUD
  const openTagForm = (tag?: any) => {
    if (tag) {
      setTagForm({ name: tag.name, slug: tag.slug });
      setEditingTagId(tag.id);
    } else {
      setTagForm({ name: "", slug: "" });
      setEditingTagId(null);
    }
    setShowTagForm(true);
  };

  const saveTag = async () => {
    if (!tagForm.name.trim() || !user) return;
    const slug = tagForm.slug.trim() || generateSlug(tagForm.name);

    if (editingTagId) {
      const { error } = await supabase.from("tags").update({ name: tagForm.name, slug }).eq("id", editingTagId);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("tags").insert({ name: tagForm.name, slug, user_id: user.id });
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: editingTagId ? "Tag modifié" : "Tag créé" });
    setShowTagForm(false);
    loadAll();
  };

  const deleteTag = async (id: string) => {
    if ((tagUsageCounts[id] || 0) > 0) { toast({ title: "Impossible", description: "Ce tag est utilisé par des vidéos.", variant: "destructive" }); return; }
    if (!window.confirm("Supprimer ce tag ?")) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Tag supprimé" });
    loadAll();
  };

  const mergeTag = async (sourceId: string, targetId: string) => {
    // Move all video_tags from source to target
    const { data: existing } = await supabase.from("video_tags").select("video_id").eq("tag_id", sourceId);
    if (existing) {
      for (const vt of existing) {
        await supabase.from("video_tags").upsert({ video_id: vt.video_id, tag_id: targetId }, { onConflict: "video_id,tag_id" });
      }
    }
    await supabase.from("video_tags").delete().eq("tag_id", sourceId);
    await supabase.from("tags").delete().eq("id", sourceId);
    toast({ title: "Tags fusionnés" });
    setShowMerge(null);
    loadAll();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories" className="gap-1"><FolderOpen size={14} /> Catégories ({categories.length})</TabsTrigger>
          <TabsTrigger value="tags" className="gap-1"><Tag size={14} /> Tags ({tags.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-foreground">Catégories</h3>
            <Button size="sm" onClick={() => openCatForm()} className="gap-1"><Plus size={14} /> Ajouter</Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase bg-muted/50 border-b border-border">
              <div className="flex-1">Nom</div>
              <div className="w-32">Slug</div>
              <div className="w-20 text-right">Vidéos</div>
              <div className="w-20 text-center">Visible</div>
              <div className="w-20 text-right">Actions</div>
            </div>
            <div className="divide-y divide-border">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/50">
                  <div className="flex-1 text-foreground font-medium">{cat.name}</div>
                  <div className="w-32 text-xs text-muted-foreground font-mono">{cat.slug}</div>
                  <div className="w-20 text-right text-xs text-muted-foreground">{catVideoCounts[cat.id] || 0}</div>
                  <div className="w-20 text-center">{cat.is_visible ? "✓" : "✗"}</div>
                  <div className="w-20 flex gap-1 justify-end">
                    <button onClick={() => openCatForm(cat)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"><Pencil size={13} /></button>
                    <button onClick={() => deleteCat(cat.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && <p className="text-muted-foreground text-center py-8">Aucune catégorie.</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tags" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-foreground">Tags</h3>
            <Button size="sm" onClick={() => openTagForm()} className="gap-1"><Plus size={14} /> Ajouter</Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase bg-muted/50 border-b border-border">
              <div className="flex-1">Nom</div>
              <div className="w-32">Slug</div>
              <div className="w-24 text-right">Utilisations</div>
              <div className="w-28 text-right">Actions</div>
            </div>
            <div className="divide-y divide-border">
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/50">
                  <div className="flex-1 text-foreground">{tag.name}</div>
                  <div className="w-32 text-xs text-muted-foreground font-mono">{tag.slug}</div>
                  <div className="w-24 text-right text-xs text-muted-foreground">{tagUsageCounts[tag.id] || 0}</div>
                  <div className="w-28 flex gap-1 justify-end">
                    <button onClick={() => openTagForm(tag)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"><Pencil size={13} /></button>
                    <button onClick={() => setShowMerge(tag.id)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent" title="Fusionner"><Merge size={13} /></button>
                    <button onClick={() => deleteTag(tag.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-destructive/10"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
              {tags.length === 0 && <p className="text-muted-foreground text-center py-8">Aucun tag.</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Category form dialog */}
      <Dialog open={showCatForm} onOpenChange={setShowCatForm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editingCatId ? "Modifier" : "Ajouter"} une catégorie</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom *</Label><Input value={catForm.name} onChange={e => { setCatForm(f => ({ ...f, name: e.target.value, slug: f.slug || generateSlug(e.target.value) })); }} /></div>
            <div><Label>Slug URL</Label><Input value={catForm.slug} onChange={e => setCatForm(f => ({ ...f, slug: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div><Label>Ordre d'affichage</Label><Input type="number" value={catForm.display_order} onChange={e => setCatForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} /></div>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={catForm.is_visible} onCheckedChange={v => setCatForm(f => ({ ...f, is_visible: !!v }))} /><span className="text-sm">Visible</span></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatForm(false)}>Annuler</Button>
            <Button onClick={saveCat}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag form dialog */}
      <Dialog open={showTagForm} onOpenChange={setShowTagForm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editingTagId ? "Modifier" : "Ajouter"} un tag</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom *</Label><Input value={tagForm.name} onChange={e => setTagForm(f => ({ ...f, name: e.target.value, slug: f.slug || generateSlug(e.target.value) }))} /></div>
            <div><Label>Slug</Label><Input value={tagForm.slug} onChange={e => setTagForm(f => ({ ...f, slug: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagForm(false)}>Annuler</Button>
            <Button onClick={saveTag}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge tag dialog */}
      <Dialog open={!!showMerge} onOpenChange={() => setShowMerge(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Fusionner le tag</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Fusionner "{tags.find(t => t.id === showMerge)?.name}" avec :</p>
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger><SelectValue placeholder="Choisir un tag cible" /></SelectTrigger>
            <SelectContent>
              {tags.filter(t => t.id !== showMerge).map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({tagUsageCounts[t.id] || 0})</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMerge(null)}>Annuler</Button>
            <Button onClick={() => showMerge && mergeTarget && mergeTag(showMerge, mergeTarget)} disabled={!mergeTarget}>Fusionner</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCategories;
