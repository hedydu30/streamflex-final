import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Search,
  User,
  Camera,
  Trash2,
  Film,
  Loader2,
  Pencil,
  Link,
  Upload,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GRADIENT_PALETTES = [
  { from: "from-violet-900", to: "to-purple-600", text: "text-fuchsia-400", border: "border-purple-500/40" },
  { from: "from-blue-900", to: "to-cyan-700", text: "text-cyan-300", border: "border-cyan-500/40" },
  { from: "from-rose-900", to: "to-pink-600", text: "text-pink-300", border: "border-pink-500/40" },
  { from: "from-amber-900", to: "to-yellow-600", text: "text-yellow-300", border: "border-yellow-500/40" },
  { from: "from-emerald-900", to: "to-teal-600", text: "text-emerald-300", border: "border-emerald-500/40" },
  { from: "from-indigo-900", to: "to-blue-600", text: "text-blue-300", border: "border-blue-500/40" },
  { from: "from-orange-900", to: "to-red-600", text: "text-orange-300", border: "border-orange-500/40" },
  { from: "from-fuchsia-900", to: "to-purple-500", text: "text-fuchsia-300", border: "border-fuchsia-500/40" },
  { from: "from-teal-900", to: "to-green-600", text: "text-teal-300", border: "border-teal-500/40" },
  { from: "from-slate-800", to: "to-zinc-600", text: "text-zinc-300", border: "border-zinc-500/40" },
  { from: "from-red-900", to: "to-rose-500", text: "text-rose-300", border: "border-rose-500/40" },
  { from: "from-cyan-900", to: "to-sky-600", text: "text-sky-300", border: "border-sky-500/40" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const PAGE_SIZE = 30;

const AdminVideoThumb = ({ video }: { video: any }) => {
  const [imgErr, setImgErr] = useState(false);
  const palette = GRADIENT_PALETTES[hashString(video.id) % GRADIENT_PALETTES.length];
  const titleAbbrev = (video.title || "V").substring(0, 3).toUpperCase();

  const formatDur = (s: number | null) => {
    if (!s) return "";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="group cursor-pointer">
      <div
        className={cn(
          "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
          "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
          imgErr || !video.thumbnail_url
            ? `${palette.border} ring-0 border`
            : "ring-border/30 group-hover:ring-primary/60",
        )}
      >
        {!imgErr && video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex flex-col items-center justify-center bg-gradient-to-br p-4",
              palette.from,
              palette.to,
            )}
          >
            <span
              className={cn("text-4xl md:text-5xl font-bold tracking-wider", palette.text)}
              style={{ textShadow: "0 0 20px currentColor" }}
            >
              {titleAbbrev}
            </span>
          </div>
        )}
        {video.duration_seconds && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-foreground/90 tabular-nums">
            {formatDur(video.duration_seconds)}
          </div>
        )}
        {video.duration_seconds && (
          <div className="absolute bottom-2 right-2 z-30 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-black/80 text-foreground/90 tabular-nums">
            {formatDur(video.duration_seconds)}
          </div>
        )}
        {video.source === "1fichier" && (
          <div className="absolute top-2 right-2 z-40 p-1.5 rounded-full bg-black/50 backdrop-blur-sm">
            <Film size={12} className="text-yellow-400" />
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-foreground text-xs font-medium truncate">{video.title}</p>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          {video.source && <span className="capitalize">{video.source}</span>}
          {video.file_size && (
            <>
              <span>•</span>
              <span>{(video.file_size / 1024 / 1024).toFixed(0)} Mo</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ModelRow {
  id: string;
  name: string;
  profile_image_url: string | null;
  source_platform: string | null;
  created_at: string;
  videoCount: number;
  firstVideoThumb: string | null;
}

const AdminModels = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Edit modal
  const [editModel, setEditModel] = useState<ModelRow | null>(null);
  const [editName, setEditName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Réanalyse des jaquettes
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ done: number; total: number } | null>(null);

  const reanalyzeModels = async () => {
    if (!user) return;
    setReanalyzing(true);

    // Récupérer tous les modèles sans photo de profil OU les réanalyser tous
    const { data: allModels } = await supabase
      .from("models")
      .select("id, name, source_platform, profile_image_url")
      .eq("user_id", user.id);

    if (!allModels || allModels.length === 0) {
      setReanalyzing(false);
      return;
    }

    setReanalyzeProgress({ done: 0, total: allModels.length });
    let updated = 0;

    for (let i = 0; i < allModels.length; i++) {
      const m = allModels[i];
      // Déduire la plateforme depuis source_platform ou essayer onlyfans par défaut
      const platform = m.source_platform && m.source_platform !== "custom" ? m.source_platform : "onlyfans";
      const coomerUrl = `https://img.coomer.st/icons/${platform}/${encodeURIComponent(m.name)}`;

      // Vérifier si l'URL coomer retourne une image valide
      try {
        const res = await fetch(coomerUrl, { method: "HEAD" });
        if (res.ok && res.headers.get("content-type")?.startsWith("image")) {
          await supabase
            .from("models")
            .update({ profile_image_url: coomerUrl } as any)
            .eq("id", m.id);
          updated++;
        }
      } catch {
        // Ignore les erreurs réseau
      }
      setReanalyzeProgress({ done: i + 1, total: allModels.length });
    }

    setReanalyzing(false);
    setReanalyzeProgress(null);
    await fetchModels();
    toast({ title: `${updated} jaquette(s) mise(s) à jour sur ${allModels.length} modèles` });
  };

  // Delete progress state
  const [deleteProgress, setDeleteProgress] = useState<{
    modelName: string;
    step: string;
    current: number;
    total: number;
    percent: number;
  } | null>(null);

  // Selected model detail
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelVideos, setModelVideos] = useState<any[]>([]);

  const fetchModels = async () => {
    if (!user) return;
    setLoading(true);

    // Paginer les modèles (limite Supabase = 1000 rows par requête)
    let modelsData: any[] = [];
    let mFrom = 0;
    let mHasMore = true;
    while (mHasMore) {
      const { data: mBatch } = await supabase
        .from("models")
        .select("*")
        .eq("user_id", user.id)
        .order("name")
        .range(mFrom, mFrom + 999);
      if (!mBatch || mBatch.length === 0) { mHasMore = false; break; }
      modelsData = [...modelsData, ...mBatch];
      mFrom += 1000;
      if (mBatch.length < 1000) mHasMore = false;
    }

    const rows: ModelRow[] = (modelsData || []).map((m: any) => ({
      ...m,
      videoCount: 0,
      firstVideoThumb: null,
    }));

    setModels(rows);
    setLoading(false);

    // Charger les counts en arrière-plan sans bloquer l'affichage
    loadVideoCountsInBackground(modelsData || []);
  };

  const loadVideoCountsInBackground = async (modelsData: any[]) => {
    if (!user || modelsData.length === 0) return;
    const modelIds = modelsData.map((m: any) => m.id);

    // Une seule requête COUNT par model_id via filter in
    const { data: countData } = await supabase
      .from("imported_videos")
      .select("model_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("model_id", modelIds.slice(0, 250)); // Supabase limite le .in() à ~250

    const countMap = new Map<string, number>();
    (countData || []).forEach((v: any) => {
      if (v.model_id) countMap.set(v.model_id, (countMap.get(v.model_id) || 0) + 1);
    });

    // Mettre à jour les counts sans re-fetch complet
    setModels(prev => prev.map(m => ({
      ...m,
      videoCount: countMap.get(m.id) || m.videoCount,
    })));
  };

  useEffect(() => {
    fetchModels();
  }, [user]);

  const filtered = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Load videos for selected model
  useEffect(() => {
    if (!selectedModelId || !user) {
      setModelVideos([]);
      return;
    }
    supabase
      .from("imported_videos")
      .select("id, title, thumbnail_url, duration_seconds, file_size, source, imported_at")
      .eq("model_id", selectedModelId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("imported_at", { ascending: false })
      .then(({ data }) => setModelVideos(data || []));
  }, [selectedModelId, user]);

  const saveProfile = async () => {
    if (!editModel) return;
    setUploading(true);
    const updates: any = {};
    if (editName.trim() && editName !== editModel.name) updates.name = editName.trim();
    if (imageUrl !== (editModel.profile_image_url || "")) updates.profile_image_url = imageUrl || null;
    if (imageUrl) updates.source_platform = detectPlatform(imageUrl);

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("models").update(updates).eq("id", editModel.id);
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      else {
        toast({ title: "Modèle mis à jour" });
        fetchModels();
      }
    }
    setEditModel(null);
    setUploading(false);
  };

  const handleFileUpload = async (file: File) => {
    if (!user || !editModel) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${editModel.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
    const { error } = await supabase.storage.from("model-avatars").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Erreur upload", variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: publicUrl } = supabase.storage.from("model-avatars").getPublicUrl(path);
    setImageUrl(publicUrl.publicUrl + "?t=" + Date.now());
    setUploading(false);
  };

  const handleCreate = async () => {
    if (!user || !newName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("models").insert({
      user_id: user.id,
      name: newName.trim(),
      profile_image_url: newImageUrl || null,
      source_platform: newImageUrl ? detectPlatform(newImageUrl) : null,
    });
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Modèle créé" });
      fetchModels();
      setShowCreate(false);
      setNewName("");
      setNewImageUrl("");
    }
    setCreating(false);
  };

  const handleDelete = useCallback(
    async (id: string, deleteVideos = true) => {
      const model = models.find((m) => m.id === id);
      const modelName = model?.name || "Modèle";

      if (!confirm(`Supprimer "${modelName}" et toutes ses ${model?.videoCount || 0} vidéos ?`)) return;

      setDeleteProgress({
        modelName,
        step: "Recherche des vidéos...",
        current: 0,
        total: model?.videoCount || 0,
        percent: 0,
      });

      try {
        // 1. Delete related data first (favorites, ratings, comments, progress, tags)
        setDeleteProgress((p) => (p ? { ...p, step: "Suppression des données liées..." } : p));

        // Fetch all video IDs for this model in batches
        let allVideoIds: string[] = [];
        let from = 0;
        const batchSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase
            .from("imported_videos")
            .select("id")
            .eq("model_id", id)
            .range(from, from + batchSize - 1);
          if (!data || data.length === 0) {
            hasMore = false;
            break;
          }
          allVideoIds = [...allVideoIds, ...data.map((v) => v.id)];
          from += batchSize;
          if (data.length < batchSize) hasMore = false;
        }

        const totalVideos = allVideoIds.length;

        // 2. Delete related records in batches
        const CHUNK = 200;
        for (let i = 0; i < allVideoIds.length; i += CHUNK) {
          const chunk = allVideoIds.slice(i, i + CHUNK);
          const done = Math.min(i + CHUNK, allVideoIds.length);
          const percent = Math.round((done / totalVideos) * 50); // First 50% for related data

          setDeleteProgress({
            modelName,
            step: `Nettoyage des données liées... (${done}/${totalVideos})`,
            current: done,
            total: totalVideos,
            percent,
          });

          await Promise.all([
            supabase.from("video_favorites").delete().in("video_id", chunk),
            supabase.from("video_ratings").delete().in("video_id", chunk),
            supabase.from("video_progress").delete().in("video_id", chunk),
            supabase.from("video_tags").delete().in("video_id", chunk),
            supabase.from("comments").delete().in("video_id", chunk),
          ]);
        }

        // 3. Delete videos in batches
        if (deleteVideos) {
          for (let i = 0; i < allVideoIds.length; i += CHUNK) {
            const chunk = allVideoIds.slice(i, i + CHUNK);
            const done = Math.min(i + CHUNK, allVideoIds.length);
            const percent = 50 + Math.round((done / totalVideos) * 45); // 50-95%

            setDeleteProgress({
              modelName,
              step: `Suppression des vidéos... (${done}/${totalVideos})`,
              current: done,
              total: totalVideos,
              percent,
            });

            await supabase.from("imported_videos").delete().in("id", chunk);
          }
        } else {
          // Just unlink
          await supabase.from("imported_videos").update({ model_id: null }).eq("model_id", id);
        }

        // 4. Delete model favorites
        setDeleteProgress({
          modelName,
          step: "Suppression des favoris modèle...",
          current: totalVideos,
          total: totalVideos,
          percent: 96,
        });
        await supabase.from("model_favorites").delete().eq("model_id", id);

        // 5. Delete model
        setDeleteProgress({
          modelName,
          step: "Suppression du modèle...",
          current: totalVideos,
          total: totalVideos,
          percent: 98,
        });
        await supabase.from("models").delete().eq("id", id);

        setDeleteProgress({ modelName, step: "Terminé !", current: totalVideos, total: totalVideos, percent: 100 });

        toast({
          title: `"${modelName}" supprimé`,
          description: `${totalVideos} vidéo(s) et données associées supprimées.`,
        });

        if (selectedModelId === id) setSelectedModelId(null);

        setTimeout(() => {
          setDeleteProgress(null);
          fetchModels();
        }, 1500);
      } catch (err) {
        console.error("Delete error:", err);
        toast({ title: "Erreur lors de la suppression", variant: "destructive" });
        setDeleteProgress(null);
      }
    },
    [models, user, selectedModelId, toast],
  );

  const detectPlatform = (url: string): string => {
    if (url.includes("onlyfans")) return "onlyfans";
    if (url.includes("fansly")) return "fansly";
    if (url.includes("coomer")) return "coomer";
    return "custom";
  };

  const formatDuration = (s: number | null) => {
    if (!s) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Delete progress overlay */}
      {deleteProgress && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 animate-fade-in">
            <div className="flex items-center gap-3">
              {deleteProgress.percent < 100 ? (
                <Loader2 size={24} className="animate-spin text-destructive" />
              ) : (
                <Check size={24} className="text-green-500" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-foreground font-semibold truncate">Suppression de "{deleteProgress.modelName}"</h3>
                <p className="text-sm text-muted-foreground">{deleteProgress.step}</p>
              </div>
            </div>
            <Progress value={deleteProgress.percent} className="h-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {deleteProgress.current}/{deleteProgress.total} vidéos traitées
              </span>
              <span className="font-mono tabular-nums">{deleteProgress.percent}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg sm:text-xl font-semibold text-foreground flex items-center gap-2">
          <User size={20} className="text-primary" /> Gestion des modèles ({models.length})
        </h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 pr-7 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive hover:text-destructive/80 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                if (!confirm(`Supprimer les ${models.length} modèles et TOUTES leurs vidéos ?`)) return;
                for (const m of models) {
                  await handleDelete(m.id);
                }
              }}
              className="gap-1 flex-1 sm:flex-none"
              disabled={!!deleteProgress}
            >
              <Trash2 size={14} /> <span className="hidden sm:inline">Tout supprimer</span> ({models.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={reanalyzeModels}
              disabled={reanalyzing || !!deleteProgress}
              className="gap-1 flex-1 sm:flex-none"
              title="Réanalyser les photos de profil depuis coomer.st"
            >
              {reanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="hidden sm:inline">
                {reanalyzing && reanalyzeProgress
                  ? `${reanalyzeProgress.done}/${reanalyzeProgress.total}`
                  : "Réanalyser"}
              </span>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1 flex-1 sm:flex-none">
              <Plus size={14} /> <span className="hidden sm:inline">Nouveau</span>
            </Button>
          </div>
        </div>
      </div>

      {selectedModelId ? (
        // Model detail view
        (() => {
          const model = models.find((m) => m.id === selectedModelId);
          if (!model) return null;
          return (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedModelId(null)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Retour
              </button>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-muted border border-border">
                  {model.profile_image_url ? (
                    <img src={model.profile_image_url} alt={model.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User size={24} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{model.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {model.videoCount} vidéo{model.videoCount > 1 ? "s" : ""}
                  </p>
                  {model.source_platform && (
                    <span className="text-xs text-primary capitalize">{model.source_platform}</span>
                  )}
                </div>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditModel(model);
                      setEditName(model.name);
                      setImageUrl(model.profile_image_url || "");
                    }}
                  >
                    <Pencil size={14} className="mr-1" /> Modifier
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(model.id)}>
                    <Trash2 size={14} className="mr-1" /> Supprimer
                  </Button>
                </div>
              </div>

              {/* Videos grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {modelVideos.map((video) => (
                  <AdminVideoThumb key={video.id} video={video} />
                ))}
                {modelVideos.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-8">Aucune vidéo rattachée</p>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        // Models grid
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {paginated.map((model) => {
              const imgSrc = model.profile_image_url || model.firstVideoThumb;
              const palette = GRADIENT_PALETTES[hashString(model.name) % GRADIENT_PALETTES.length];
              const nameAbbrev = (model.name || "M").substring(0, 2).toUpperCase();
              return (
                <div key={model.id} onClick={() => setSelectedModelId(model.id)} className="group cursor-pointer">
                  <div
                    className={cn(
                      "relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all duration-300",
                      "group-hover:shadow-lg group-hover:shadow-primary/20 group-hover:scale-[1.03]",
                      !imgSrc ? `${palette.border} ring-0 border` : "ring-border/30 group-hover:ring-primary/60",
                    )}
                  >
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={model.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={cn(
                          "w-full h-full flex flex-col items-center justify-center bg-gradient-to-br p-4",
                          palette.from,
                          palette.to,
                        )}
                      >
                        <span
                          className={cn("text-4xl md:text-5xl font-bold tracking-wider", palette.text)}
                          style={{ textShadow: "0 0 20px currentColor" }}
                        >
                          {nameAbbrev}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditModel(model);
                          setEditName(model.name);
                          setImageUrl(model.profile_image_url || "");
                        }}
                        className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"
                      >
                        <Pencil size={12} className="text-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(model.id);
                        }}
                        className="w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-destructive/80"
                      >
                        <Trash2 size={12} className="text-foreground" />
                      </button>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 inset-x-0 p-3">
                      <p className="text-foreground text-sm font-semibold truncate">{model.name}</p>
                      <p className="text-foreground/70 text-xs">
                        {model.videoCount} vidéo{model.videoCount > 1 ? "s" : ""}
                      </p>
                      {model.source_platform && (
                        <p className="text-primary text-[10px] capitalize">{model.source_platform}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">
                Page {page}/{totalPages} — {filtered.length} modèle{filtered.length > 1 ? "s" : ""}
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
        </>
      )}

      {/* Edit Model Dialog */}
      <Dialog
        open={!!editModel}
        onOpenChange={(open) => {
          if (!open) setEditModel(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier — {editModel?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-muted border-2 border-border">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User size={32} className="text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nom</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1">
                <Link size={12} /> URL de la photo
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1"
                />
                {editModel?.name && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => setImageUrl(`https://img.coomer.st/icons/onlyfans/${editModel.name}`)}
                    >
                      OF
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => setImageUrl(`https://img.coomer.st/icons/fansly/${editModel.name}`)}
                    >
                      Fansly
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={16} className="mr-2" /> Uploader une image
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModel(null)}>
              Annuler
            </Button>
            <Button onClick={saveProfile} disabled={uploading}>
              {uploading ? "..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Model Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau modèle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nom du modèle</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom..." />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Photo de profil (URL optionnelle)</label>
              <Input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminModels;