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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Send, Loader2, CheckCircle, XCircle, Upload } from "lucide-react";

interface Props {
  videoId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const AdminVideoForm = ({ videoId, onClose, onSaved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(!!videoId);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [fullDesc, setFullDesc] = useState("");
  const [durationH, setDurationH] = useState(0);
  const [durationM, setDurationM] = useState(0);
  const [durationS, setDurationS] = useState(0);
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [videoType, setVideoType] = useState("free");
  const [status, setStatus] = useState("draft");
  const [allowComments, setAllowComments] = useState(true);
  const [allowRatings, setAllowRatings] = useState(true);
  const [mainUrl, setMainUrl] = useState("");
  const [url1080, setUrl1080] = useState("");
  const [url720, setUrl720] = useState("");
  const [url480, setUrl480] = useState("");
  const [mirrorUrl, setMirrorUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailHoverUrl, setThumbnailHoverUrl] = useState("");
  const [urlTestStatus, setUrlTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  useEffect(() => {
    supabase.from("categories").select("*").order("display_order").then(({ data }) => {
      if (data) setCategories(data);
    });
    if (videoId) loadVideo();
  }, [videoId]);

  const loadVideo = async () => {
    const { data } = await supabase.from("imported_videos").select("*").eq("id", videoId!).single();
    if (data) {
      const v = data as any;
      setTitle(v.title || "");
      setShortDesc(v.short_description || "");
      setFullDesc(v.full_description || "");
      const dur = v.duration_seconds || 0;
      setDurationH(Math.floor(dur / 3600));
      setDurationM(Math.floor((dur % 3600) / 60));
      setDurationS(dur % 60);
      setCategoryId(v.category_id || "");
      setVideoType(v.video_type || "free");
      setStatus(v.status || "draft");
      setAllowComments(v.allow_comments ?? true);
      setAllowRatings(v.allow_ratings ?? true);
      setMainUrl(v.original_url || "");
      setUrl1080(v.url_1080p || "");
      setUrl720(v.url_720p || "");
      setUrl480(v.url_480p || "");
      setMirrorUrl(v.mirror_url || "");
      setThumbnailUrl(v.thumbnail_url || "");
      setThumbnailHoverUrl(v.thumbnail_hover_url || "");
      // Load tags
      const { data: vtags } = await supabase.from("video_tags").select("tag_id, tags(name)").eq("video_id", videoId!) as any;
      if (vtags) setTags(vtags.map((t: any) => t.tags?.name).filter(Boolean).join(", "));
    }
    setLoading(false);
  };

  const testUrl = async () => {
    if (!mainUrl.trim()) return;
    setUrlTestStatus("testing");
    try {
      const res = await fetch(mainUrl, { method: "HEAD", mode: "no-cors" });
      setUrlTestStatus("ok");
    } catch {
      setUrlTestStatus("fail");
    }
  };

  const handleSave = async (publishNow: boolean) => {
    if (!title.trim() || !mainUrl.trim()) {
      toast({ title: "Champs requis", description: "Le titre et l'URL vidéo sont obligatoires.", variant: "destructive" });
      return;
    }
    if (!user) return;
    setSaving(true);

    const durationSeconds = durationH * 3600 + durationM * 60 + durationS;
    const finalStatus = publishNow ? "published" : status;

    const videoData: any = {
      title: title.trim(),
      short_description: shortDesc.trim() || null,
      full_description: fullDesc.trim() || null,
      duration_seconds: durationSeconds || null,
      category_id: categoryId || null,
      video_type: videoType,
      status: finalStatus,
      allow_comments: allowComments,
      allow_ratings: allowRatings,
      original_url: mainUrl.trim(),
      url_1080p: url1080.trim() || null,
      url_720p: url720.trim() || null,
      url_480p: url480.trim() || null,
      mirror_url: mirrorUrl.trim() || null,
      thumbnail_url: thumbnailUrl.trim() || null,
      thumbnail_hover_url: thumbnailHoverUrl.trim() || null,
    };

    let savedVideoId = videoId;

    if (videoId) {
      const { error } = await supabase.from("imported_videos").update(videoData).eq("id", videoId);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else {
      videoData.user_id = user.id;
      videoData.source = "manual";
      const { data, error } = await supabase.from("imported_videos").insert(videoData).select("id").single();
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setSaving(false); return; }
      savedVideoId = data.id;
    }

    // Handle tags
    if (savedVideoId) {
      await supabase.from("video_tags").delete().eq("video_id", savedVideoId);
      const tagNames = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      for (const name of tagNames) {
        const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const { data: existing } = await supabase.from("tags").select("id").eq("slug", slug).maybeSingle();
        let tagId: string;
        if (existing) {
          tagId = existing.id;
        } else {
          const { data: newTag } = await supabase.from("tags").insert({ name, slug, user_id: user.id }).select("id").single();
          if (!newTag) continue;
          tagId = newTag.id;
        }
        await supabase.from("video_tags").insert({ video_id: savedVideoId, tag_id: tagId });
      }
    }

    toast({ title: videoId ? "Vidéo mise à jour" : "Vidéo ajoutée" });
    setSaving(false);
    onSaved();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-semibold text-foreground">{videoId ? "Modifier la vidéo" : "Ajouter une vidéo"}</h2>
      </div>

      {/* Basic info */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Informations de base</h3>
        <div className="space-y-3">
          <div>
            <Label>Titre *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la vidéo" maxLength={200} />
          </div>
          <div>
            <Label>Description courte</Label>
            <Textarea value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="Description courte (250 car. max)" maxLength={250} rows={2} />
            <p className="text-xs text-muted-foreground mt-1">{shortDesc.length}/250</p>
          </div>
          <div>
            <Label>Description complète</Label>
            <Textarea value={fullDesc} onChange={e => setFullDesc(e.target.value)} placeholder="Description détaillée..." rows={4} />
          </div>
          <div>
            <Label>Durée</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={99} value={durationH} onChange={e => setDurationH(parseInt(e.target.value) || 0)} className="w-20" />
              <span className="text-sm text-muted-foreground">h</span>
              <Input type="number" min={0} max={59} value={durationM} onChange={e => setDurationM(parseInt(e.target.value) || 0)} className="w-20" />
              <span className="text-sm text-muted-foreground">min</span>
              <Input type="number" min={0} max={59} value={durationS} onChange={e => setDurationS(parseInt(e.target.value) || 0)} className="w-20" />
              <span className="text-sm text-muted-foreground">sec</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Catégorie *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags</Label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="tag1, tag2, tag3..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <div className="flex gap-4 mt-1">
                {["free", "premium"].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="videoType" value={t} checked={videoType === t} onChange={() => setVideoType(t)} className="accent-primary" />
                    <span className="text-sm text-foreground capitalize">{t === "free" ? "Gratuit" : "Premium"}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Statut</Label>
              <div className="flex gap-4 mt-1">
                {["draft", "published"].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="accent-primary" />
                    <span className="text-sm text-foreground">{s === "draft" ? "Brouillon" : "Publié"}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={allowComments} onCheckedChange={(v) => setAllowComments(!!v)} />
              <span className="text-sm text-foreground">Autoriser commentaires</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={allowRatings} onCheckedChange={(v) => setAllowRatings(!!v)} />
              <span className="text-sm text-foreground">Autoriser notes</span>
            </label>
          </div>
        </div>
      </section>

      {/* URLs */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Liens vidéo</h3>
        <div className="space-y-3">
          <div>
            <Label>URL Vidéo Principale *</Label>
            <div className="flex gap-2">
              <Input value={mainUrl} onChange={e => { setMainUrl(e.target.value); setUrlTestStatus("idle"); }} placeholder="https://..." className="flex-1" />
              <Button variant="outline" onClick={testUrl} disabled={urlTestStatus === "testing" || !mainUrl.trim()}>
                {urlTestStatus === "testing" ? <Loader2 size={14} className="animate-spin" /> :
                 urlTestStatus === "ok" ? <CheckCircle size={14} className="text-emerald-500" /> :
                 urlTestStatus === "fail" ? <XCircle size={14} className="text-destructive" /> : null}
                <span className="ml-1">Tester</span>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>URL 1080p</Label><Input value={url1080} onChange={e => setUrl1080(e.target.value)} placeholder="https://..." /></div>
            <div><Label>URL 720p</Label><Input value={url720} onChange={e => setUrl720(e.target.value)} placeholder="https://..." /></div>
            <div><Label>URL 480p</Label><Input value={url480} onChange={e => setUrl480(e.target.value)} placeholder="https://..." /></div>
          </div>
          <div><Label>URL Miroir (backup)</Label><Input value={mirrorUrl} onChange={e => setMirrorUrl(e.target.value)} placeholder="https://..." /></div>
        </div>
      </section>

      {/* Media */}
      <section className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Médias</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Thumbnail principale *</Label>
            <Input value={thumbnailUrl} onChange={e => setThumbnailUrl(e.target.value)} placeholder="URL de l'image thumbnail..." />
            {thumbnailUrl && (
              <div className="mt-2 w-full aspect-video rounded overflow-hidden bg-muted">
                <img src={thumbnailUrl} alt="Preview" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
              </div>
            )}
          </div>
          <div>
            <Label>Thumbnail hover (optionnel)</Label>
            <Input value={thumbnailHoverUrl} onChange={e => setThumbnailHoverUrl(e.target.value)} placeholder="URL de l'image hover..." />
            {thumbnailHoverUrl && (
              <div className="mt-2 w-full aspect-video rounded overflow-hidden bg-muted">
                <img src={thumbnailHoverUrl} alt="Preview hover" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
          <Save size={14} className="mr-1" /> Sauvegarder brouillon
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving}>
          <Send size={14} className="mr-1" /> {saving ? "Enregistrement..." : "Publier maintenant"}
        </Button>
      </div>
    </div>
  );
};

export default AdminVideoForm;
