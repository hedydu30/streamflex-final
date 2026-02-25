import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Search,
  Loader2,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  User,
  ImageIcon,
  Film,
  ExternalLink,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  SkipForward,
  ShoppingCart,
  Link2,
} from "lucide-react";

// ── Platform config ───────────────────────────────────────────
const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onlyfans: { label: "OnlyFans", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  fansly: { label: "Fansly", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  patreon: { label: "Patreon", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  subscribestar: { label: "SubscribeStar", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30" },
  fanbox: { label: "Fanbox", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/30" },
  gumroad: { label: "Gumroad", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30" },
  discord: { label: "Discord", color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/30" },
};

function getPlatform(service: string) {
  return (
    PLATFORM_CONFIG[service?.toLowerCase()] || {
      label: service || "Unknown",
      color: "text-muted-foreground",
      bg: "bg-muted border-border",
    }
  );
}

// ── Types ─────────────────────────────────────────────────────
interface CoomerCreator {
  id: string;
  name: string;
  service: string;
  profile_url: string;
  profile_pic_url: string;
  cover_url: string;
  indexed?: string;
  updated?: string;
}

type QueueStatus = "pending" | "running" | "done" | "error" | "skipped";

interface QueueItem {
  id: string; // internal UUID
  creator: CoomerCreator;
  status: QueueStatus;
  progress?: { fetching: boolean; videos_found?: number; imported?: number; duplicates?: number; errors?: number };
  error?: string;
}

// ── Creator result card ───────────────────────────────────────
const CreatorCard = ({
  creator,
  queued,
  onAdd,
}: {
  creator: CoomerCreator;
  queued: boolean;
  onAdd: (c: CoomerCreator) => void;
}) => {
  const [imgErr, setImgErr] = useState(false);
  const [coverErr, setCoverErr] = useState(false);
  const platform = getPlatform(creator.service);

  return (
    <div
      className={cn(
        "relative rounded-xl border overflow-hidden transition-all duration-200 group",
        queued ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-border/80 hover:bg-accent/30",
      )}
    >
      {/* Cover banner */}
      <div className="h-20 bg-gradient-to-br from-muted/60 to-muted/30 overflow-hidden relative">
        {!coverErr ? (
          <img
            src={creator.cover_url}
            alt=""
            className="w-full h-full object-cover opacity-60"
            onError={() => setCoverErr(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />

        {/* Platform badge */}
        <div
          className={cn(
            "absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
            platform.bg,
            platform.color,
          )}
        >
          {platform.label}
        </div>
      </div>

      {/* Avatar + info */}
      <div className="px-3 pb-3">
        <div className="flex items-end gap-3 -mt-7 mb-2">
          <div className="w-14 h-14 rounded-xl border-2 border-card bg-muted overflow-hidden shadow-lg shrink-0">
            {!imgErr ? (
              <img
                src={creator.profile_pic_url}
                alt={creator.name}
                className="w-full h-full object-cover"
                onError={() => setImgErr(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                {(creator.name || "?")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <p className="font-semibold text-foreground text-sm truncate">{creator.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">{creator.id}</p>
          </div>
        </div>

        {/* Last update */}
        {creator.updated && (
          <p className="text-[10px] text-muted-foreground/60 mb-2">
            Mis à jour {new Date(creator.updated).toLocaleDateString("fr-FR")}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className={cn(
              "flex-1 h-7 text-xs gap-1.5",
              queued && "bg-primary/20 text-primary border border-primary/40",
            )}
            variant={queued ? "outline" : "default"}
            onClick={() => !queued && onAdd(creator)}
            disabled={queued}
          >
            {queued ? (
              <>
                <CheckCircle2 size={11} /> Dans la file
              </>
            ) : (
              <>
                <Plus size={11} /> Ajouter
              </>
            )}
          </Button>
          <a
            href={creator.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
};

// ── Queue item row ────────────────────────────────────────────
const QueueRow = ({
  item,
  onRemove,
  onSkip,
  onRetry,
}: {
  item: QueueItem;
  onRemove: (id: string) => void;
  onSkip: (id: string) => void;
  onRetry: (id: string) => void;
}) => {
  const platform = getPlatform(item.creator.service);
  const [imgErr, setImgErr] = useState(false);

  const statusConfig = {
    pending: { icon: Clock, color: "text-muted-foreground", label: "En attente" },
    running: { icon: Loader2, color: "text-primary animate-spin", label: "Import…" },
    done: { icon: CheckCircle2, color: "text-green-400", label: "Terminé" },
    error: { icon: AlertTriangle, color: "text-destructive", label: "Erreur" },
    skipped: { icon: SkipForward, color: "text-muted-foreground", label: "Ignoré" },
  }[item.status];

  const StatusIcon = statusConfig.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
        item.status === "running"
          ? "border-primary/30 bg-primary/5"
          : item.status === "done"
            ? "border-green-500/20 bg-green-500/5"
            : item.status === "error"
              ? "border-destructive/20 bg-destructive/5"
              : item.status === "skipped"
                ? "border-border/40 opacity-50"
                : "border-border bg-card",
      )}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-lg bg-muted overflow-hidden shrink-0">
        {!imgErr ? (
          <img
            src={item.creator.profile_pic_url}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
            {(item.creator.name || "?")[0].toUpperCase()}
          </div>
        )}
      </div>

      {/* Name + platform */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">{item.creator.name}</span>
          <span
            className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", platform.bg, platform.color)}
          >
            {platform.label}
          </span>
        </div>
        {/* Progress / error */}
        {item.status === "running" && item.progress && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.progress.fetching
              ? "Récupération des posts…"
              : item.progress.videos_found !== undefined
                ? `${item.progress.videos_found} vidéo(s) trouvée(s)…`
                : "Insertion en base…"}
          </p>
        )}
        {item.status === "done" && item.progress && (
          <p className="text-xs text-green-400 mt-0.5">
            ✓ {item.progress.imported} importée(s)
            {item.progress.duplicates ? ` · ${item.progress.duplicates} doublon(s)` : ""}
          </p>
        )}
        {item.status === "error" && <p className="text-xs text-destructive mt-0.5 truncate">{item.error}</p>}
      </div>

      {/* Status icon */}
      <StatusIcon size={15} className={statusConfig.color} />

      {/* Actions */}
      {item.status === "pending" && (
        <div className="flex gap-1">
          <button onClick={() => onSkip(item.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Ignorer"><SkipForward size={13} /></button>
          <button onClick={() => onRemove(item.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Supprimer"><X size={13} /></button>
        </div>
      )}
      {(item.status === "done" || item.status === "error" || item.status === "skipped") && (
        <button onClick={() => onRetry(item.id)} className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" title="Réessayer"><RefreshCw size={13} /></button>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────
const AdminCoomerSearch = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Search state
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CoomerCreator[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const abortRef = useRef(false);
  const [multiLinks, setMultiLinks] = useState("");
  const [addingLinks, setAddingLinks] = useState(false);

  // ── Search — via edge function (proxy serveur → coomer.st) ──
  // Recherche : parse l'URL coomer.st collée par l'utilisateur
  // Pas d'appel API — juste extraction service + ID depuis l'URL
  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    const found: CoomerCreator[] = [];

    // Détecter une URL coomer.st
    const urlMatch = q.match(/coomer\.(?:st|su|party)\/([\w]+)\/user\/([^/?\s]+)/i);
    if (urlMatch) {
      const [, svc, userId] = urlMatch;
      found.push({
        id: userId,
        name: userId,
        service: svc.toLowerCase(),
        indexed: undefined,
        updated: undefined,
        profile_url: `https://coomer.st/${svc}/user/${userId}`,
        profile_pic_url: `https://streamflex-proxy.hedydu30.workers.dev/img/icons/${svc}/${userId}`,
        cover_url: `https://streamflex-proxy.hedydu30.workers.dev/img/banners/${svc}/${userId}`,
      });
    } else {
      // Username sans URL → créer une entrée pour OnlyFans par défaut
      // L'utilisateur peut choisir le service dans le résultat
      const SERVICES = ["onlyfans", "fansly", "patreon", "subscribestar", "fanbox"];
      for (const svc of SERVICES) {
        found.push({
          id: q,
          name: q,
          service: svc,
          indexed: undefined,
          updated: undefined,
          profile_url: `https://coomer.st/${svc}/user/${q}`,
          profile_pic_url: `https://streamflex-proxy.hedydu30.workers.dev/img/icons/${svc}/${q}`,
          cover_url: `https://streamflex-proxy.hedydu30.workers.dev/img/banners/${svc}/${q}`,
        });
      }
    }

    setResults(found);
    setSearching(false);
  }, [query]);

  // ── Add to queue ────────────────────────────────────────────
  const addToQueue = useCallback((creator: CoomerCreator) => {
    setQueue((prev) => {
      if (prev.some((i) => i.creator.id === creator.id && i.creator.service === creator.service)) return prev;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          creator,
          status: "pending",
        },
      ];
    });
    setShowQueue(true);
  }, []);

  const addAllToQueue = useCallback(() => {
    const toAdd = results.filter((r) => !queue.some((i) => i.creator.id === r.id && i.creator.service === r.service));
    if (!toAdd.length) return;
    setQueue((prev) => [
      ...prev,
      ...toAdd.map((creator) => ({ id: crypto.randomUUID(), creator, status: "pending" as QueueStatus })),
    ]);
    setShowQueue(true);
    toast({ title: `${toAdd.length} créateur(s) ajouté(s) à la file` });
  }, [results, queue, toast]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const skipItem = useCallback((id: string) => {
    setQueue((prev) => prev.map((i) => (i.id === id ? { ...i, status: "skipped" } : i)));
  }, []);

  const clearDone = useCallback(() => {
    setQueue((prev) => prev.filter((i) => i.status === "pending" || i.status === "running"));
  }, []);

  const retryItem = useCallback((id: string) => {
    setQueue((prev) => prev.map((i) => i.id === id ? { ...i, status: "pending", error: undefined, progress: undefined } : i));
  }, []);

  const parseAndAddLinks = useCallback(async () => {
    const lines = multiLinks.replace(/
/g, "").split(/[
,]+/).map((l: string) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setAddingLinks(true);
    const toAdd: CoomerCreator[] = [];
    for (const line of lines) {
      const m = line.match(/coomer\.(st|su|party)\/(\w+)\/user\/([^/?\s]+)/i);
      if (m) {
        const svc = m[2].toLowerCase();
        const userId = m[3].trim();
        if (!queue.some((i) => i.creator.service === svc && i.creator.id === userId) &&
            !toAdd.some((c) => c.service === svc && c.id === userId)) {
          toAdd.push({ id: userId, name: userId, service: svc, profile_url: , profile_pic_url: , cover_url:  });
        }
      }
    }
    if (toAdd.length) {
      setQueue((prev) => [...prev, ...toAdd.map((creator) => ({ id: crypto.randomUUID(), creator, status: "pending" as QueueStatus }))]);
      setShowQueue(true);
      const dupes = lines.filter((l: string) => /coomer/i.test(l)).length - toAdd.length;
      toast({ title: , description: dupes > 0 ?  : undefined });
      setMultiLinks("");
    } else {
      toast({ title: "Aucun lien valide", description: "Format : https://coomer.st/onlyfans/user/xxx", variant: "destructive" });
    }
    setAddingLinks(false);
  }, [multiLinks, queue, toast]);

  // ── Helpers : fetch coomer.st depuis le browser ─────────────
  const fetchCreatorVideos = useCallback(async (svc: string, creatorId: string, onProgress: (msg: string) => void) => {
    const VIDEO_EXTS = ["mp4", "webm", "mkv", "avi", "mov", "m4v", "wmv", "flv"];
    const isVideo = (name: string) => VIDEO_EXTS.includes((name || "").split(".").pop()?.toLowerCase() || "");
    const videos: any[] = [];
    let offset = 0;
    let pages = 0;
    onProgress("Récupération des posts…");

    while (pages < 200) {
      // Via edge function Supabase — coomer.st bloque Cloudflare Workers sur /api/
      let posts: any[] | null = null;
      for (let att = 0; att < 8; att++) {
        const { data, error } = await supabase.functions.invoke("coomer-import", {
          body: { action: "fetch-posts", service: svc, creator_id: creatorId, offset },
        });
        if (error) {
          const wait = Math.min(2000 * Math.pow(2, att), 30000);
          onProgress(`Erreur edge — retry ${att + 1}...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (data?.error === "rate_limit") {
          const wait = Math.min(3000 * Math.pow(2, att), 60000);
          onProgress(`Rate limit — pause ${Math.round(wait / 1000)}s...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        posts = Array.isArray(data?.posts) ? data.posts : [];
        break;
      }

      if (!posts || posts.length === 0) break;

      for (const post of posts) {
        if (post.file?.path && isVideo(post.file.name || post.file.path)) {
          videos.push({ url: `https://streamflex-proxy.hedydu30.workers.dev/data${post.file.path}`, title: post.title || post.file.name || "Vidéo", thumbnail_url: `https://streamflex-proxy.hedydu30.workers.dev/thumbnail${post.file.path}`, metadata: { service: svc, post_id: post.id, published: post.published } });
        }
        for (const a of post.attachments || []) {
          if (a.path && isVideo(a.name || a.path)) {
            videos.push({ url: `https://streamflex-proxy.hedydu30.workers.dev/data${a.path}`, title: a.name || post.title || "Vidéo", thumbnail_url: null, metadata: { service: svc, post_id: post.id, published: post.published } });
          }
        }
      }

      onProgress(`${videos.length} vidéo(s) trouvée(s)… (page ${pages + 1})`);
      offset += 50;
      pages++;
      if (posts.length < 50) break;
      await new Promise(r => setTimeout(r, 300));
    }

    return videos;
  }, [supabase]);
  // ── Run queue — browser fetch + edge function insert ─────────
  const runQueue = useCallback(async () => {
    if (running || !user) return;
    abortRef.current = false;
    setRunning(true);

    const pending = queue.filter((i) => i.status === "pending");
    for (const item of pending) {
      if (abortRef.current) break;

      setQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "running", progress: { fetching: true } } : i)),
      );

      try {
        const { service, id: creatorId, name: creatorName } = item.creator;

        // ── Étape 1 : browser récupère les posts depuis coomer.st ──
        let videosFound = 0;
        const videos = await fetchCreatorVideos(service, creatorId, (msg) =>
          setQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, progress: { fetching: true, videos_found: videosFound } } : i)),
          ),
        );
        videosFound = videos.length;

        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, progress: { fetching: false, videos_found: videos.length } } : i,
          ),
        );

        if (videos.length === 0) {
          setQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: "done",
                    progress: { fetching: false, videos_found: 0, imported: 0, duplicates: 0, errors: 0 },
                  }
                : i,
            ),
          );
          toast({ title: `ℹ️ ${creatorName}`, description: "Aucune vidéo trouvée sur ce profil." });
          continue;
        }

        // ── Étape 2 : edge function insère en base (par chunks de 500) ──
        let imported = 0,
          duplicates = 0,
          errors = 0;
        const CHUNK = 500;
        for (let i = 0; i < videos.length; i += CHUNK) {
          if (abortRef.current) break;
          const chunk = videos.slice(i, i + CHUNK);
          const { data, error } = await supabase.functions.invoke("coomer-import?action=import-batch", {
            body: {
              videos: chunk.map((v) => ({ ...v, model_name: creatorName, source: "coomer" })),
              creator_service: service,
              creator_id: creatorId,
              creator_name: creatorName,
            },
          });
          if (error) {
            errors += chunk.length;
            continue;
          }
          imported += data?.imported || 0;
          duplicates += data?.duplicates || 0;
          errors += data?.errors || 0;
        }

        // ── Étape 3 : mettre à jour/créer le modèle ──
        await supabase.functions.invoke("coomer-import?action=import-creator", {
          body: { service, creator_id: creatorId, creator_name: creatorName, skip_fetch: true, cover_as_profile: true },
        });

        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "done",
                  progress: { fetching: false, videos_found: videos.length, imported, duplicates, errors },
                }
              : i,
          ),
        );

        toast({
          title: `✅ ${creatorName} importé`,
          description: `${imported} vidéo(s) · ${duplicates} doublon(s)`,
        });

        queryClient.invalidateQueries({ queryKey: ["models"] });
        queryClient.invalidateQueries({ queryKey: ["imported-videos"] });
      } catch (e: any) {
        setQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: e.message || "Erreur inconnue" } : i)),
        );
      }

      if (!abortRef.current) await new Promise((r) => setTimeout(r, 2000));
    }

    setRunning(false);
    abortRef.current = false;
  }, [running, queue, user, toast, queryClient, fetchCreatorVideos, supabase]);

  const stopQueue = useCallback(() => {
    abortRef.current = true;
    setRunning(false);
  }, []);

  // ── Computed ────────────────────────────────────────────────
  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const doneCount = queue.filter((i) => i.status === "done").length;
  const errorCount = queue.filter((i) => i.status === "error").length;
  const queuedIds = new Set(queue.map((i) => `${i.creator.service}:${i.creator.id}`));

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Search size={20} className="text-primary" />
          Recherche Coomer
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Collez l'URL coomer.st d'un créateur pour l'ajouter à la file d'import. Exemple :
          https://coomer.st/fansly/user/549327668156313600 ou https://coomer.st/onlyfans/user/zoeyt123
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* ── Left: Search + Results ── */}
        <div className="space-y-5">
          {/* Search bar */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  placeholder="URL ou username coomer.st"
                  className="pl-9 pr-8 h-10"
                  autoFocus
                />
              </div>
              {query && <button onClick={() => { setQuery(""); setResults([]); setHasSearched(false); setSearchError(null); }} className="absolute right-[116px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Effacer"><X size={14} /></button>}
              <Button onClick={search} disabled={searching || query.trim().length < 2} className="h-10 px-5 gap-2">
                {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                {searching ? "Recherche…" : "Rechercher"}
              </Button>
            </div>

            {/* Multi-liens */}
            <div className="space-y-2 pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5"><Link2 size={12} className="text-muted-foreground" /><span className="text-xs text-muted-foreground">Coller plusieurs liens (un par ligne)</span></div>
              <Textarea value={multiLinks} onChange={(e) => setMultiLinks(e.target.value)} placeholder={"https://coomer.st/onlyfans/user/xxx
https://coomer.st/fansly/user/yyy"} className="text-xs min-h-[72px] resize-none font-mono" rows={3} />
              {multiLinks.trim() && (
                <Button size="sm" onClick={parseAndAddLinks} disabled={addingLinks} className="w-full gap-2 h-8">
                  {addingLinks ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
                  Ajouter à la file ({multiLinks.replace(/
/g,"").split(/[
,]+/).filter((l: string) => /coomer/i.test(l)).length} lien(s))
                </Button>
              )}
            </div>

            {/* Platform legend */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => (
                <span
                  key={key}
                  className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", cfg.bg, cfg.color)}
                >
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>

          {/* Results */}
          {hasSearched && (
            <div className="space-y-3">
              {/* Results header */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {searchError ? (
                    <span className="text-muted-foreground">{searchError}</span>
                  ) : (
                    <span>{results.length} créateur(s) trouvé(s)</span>
                  )}
                </p>
                {results.length > 0 && (
                  <Button size="sm" variant="outline" onClick={addAllToQueue} className="h-7 text-xs gap-1.5">
                    <Plus size={12} /> Tout ajouter
                  </Button>
                )}
              </div>

              {/* Grid of creator cards */}
              {results.length > 0 ? (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {results.map((creator) => (
                    <CreatorCard
                      key={`${creator.service}:${creator.id}`}
                      creator={creator}
                      queued={queuedIds.has(`${creator.service}:${creator.id}`)}
                      onAdd={addToQueue}
                    />
                  ))}
                </div>
              ) : (
                !searching &&
                hasSearched && (
                  <div className="text-center py-12 text-muted-foreground">
                    <User size={40} className="mx-auto opacity-20 mb-3" />
                    <p className="text-sm">Aucun créateur trouvé</p>
                    <p className="text-xs mt-1">Essayez un nom différent ou plus court</p>
                  </div>
                )
              )}
            </div>
          )}

          {/* Initial state */}
          {!hasSearched && (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
              <Search size={48} className="mx-auto opacity-15 mb-4" />
              <p className="text-base font-medium">Tapez un nom pour commencer</p>
              <p className="text-sm mt-1 opacity-60">La recherche est effectuée sur tous les services coomer</p>
            </div>
          )}
        </div>

        {/* ── Right: Import queue ── */}
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Queue header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setShowQueue((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">File d'attente</span>
                {queue.length > 0 && (
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
                    {queue.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Stats badges */}
                {doneCount > 0 && (
                  <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">
                    ✓ {doneCount}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full">
                    ✗ {errorCount}
                  </span>
                )}
                {showQueue ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>

            {/* Queue list */}
            {showQueue && (
              <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto">
                {queue.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Film size={32} className="mx-auto opacity-20 mb-2" />
                    <p className="text-xs">File vide — ajoutez des créateurs depuis les résultats</p>
                  </div>
                ) : (
                  queue.map((item) => (
                    <QueueRow key={item.id} item={item} onRemove={removeFromQueue} onSkip={skipItem} onRetry={retryItem} />
                  ))
                )}
              </div>
            )}

            {/* Queue actions */}
            {queue.length > 0 && (
              <div className="px-3 pb-3 space-y-2">
                {!running ? (
                  <Button onClick={runQueue} disabled={pendingCount === 0} className="w-full gap-2">
                    <Download size={15} />
                    {pendingCount === 0 ? "Aucun élément en attente" : `Importer ${pendingCount} créateur(s)`}
                  </Button>
                ) : (
                  <Button onClick={stopQueue} variant="destructive" className="w-full gap-2">
                    <X size={15} /> Arrêter
                  </Button>
                )}

                {doneCount > 0 && !running && (
                  <Button onClick={clearDone} variant="outline" size="sm" className="w-full text-xs gap-1.5">
                    <Trash2 size={11} /> Effacer les terminés ({doneCount})
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Help box */}
          <div className="bg-muted/30 border border-border/60 rounded-xl p-4 space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-xs flex items-center gap-1.5">
              <Film size={12} className="text-primary" /> Ce qui est importé
            </p>
            <ul className="space-y-1 leading-relaxed">
              <li>✅ Photo de profil + bannière de couverture</li>
              <li>✅ Toutes les vidéos (.mp4, .webm, .mkv, …)</li>
              <li>✅ Miniatures disponibles</li>
              <li>✅ Ajout dans la page Modèles</li>
              <li>❌ Images (.jpg, .png, …)</li>
              <li>❌ Fichiers audio (.mp3, .m4a, …)</li>
            </ul>
            <p className="mt-2 text-[10px] opacity-60">
              Les doublons (vidéos déjà importées) sont automatiquement ignorés. La file traite les créateurs un par un
              pour éviter les limites de taux.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCoomerSearch;
