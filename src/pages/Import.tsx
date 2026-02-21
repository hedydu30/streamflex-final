import { useState, useMemo, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useBackendImportJobs } from "@/hooks/useBackendImportJobs";
import ImportJobsBar from "@/components/ImportJobsBar";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Download,
  FolderOpen,
  Film,
  Loader2,
  Trash2,
  ExternalLink,
  Key,
  Play,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckSquare,
  X,
  AlertTriangle,
  Upload,
  FileText,
  Users,
  Plus,
  Clock,
} from "lucide-react";
import FichierTokenManager from "@/components/FichierTokenManager";
import { Progress } from "@/components/ui/progress";
import { Navigate, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const PAGE_SIZE = 20; // pagination

// ── Browser Duration Scanner ─────────────────────────────────
const COOMER_PROXY = "https://still-disk-5cf6streamflex.hatem44655f.workers.dev";
function proxyVideoUrl(url: string): string {
  if (!url) return url;
  if (url.includes("coomer.st") || url.includes("coomer.su")) {
    return COOMER_PROXY + url.replace(/https?:\/\/[^/]+/, "");
  }
  return url;
}

function getBrowserVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.muted = true;
    vid.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;";
    document.body.appendChild(vid);
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      vid.removeEventListener("loadedmetadata", onMeta);
      vid.removeEventListener("error", onErr);
      try {
        vid.src = "";
        vid.load();
        document.body.removeChild(vid);
      } catch {}
    };
    const onMeta = () => {
      const d = vid.duration;
      cleanup();
      resolve(isFinite(d) && d > 0 ? Math.round(d) : null);
    };
    const onErr = () => {
      cleanup();
      resolve(null);
    };
    vid.addEventListener("loadedmetadata", onMeta, { once: true });
    vid.addEventListener("error", onErr, { once: true });
    vid.src = proxyVideoUrl(url);
  });
}

const Import = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" as const }).then(({ data }) => {
        setIsAdmin(!!data);
        setAdminChecked(true);
      });
    } else {
      setAdminChecked(true);
    }
  }, [user]);

  // 1fichier state
  const [fichierLoading, setFichierLoading] = useState(false);
  const [fichierFiles, setFichierFiles] = useState<any[]>([]);
  const [fichierFolders, setFichierFolders] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState(0);
  const [folderPath, setFolderPath] = useState<{ id: number; name: string }[]>([{ id: 0, name: "Racine" }]);
  const [folderCounts, setFolderCounts] = useState<Record<number, number>>({});

  // Coomer state
  const [coomerUrl, setCoomerUrl] = useState("");
  const [coomerModelName, setCoomerModelName] = useState("");
  const [coomerLoading, setCoomerLoading] = useState(false);
  const [coomerProfileLoading, setCoomerProfileLoading] = useState(false);
  const [coomerProfileUrl, setCoomerProfileUrl] = useState("");
  const [coomerVideos, setCoomerVideos] = useState<any[]>([]);
  const [coomerImporting, setCoomerImporting] = useState(false);
  const [coomerProgress, setCoomerProgress] = useState({ done: 0, total: 0, imported: 0, dupes: 0 });

  // Bulk import state - model groups
  interface ModelGroup {
    id: string;
    modelName: string;
    links: string;
  }
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([{ id: crypto.randomUUID(), modelName: "", links: "" }]);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkResults, setBulkResults] = useState<{
    imported: number;
    duplicates: number;
    errors: number;
    models: number;
  } | null>(null);
  const [failedChunks, setFailedChunks] = useState<{ index: number; videos: any[] }[]>([]);
  const [retryingErrors, setRetryingErrors] = useState(false);
  // Queue state
  const [queueItems, setQueueItems] = useState<
    {
      groupId: string;
      modelName: string;
      links: string[];
      status: "pending" | "processing" | "done" | "error";
      imported: number;
      errors: number;
    }[]
  >([]);
  const [queueRunning, setQueueRunning] = useState(false);

  // Management state
  const [page, setPage] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingVideo, setEditingVideo] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [folderImporting, setFolderImporting] = useState<number | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());
  const [bulkFolderImporting, setBulkFolderImporting] = useState(false);
  // Duration scanner state (backend)
  const [durationScanJob, setDurationScanJob] = useState<any>(null);
  const [browserScan, setBrowserScan] = useState<{ running: boolean; scanned: number; found: number; total: number }>({
    running: false,
    scanned: 0,
    found: 0,
    total: 0,
  });
  const browserScanAbort = useRef(false);
  const countAbortRef = useRef(false);
  const [folderImportProgress, setFolderImportProgress] = useState<{
    total: number;
    done: number;
    imported: number;
    dupes: number;
    folderName: string;
  } | null>(null);

  // Backend import jobs (persistent) - auto-scan durations on completion
  const backendJobs = useBackendImportJobs(user?.id, async (_jobId) => {
    // When a backend job completes, auto-trigger backend duration scan
    await refetchImported();
    await startBackendDurationScan();
  });

  // Imported videos query - batch fetch all (no 1000 limit)
  const { data: importedVideos = [], refetch: refetchImported } = useQuery({
    queryKey: ["imported-videos"],
    queryFn: async () => {
      let all: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("imported_videos")
          .select("*")
          .order("imported_at", { ascending: false })
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          all = [...all, ...data];
          from += batchSize;
          if (data.length < batchSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      return all;
    },
    enabled: !!user,
  });

  // Filtered + paginated
  const filteredVideos = useMemo(() => {
    if (!searchFilter.trim()) return importedVideos;
    const q = searchFilter.toLowerCase();
    return importedVideos.filter(
      (v: any) =>
        v.title.toLowerCase().includes(q) ||
        v.source.toLowerCase().includes(q) ||
        v.original_url.toLowerCase().includes(q),
    );
  }, [importedVideos, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / PAGE_SIZE));
  const paginatedVideos = filteredVideos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filter changes
  const handleSearchChange = (v: string) => {
    setSearchFilter(v);
    setPage(1);
    setSelectedIds(new Set());
  };

  // Realtime subscription for duration scan job updates
  useEffect(() => {
    if (!durationScanJob?.id) return;
    const channel = supabase
      .channel(`duration-scan-${durationScanJob.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "duration_scan_jobs",
          filter: `id=eq.${durationScanJob.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setDurationScanJob(updated);
          if (updated.status === "completed") {
            toast({
              title: "Scan terminé",
              description: `${updated.found_count} durée(s) trouvée(s) sur ${updated.scanned_count} scannée(s)`,
            });
            refetchImported();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [durationScanJob?.id]);

  // Load active scan job on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("duration_scan_jobs")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setDurationScanJob(data[0]);
      });
  }, [user?.id]);

  if (authLoading || !adminChecked) return null;
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === paginatedVideos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedVideos.map((v: any) => v.id)));
    }
  };

  // Duplicate-safe import helper
  const safeInsert = async (data: any) => {
    const { error } = await supabase.from("imported_videos").insert(data);
    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Doublon détecté",
          description: "Cette vidéo existe déjà dans vos imports.",
          variant: "destructive",
        });
        return false;
      }
      throw error;
    }
    return true;
  };

  // 1fichier functions

  const callOneFichier = async (action: string, body: any = {}) => {
    const token = localStorage.getItem("one_fichier_token");
    if (!token) {
      toast({ title: "Erreur", description: "Token non configuré", variant: "destructive" });
      return null;
    }
    const { data, error } = await supabase.functions.invoke(`one-fichier?action=${action}`, {
      body: { ...body, _token: token },
    });
    if (error) throw error;
    return data;
  };

  // Background folder counting — fully detached, never blocks UI or imports
  const fetchFolderCountsBackground = (folders: any[]) => {
    countAbortRef.current = true; // cancel any previous run
    setTimeout(async () => {
      countAbortRef.current = false;
      for (const folder of folders) {
        if (countAbortRef.current) break;
        try {
          const res = await callOneFichier("folder-count-recursive", { folder_id: folder.id });
          if (res?.count !== undefined) {
            setFolderCounts((prev) => ({ ...prev, [folder.id]: res.count }));
          }
        } catch {
          setFolderCounts((prev) => ({ ...prev, [folder.id]: -1 }));
        }
      }
    }, 0);
  };

  const loadFichierFolder = async (folderId: number = 0) => {
    setFichierLoading(true);
    setFolderCounts({});
    try {
      const [filesRes, foldersRes] = await Promise.all([
        callOneFichier("list-files", { folder_id: folderId }),
        callOneFichier("list-folders", { folder_id: folderId }),
      ]);
      const videoExts = ["mp4", "webm", "mkv", "avi", "mov", "m4v"];
      const videoFiles = (filesRes?.items || []).filter((f: any) => {
        const ext = f.filename?.split(".").pop()?.toLowerCase();
        return videoExts.includes(ext || "");
      });
      setFichierFiles(videoFiles);
      const folders = foldersRes?.sub_folders || [];
      setFichierFolders(folders);
      setCurrentFolderId(folderId);
      setFichierLoading(false);

      // Fire-and-forget: counts load in background, never block anything
      fetchFolderCountsBackground(folders);
    } catch (e: any) {
      toast({ title: "Erreur 1fichier", description: e.message, variant: "destructive" });
      setFichierLoading(false);
    }
  };

  const navigateToFolder = (folder: any) => {
    setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadFichierFolder(folder.id);
  };

  const navigateToPathIndex = (index: number) => {
    const target = folderPath[index];
    setFolderPath((prev) => prev.slice(0, index + 1));
    loadFichierFolder(target.id);
  };

  // Import all videos from a folder, create model from folder name, link everything

  const importEntireFolder = async (folder: any) => {
    const token = localStorage.getItem("one_fichier_token");
    if (!token) {
      toast({ title: "Token non configuré", variant: "destructive" });
      return;
    }

    setFolderImporting(folder.id);
    try {
      const modelName = folder.name.trim();
      let modelId: string | null = null;

      if (modelName) {
        const { data: existingModel } = await supabase
          .from("models")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", modelName)
          .maybeSingle();

        if (existingModel) {
          modelId = existingModel.id;
        } else {
          const { data: newModel, error: modelError } = await supabase
            .from("models")
            .insert({ user_id: user.id, name: modelName, source_platform: "1fichier" })
            .select("id")
            .single();
          if (modelError) throw modelError;
          modelId = newModel.id;
        }
      }

      // Create job immediately — the edge function will fetch files server-side
      const { data: job, error: jobError } = await supabase
        .from("import_jobs")
        .insert({
          user_id: user.id,
          folder_name: modelName || folder.name,
          source: "1fichier",
          model_id: modelId,
          model_name: modelName || null,
          total_files: 0, // Will be updated by edge function
          files_data: [],
          status: "pending",
          fichier_folder_id: folder.id,
          fichier_token: token,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Trigger the edge function (fire-and-forget)
      supabase.functions
        .invoke("process-import-batch", {
          body: { job_id: job.id },
        })
        .catch((e) => console.error("Failed to trigger job:", e));

      toast({
        title: `"${modelName}" ajouté à la file d'attente`,
        description: "Récupération des fichiers et import en cours côté serveur",
      });

      // Force refetch jobs
      backendJobs.refetch();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setFolderImporting(null);
    }
  };

  const importFichierVideo = async (file: any) => {
    try {
      const ok = await safeInsert({
        user_id: user.id,
        source: "1fichier",
        title: file.filename || "Vidéo 1fichier",
        original_url: file.url || `https://1fichier.com/?${file.filename}`,
        file_size: file.size || null,
        format: file.filename?.split(".").pop() || null,
        metadata: file,
      });
      if (ok) {
        toast({ title: "Importé !", description: file.filename });
        refetchImported();
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // Coomer functions
  const parseCoomerUrl = async () => {
    if (!coomerUrl.trim()) return;
    if (!coomerModelName.trim()) {
      toast({
        title: "Nom du modèle requis",
        description: "Veuillez remplir le nom du modèle avant d'importer.",
        variant: "destructive",
      });
      return;
    }
    setCoomerLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coomer-import", {
        body: { action: "parse-url", url: coomerUrl },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCoomerVideos(data.videos || []);
      if ((data.videos || []).length === 0) {
        toast({ title: "Aucune vidéo trouvée" });
      }
    } catch (e: any) {
      toast({ title: "Erreur Coomer", description: e.message, variant: "destructive" });
    } finally {
      setCoomerLoading(false);
    }
  };

  // Helper: find or create model by name
  const findOrCreateModel = async (modelName: string): Promise<string | null> => {
    if (!modelName.trim() || !user) return null;
    const name = modelName.trim();
    const { data: existing } = await supabase
      .from("models")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", name)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
      .from("models")
      .insert({ user_id: user.id, name, source_platform: "coomer" })
      .select("id")
      .single();
    if (error) {
      console.error("Model creation error:", error);
      return null;
    }
    return created.id;
  };

  const importCoomerVideo = async (video: any) => {
    try {
      if (!coomerModelName.trim()) {
        toast({ title: "Nom du modèle requis", variant: "destructive" });
        return;
      }
      const modelId = await findOrCreateModel(coomerModelName);
      const ok = await safeInsert({
        user_id: user.id,
        source: "coomer",
        title: video.title || "Vidéo Coomer",
        original_url: video.url,
        download_url: video.url,
        thumbnail_url: video.thumbnail_url || null,
        metadata: video.metadata || {},
        model_id: modelId,
      });
      if (ok) {
        toast({ title: "Importé !", description: video.title });
        refetchImported();
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const importAllCoomerVideos = async () => {
    setCoomerImporting(true);
    setCoomerProgress({ done: 0, total: coomerVideos.length, imported: 0, dupes: 0 });

    if (!coomerModelName.trim()) {
      toast({
        title: "Nom du modèle requis",
        description: "Veuillez remplir le nom du modèle avant d'importer.",
        variant: "destructive",
      });
      setCoomerImporting(false);
      return;
    }
    const modelId = await findOrCreateModel(coomerModelName);
    if (!modelId) {
      toast({ title: "Erreur", description: "Impossible de créer le modèle", variant: "destructive" });
      setCoomerImporting(false);
      return;
    }

    let imported = 0;
    let dupes = 0;
    for (let i = 0; i < coomerVideos.length; i++) {
      const video = coomerVideos[i];
      try {
        const ok = await safeInsert({
          user_id: user.id,
          source: "coomer",
          title: video.title || "Vidéo Coomer",
          original_url: video.url,
          download_url: video.url,
          thumbnail_url: video.thumbnail_url || null,
          metadata: video.metadata || {},
          model_id: modelId,
        });
        if (ok) imported++;
        else dupes++;
      } catch {
        dupes++;
      }
      setCoomerProgress({ done: i + 1, total: coomerVideos.length, imported, dupes });
    }
    toast({
      title: "Import terminé",
      description: `${imported} importée(s)${dupes > 0 ? `, ${dupes} doublon(s) ignoré(s)` : ""}`,
    });
    setCoomerVideos([]);
    setCoomerImporting(false);
    setCoomerProgress({ done: 0, total: 0, imported: 0, dupes: 0 });
    // Auto-scan durations (backend)
    startBackendDurationScan();
  };

  // Import full coomer profile (videos + profile pic + banner)
  const importCoomerProfile = async () => {
    if (!coomerProfileUrl.trim()) return;
    setCoomerProfileLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("coomer-import", {
        body: { action: "parse-profile", url: coomerProfileUrl, model_name: coomerModelName.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: `Profil importé : ${data.model_name}`,
        description: `${data.imported} vidéo(s), ${data.duplicates} doublon(s)${data.errors > 0 ? `, ${data.errors} erreur(s)` : ""}`,
      });
      setCoomerProfileUrl("");
      setCoomerModelName("");
      // Auto-scan durations (backend)
      startBackendDurationScan();
    } catch (e: any) {
      toast({ title: "Erreur import profil", description: e.message, variant: "destructive" });
    } finally {
      setCoomerProfileLoading(false);
    }
  };

  // Model group helpers
  const addModelGroup = () => {
    setModelGroups((prev) => [...prev, { id: crypto.randomUUID(), modelName: "", links: "" }]);
  };
  const removeModelGroup = (id: string) => {
    setModelGroups((prev) => prev.filter((g) => g.id !== id));
  };
  const updateModelGroup = (id: string, field: keyof ModelGroup, value: string) => {
    setModelGroups((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };
  const handleGroupPaste = (groupId: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const newUrls = pasted.match(/https?:\/\/[^\s,;|<>"']+/gi);
    if (!newUrls || newUrls.length === 0) return;

    const group = modelGroups.find((g) => g.id === groupId);
    const existingLines = (group?.links || "")
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const existingSet = new Set(existingLines);

    // Deduplicate against existing links
    const unique = newUrls.filter((u) => !existingSet.has(u));
    if (unique.length === 0) {
      toast({ title: "Doublons ignorés", description: `${newUrls.length} lien(s) déjà présent(s)` });
      return;
    }

    const merged = [...existingLines, ...unique];
    updateModelGroup(groupId, "links", merged.join("\n"));

    if (newUrls.length > unique.length) {
      toast({
        title: `${unique.length} lien(s) ajouté(s)`,
        description: `${newUrls.length - unique.length} doublon(s) ignoré(s)`,
      });
    }

    // Auto-resize textarea after paste
    setTimeout(() => {
      const ta = e.target as HTMLTextAreaElement;
      if (ta) {
        ta.style.height = "auto";
        ta.style.height = ta.scrollHeight + "px";
      }
    }, 0);
  };

  // Queue-based bulk import
  const handleBulkImport = async () => {
    // Validate: all groups with links must have a model name
    const groupsWithLinks = modelGroups.filter((g) => g.links.trim());
    const missingModel = groupsWithLinks.find((g) => !g.modelName.trim());
    if (missingModel) {
      toast({
        title: "Nom du modèle requis",
        description: "Chaque groupe de liens doit avoir un nom de modèle.",
        variant: "destructive",
      });
      return;
    }

    // Gather all groups with links
    const groups = [...groupsWithLinks];

    // Also add file content as a group if present
    if (bulkFile) {
      const fileText = await bulkFile.text();
      if (fileText.trim()) {
        groups.push({ id: "file", modelName: "", links: fileText });
      }
    }
    if (groups.length === 0) return;

    setBulkImporting(true);
    setBulkResults(null);

    let totalCreated = 0;
    let totalLinks = 0;

    // Create a backend job for each model group
    for (const g of groups) {
      const lines = g.links
        .split(/[\n\r]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;

      const videos = lines.map((url) => {
        const profileMatch = url.match(/coomer\.(su|party|st)\/(\w+)\/user\/([^/]+)/);
        const modelName = g.modelName.trim() || (profileMatch ? profileMatch[3] : null);
        let title = url.split("/").pop()?.split("?")[0] || "Vidéo";
        try {
          const fParam = new URL(url).searchParams.get("f");
          if (fParam) title = fParam;
        } catch {}
        const isCoomer = /coomer\./i.test(url);
        return {
          url,
          title,
          thumbnail_url: null,
          model_name: modelName,
          source: isCoomer ? "coomer" : "direct",
          download_url: url,
          metadata: {
            source: isCoomer ? "coomer_bulk" : "direct_bulk",
            original_url: url,
            ...(modelName && { model_name: modelName }),
          },
        };
      });

      // Create/find model if name given
      let modelId: string | null = null;
      const modelName = g.modelName.trim();
      if (modelName && user) {
        const { data: existing } = await supabase
          .from("models")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", modelName)
          .maybeSingle();

        if (existing) {
          modelId = existing.id;
        } else {
          const { data: created } = await supabase
            .from("models")
            .insert({ user_id: user.id, name: modelName, source_platform: "bulk" })
            .select("id")
            .single();
          modelId = created?.id || null;
        }
      }

      const job = await backendJobs.createJob({
        folderName: modelName || `Import ${lines.length} liens`,
        source: "bulk",
        modelId,
        modelName: modelName || null,
        files: videos,
      });

      if (job) {
        totalCreated++;
        totalLinks += lines.length;
      }
    }

    setBulkImporting(false);
    toast({
      title: `${totalCreated} job(s) créé(s)`,
      description: `${totalLinks} liens en traitement backend — vous pouvez fermer le navigateur`,
    });
  };

  // Removed old processChunks - now handled inline in handleBulkImport with parallel processing

  const retryFailedChunks = async () => {
    if (failedChunks.length === 0) return;
    setRetryingErrors(true);
    setBulkImporting(true);
    const allFailedVideos = failedChunks.flatMap((c) => c.videos);
    setFailedChunks([]);
    setBulkTotal(allFailedVideos.length);
    setBulkProgress(0);

    const CHUNK_SIZE = 500;
    const CONCURRENCY = 3;
    const chunks = [];
    for (let i = 0; i < allFailedVideos.length; i += CHUNK_SIZE) {
      chunks.push(allFailedVideos.slice(i, i + CHUNK_SIZE));
    }

    let totalImported = 0,
      totalDupes = 0,
      totalErrors = 0,
      totalModels = 0,
      processed = 0;

    for (let ci = 0; ci < chunks.length; ci += CONCURRENCY) {
      const batch = chunks.slice(ci, ci + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((chunk) =>
          supabase.functions.invoke("coomer-import", { body: { action: "import-batch", videos: chunk } }),
        ),
      );
      for (let ri = 0; ri < results.length; ri++) {
        const res = results[ri];
        const chunk = batch[ri];
        if (res.status === "fulfilled" && res.value.data) {
          const d = res.value.data;
          totalImported += d.imported || 0;
          totalDupes += d.duplicates || 0;
          totalModels += d.models_created || 0;
        } else {
          totalErrors += chunk.length;
          setFailedChunks((prev) => [...prev, { index: ci + ri, videos: chunk }]);
        }
        processed += chunk.length;
        setBulkProgress(processed);
      }
    }

    setBulkResults({ imported: totalImported, duplicates: totalDupes, errors: totalErrors, models: totalModels });
    toast({ title: "Relance terminée", description: `${totalImported} importée(s)` });
    setRetryingErrors(false);
    setBulkImporting(false);
    refetchImported();
  };

  // Management functions
  const deleteImported = async (id: string) => {
    const { error } = await supabase.from("imported_videos").delete().eq("id", id);
    if (!error) refetchImported();
    else toast({ title: "Erreur", description: error.message, variant: "destructive" });
  };

  // Backend duration scan
  const startBackendDurationScan = async () => {
    if (!user?.id) return;
    const missingCount = importedVideos.filter((v: any) => !v.duration_seconds).length;
    if (missingCount === 0) {
      toast({ title: "Toutes les vidéos ont déjà une durée !" });
      return;
    }
    const { data: job, error } = await supabase
      .from("duration_scan_jobs")
      .insert({ user_id: user.id, total_videos: missingCount, status: "pending" })
      .select()
      .single();

    if (error || !job) {
      toast({ title: "Erreur", description: error?.message || "Impossible de créer le job", variant: "destructive" });
      return;
    }
    setDurationScanJob(job);
    supabase.functions.invoke("scan-durations", { body: { job_id: job.id } }).catch(() => {});
    toast({ title: "Scan des durées lancé en arrière-plan" });
  };

  const startBrowserDurationScan = async () => {
    if (browserScan.running || !user?.id) return;
    const missing = importedVideos.filter((v: any) => !v.duration_seconds);
    if (missing.length === 0) {
      toast({ title: "Toutes les vidéos ont déjà une durée !" });
      return;
    }
    browserScanAbort.current = false;
    setBrowserScan({ running: true, scanned: 0, found: 0, total: missing.length });
    let found = 0;
    for (let i = 0; i < missing.length; i++) {
      if (browserScanAbort.current) break;
      const v = missing[i];
      const url = v.download_url || v.original_url;
      if (!url) {
        setBrowserScan((s) => ({ ...s, scanned: i + 1 }));
        continue;
      }
      const dur = await getBrowserVideoDuration(url);
      if (dur) {
        found++;
        await supabase.from("imported_videos").update({ duration_seconds: dur }).eq("id", v.id);
      }
      setBrowserScan({ running: true, scanned: i + 1, found, total: missing.length });
    }
    setBrowserScan((s) => ({ ...s, running: false }));
    toast({ title: `Scan terminé — ${found} durée(s) trouvée(s)` });
  };

  const stopBrowserScan = () => {
    browserScanAbort.current = true;
    setBrowserScan((s) => ({ ...s, running: false }));
  };

  const cancelDurationScan = async () => {
    if (!durationScanJob) return;
    await supabase.from("duration_scan_jobs").update({ status: "cancelled" }).eq("id", durationScanJob.id);
    setDurationScanJob(null);
    toast({ title: "Scan annulé" });
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("imported_videos").delete().in("id", ids);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${ids.length} vidéo(s) supprimée(s)` });
      setSelectedIds(new Set());
      refetchImported();
    }
    setBulkDeleting(false);
    setShowDeleteConfirm(false);
  };

  const startEdit = (video: any) => {
    setEditingVideo(video);
    setEditTitle(video.title);
  };

  const saveEdit = async () => {
    if (!editingVideo || !editTitle.trim()) return;
    const { error } = await supabase
      .from("imported_videos")
      .update({ title: editTitle.trim() })
      .eq("id", editingVideo.id);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Ce titre existe déjà", variant: "destructive" });
      } else {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      }
      return;
    }
    toast({ title: "Modifié !" });
    setEditingVideo(null);
    refetchImported();
  };

  const allSelected = paginatedVideos.length > 0 && selectedIds.size === paginatedVideos.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <h1 className="text-3xl font-bold text-foreground mb-4">Importer des vidéos</h1>

        {/* Persistent backend import queue — always visible above everything */}
        {backendJobs.jobs.length > 0 && (
          <Card className="mb-6 border-primary/30 bg-card shadow-md">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Download size={18} className="text-primary" />
                Tâches d'import
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({backendJobs.activeJobs.length} en cours, {backendJobs.completedJobs.length} terminé
                  {backendJobs.completedJobs.length > 1 ? "s" : ""})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <ImportJobsBar
                jobs={backendJobs.jobs}
                onResume={backendJobs.resumeJob}
                onRestart={backendJobs.restartJob}
                onPause={backendJobs.pauseJob}
                onRemove={backendJobs.removeJob}
                onClearCompleted={backendJobs.clearCompleted}
                onClearAll={backendJobs.clearAll}
                onPauseAll={backendJobs.pauseAll}
                onResumeAll={backendJobs.resumeAll}
              />
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="1fichier" className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="1fichier">1fichier</TabsTrigger>
            <TabsTrigger value="coomer">Coomer</TabsTrigger>
            <TabsTrigger value="bulk">Import massif</TabsTrigger>
            <TabsTrigger value="imported">Mes imports ({importedVideos.length})</TabsTrigger>
          </TabsList>

          {/* 1FICHIER TAB */}
          <TabsContent value="1fichier" className="space-y-6">
            {/* Token management */}
            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                <FichierTokenManager
                  onTokenValidated={(valid) => {
                    if (valid && fichierFiles.length === 0 && fichierFolders.length === 0 && !fichierLoading) {
                      loadFichierFolder(0);
                    }
                  }}
                />
              </CardContent>
            </Card>

            {/* Folder browser — always visible when token exists */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <FolderOpen size={20} className="text-primary" />
                    Explorateur de fichiers
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => loadFichierFolder(currentFolderId)}
                    disabled={fichierLoading}
                    className="gap-1"
                  >
                    {fichierLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Actualiser
                  </Button>
                </div>
                {/* Breadcrumb */}
                <div className="flex flex-wrap gap-1 text-sm mt-2">
                  {folderPath.map((p, i) => (
                    <span key={p.id} className="flex items-center">
                      {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
                      <button
                        onClick={() => navigateToPathIndex(i)}
                        className="text-primary hover:underline font-medium"
                      >
                        {p.name}
                      </button>
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {fichierLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="animate-spin text-primary" size={28} />
                    <p className="text-sm text-muted-foreground">Récupération de la liste des dossiers...</p>
                  </div>
                ) : fichierFiles.length === 0 && fichierFolders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                    <FolderOpen size={32} className="opacity-50" />
                    <p className="text-sm">Cliquez sur « Actualiser » pour charger vos dossiers 1fichier</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Select all + Import selected bar */}
                    {fichierFolders.length > 0 && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <Checkbox
                          checked={selectedFolderIds.size === fichierFolders.length && fichierFolders.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedFolderIds(new Set(fichierFolders.map((f: any) => f.id)));
                            else setSelectedFolderIds(new Set());
                          }}
                        />
                        <span className="text-sm text-foreground flex-1">
                          {selectedFolderIds.size > 0
                            ? `${selectedFolderIds.size} dossier(s) sélectionné(s)`
                            : `${fichierFolders.length} dossier(s) — Tout sélectionner`}
                        </span>
                        {selectedFolderIds.size > 0 && (
                          <Button
                            size="sm"
                            onClick={async () => {
                              setBulkFolderImporting(true);
                              const selected = fichierFolders.filter((f: any) => selectedFolderIds.has(f.id));
                              for (const folder of selected) {
                                await importEntireFolder(folder);
                              }
                              setSelectedFolderIds(new Set());
                              setBulkFolderImporting(false);
                            }}
                            disabled={bulkFolderImporting}
                            className="gap-1"
                          >
                            {bulkFolderImporting ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                            Importer {selectedFolderIds.size} dossier(s)
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Folder list */}
                    {fichierFolders.map((folder: any) => (
                      <div
                        key={folder.id}
                        className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 hover:bg-accent/50 transition-colors border border-transparent hover:border-border"
                      >
                        <Checkbox
                          checked={selectedFolderIds.has(folder.id)}
                          onCheckedChange={(checked) => {
                            setSelectedFolderIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(folder.id);
                              else next.delete(folder.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div
                          className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                          onClick={() => navigateToFolder(folder)}
                        >
                          <FolderOpen size={20} className="text-primary shrink-0" />
                          <span className="text-foreground font-medium truncate">{folder.name}</span>
                          {folderCounts[folder.id] !== undefined && folderCounts[folder.id] >= 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-semibold shrink-0">
                              {folderCounts[folder.id]} vidéo{folderCounts[folder.id] !== 1 ? "s" : ""}
                            </span>
                          )}
                          {folderCounts[folder.id] === undefined && Object.keys(folderCounts).length > 0 && (
                            <Loader2 size={12} className="animate-spin text-muted-foreground shrink-0" />
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            importEntireFolder(folder);
                          }}
                          disabled={folderImporting === folder.id}
                          className="gap-1.5 shrink-0"
                        >
                          {folderImporting === folder.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                          Importer
                          {folderCounts[folder.id] !== undefined && folderCounts[folder.id] >= 0
                            ? ` (${folderCounts[folder.id]})`
                            : ""}
                        </Button>
                      </div>
                    ))}

                    {/* Individual files */}
                    {fichierFiles.length > 0 && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">
                          {fichierFiles.length} fichier(s) vidéo dans ce dossier
                        </p>
                        {fichierFiles.map((file: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 mb-1.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <Film size={18} className="text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-foreground text-sm truncate">{file.filename}</p>
                                <p className="text-muted-foreground text-xs">
                                  {file.size ? `${(file.size / 1024 / 1024).toFixed(1)} Mo` : ""}
                                </p>
                              </div>
                            </div>
                            <Button size="sm" onClick={() => importFichierVideo(file)} className="gap-1 shrink-0">
                              <Download size={14} /> Importer
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {fichierFiles.length === 0 && fichierFolders.length === 0 && (
                      <p className="text-muted-foreground text-center py-6">Aucun fichier vidéo dans ce dossier</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Folder import progress */}
            {folderImportProgress && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground font-medium flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      Import : {folderImportProgress.folderName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {folderImportProgress.done} / {folderImportProgress.total}
                    </span>
                  </div>
                  <Progress
                    value={
                      folderImportProgress.total > 0
                        ? (folderImportProgress.done / folderImportProgress.total) * 100
                        : 0
                    }
                    className="h-3"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="bg-card rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">{folderImportProgress.total}</p>
                      <p className="text-xs text-muted-foreground">Total fichiers</p>
                    </div>
                    <div className="bg-card rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-primary">{folderImportProgress.imported}</p>
                      <p className="text-xs text-muted-foreground">Importés</p>
                    </div>
                    <div className="bg-card rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-foreground">
                        {folderImportProgress.total - folderImportProgress.done}
                      </p>
                      <p className="text-xs text-muted-foreground">Restants</p>
                    </div>
                    <div className="bg-card rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-muted-foreground">{folderImportProgress.dupes}</p>
                      <p className="text-xs text-muted-foreground">Doublons</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* COOMER TAB */}
          <TabsContent value="coomer" className="space-y-4">
            {/* Profile import */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users size={20} /> Import profil complet
                </CardTitle>
                <CardDescription>
                  Collez l'URL d'un profil coomer pour importer toutes les vidéos, la photo de profil et la couverture
                  du modèle automatiquement.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Nom du modèle *"
                    value={coomerModelName}
                    onChange={(e) => setCoomerModelName(e.target.value)}
                    required
                    className={cn("sm:max-w-xs", !coomerModelName.trim() && "border-destructive")}
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://coomer.st/onlyfans/user/model_name"
                    value={coomerProfileUrl}
                    onChange={(e) => setCoomerProfileUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={importCoomerProfile} disabled={coomerProfileLoading || !coomerProfileUrl.trim()}>
                    {coomerProfileLoading ? (
                      <Loader2 size={16} className="animate-spin mr-1" />
                    ) : (
                      <Download size={16} className="mr-1" />
                    )}
                    Importer le profil
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Manual links */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Importer des liens vidéo</CardTitle>
                <CardDescription>
                  Collez un ou plusieurs liens (un par ligne) : liens directs vidéo (.mp4, .m4v, etc.), posts ou profils
                  coomer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Nom du modèle *"
                    value={coomerModelName}
                    onChange={(e) => setCoomerModelName(e.target.value)}
                    required
                    className={cn("max-w-xs", !coomerModelName.trim() && "border-destructive")}
                  />
                  <textarea
                    placeholder={
                      "https://n4.coomer.st/data/.../video.m4v\nhttps://coomer.st/onlyfans/user/xxx/post/123\nhttps://example.com/video.mp4"
                    }
                    value={coomerUrl}
                    onChange={(e) => setCoomerUrl(e.target.value)}
                    rows={5}
                    className="w-full bg-secondary text-foreground rounded px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary border border-border placeholder:text-muted-foreground resize-y font-mono"
                  />
                  <Button onClick={parseCoomerUrl} disabled={coomerLoading || !coomerUrl.trim()} className="self-end">
                    {coomerLoading ? (
                      <Loader2 size={16} className="animate-spin mr-1" />
                    ) : (
                      <ExternalLink size={16} className="mr-1" />
                    )}
                    Analyser
                  </Button>
                </div>
                {/* Import progress bar */}
                {coomerImporting && (
                  <div className="space-y-2 p-4 rounded-lg border border-border bg-primary/5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-primary" />
                        Import en cours...
                      </span>
                      <span className="text-muted-foreground">
                        {coomerProgress.done}/{coomerProgress.total}
                      </span>
                    </div>
                    <Progress
                      value={
                        coomerProgress.total > 0 ? Math.round((coomerProgress.done / coomerProgress.total) * 100) : 0
                      }
                      className="h-2"
                    />
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="text-primary">
                        {coomerProgress.imported} importé{coomerProgress.imported > 1 ? "s" : ""}
                      </span>
                      {coomerProgress.dupes > 0 && (
                        <span>
                          {coomerProgress.dupes} doublon{coomerProgress.dupes > 1 ? "s" : ""}
                        </span>
                      )}
                      <span>
                        {coomerProgress.total - coomerProgress.done} restant
                        {coomerProgress.total - coomerProgress.done > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                )}
                {coomerVideos.length > 0 && !coomerImporting && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{coomerVideos.length} vidéo(s) trouvée(s)</p>
                      <Button size="sm" onClick={importAllCoomerVideos} disabled={coomerImporting}>
                        Tout importer
                      </Button>
                    </div>
                    {coomerVideos.map((video: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-md bg-muted">
                        <div className="flex items-center gap-3">
                          <Film size={18} className="text-muted-foreground" />
                          <p className="text-foreground text-sm truncate max-w-[400px]">{video.title}</p>
                        </div>
                        <Button size="sm" onClick={() => importCoomerVideo(video)} disabled={coomerImporting}>
                          <Download size={14} className="mr-1" /> Importer
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* BULK FILE IMPORT TAB */}
          <TabsContent value="bulk" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Upload size={20} /> Import massif
                </CardTitle>
                <CardDescription>
                  Définissez un modèle par groupe de liens. Ajoutez autant de groupes que nécessaire. Le traitement se
                  fait en parallèle avec une file d'attente optimisée.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Model Groups */}
                {modelGroups.map((group, gi) => (
                  <div key={group.id} className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <Users size={16} className="text-primary shrink-0" />
                        <Input
                          placeholder="Nom du modèle *"
                          value={group.modelName}
                          onChange={(e) => updateModelGroup(group.id, "modelName", e.target.value)}
                          className={cn(
                            "max-w-xs",
                            group.links.trim() && !group.modelName.trim() && "border-destructive ring-destructive",
                          )}
                          required
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {group.links.split(/[\n\r]+/).filter((l) => l.trim()).length} lien(s)
                      </span>
                      {modelGroups.length > 1 && (
                        <button
                          onClick={() => removeModelGroup(group.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <textarea
                        placeholder="Collez vos liens ici (un par ligne)&#10;https://example.com/video1.mp4&#10;https://example.com/video2.mp4"
                        value={group.links}
                        onChange={(e) => {
                          updateModelGroup(group.id, "links", e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }}
                        onPaste={(e) => handleGroupPaste(group.id, e)}
                        rows={3}
                        className="w-full bg-secondary text-foreground rounded pl-12 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary border border-border placeholder:text-muted-foreground resize-y font-mono min-h-[80px]"
                        style={{ overflow: "auto" }}
                      />
                      {/* Line numbers overlay */}
                      {group.links.trim() && (
                        <div className="absolute left-0 top-0 pt-3 pl-2 pointer-events-none select-none font-mono text-sm text-muted-foreground leading-[1.43]">
                          {group.links.split("\n").map((_, i) => (
                            <div key={i} className="h-[1.43em] text-right w-7">
                              {i + 1}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={addModelGroup} variant="outline" size="sm" className="gap-2">
                    <Plus size={16} /> Ajouter un modèle
                  </Button>

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".txt,.csv,.text"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setBulkFile(f);
                          setBulkResults(null);
                        }
                      }}
                      className="hidden"
                      id="bulk-file-input"
                    />
                    <label
                      htmlFor="bulk-file-input"
                      className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-border bg-secondary text-foreground hover:bg-accent transition-colors"
                    >
                      <FileText size={16} />
                      {bulkFile ? bulkFile.name : "Fichier .txt"}
                    </label>
                    {bulkFile && (
                      <button
                        onClick={() => setBulkFile(null)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {(modelGroups.some((g) => g.links.trim()) || bulkFile) && !bulkImporting && (
                    <Button onClick={handleBulkImport} className="gap-2 ml-auto">
                      <Upload size={16} /> Lancer l'import
                    </Button>
                  )}
                </div>

                {/* Queue Status */}
                {queueItems.length > 0 && (
                  <div className="space-y-2 border border-border rounded-lg p-4">
                    <h4 className="text-foreground font-semibold text-sm flex items-center gap-2">
                      <Film size={16} /> File d'attente
                    </h4>
                    {queueItems.map((item, i) => (
                      <div key={item.groupId} className="flex items-center gap-3 text-sm p-2 rounded bg-muted/50">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            item.status === "done"
                              ? "bg-green-500"
                              : item.status === "processing"
                                ? "bg-primary animate-pulse"
                                : item.status === "error"
                                  ? "bg-destructive"
                                  : "bg-muted-foreground"
                          }`}
                        />
                        <span className="text-foreground font-medium truncate flex-1">
                          {item.modelName || `Groupe ${i + 1}`}
                        </span>
                        <span className="text-muted-foreground text-xs">{item.links.length} liens</span>
                        {item.status === "processing" && <Loader2 size={14} className="animate-spin text-primary" />}
                        {item.status === "done" && (
                          <span className="text-xs text-green-500">{item.imported} importé(s)</span>
                        )}
                        {item.status === "error" && (
                          <span className="text-xs text-destructive">{item.errors} erreur(s)</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {bulkImporting && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" /> Import en cours (3 lots en parallèle)...
                      </span>
                      <span className="text-foreground font-medium">
                        {bulkProgress} / {bulkTotal}
                      </span>
                    </div>
                    <Progress value={bulkTotal > 0 ? (bulkProgress / bulkTotal) * 100 : 0} className="h-2" />
                  </div>
                )}

                {bulkResults && (
                  <div className="rounded-lg bg-muted p-4 space-y-2">
                    <h4 className="text-foreground font-semibold flex items-center gap-2">
                      <CheckSquare size={16} className="text-primary" /> Import terminé
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="bg-card rounded p-3 text-center">
                        <p className="text-2xl font-bold text-primary">{bulkResults.imported}</p>
                        <p className="text-muted-foreground text-xs">Importées</p>
                      </div>
                      <div className="bg-card rounded p-3 text-center">
                        <p className="text-2xl font-bold text-muted-foreground">{bulkResults.duplicates}</p>
                        <p className="text-muted-foreground text-xs">Doublons ignorés</p>
                      </div>
                      <div className="bg-card rounded p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{bulkResults.models}</p>
                        <p className="text-muted-foreground text-xs flex items-center justify-center gap-1">
                          <Users size={12} /> Modèles créés
                        </p>
                      </div>
                      {bulkResults.errors > 0 && (
                        <div className="bg-card rounded p-3 text-center">
                          <p className="text-2xl font-bold text-destructive">{bulkResults.errors}</p>
                          <p className="text-muted-foreground text-xs">Erreurs</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {failedChunks.length > 0 && !bulkImporting && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-destructive" />
                      <h4 className="text-foreground font-semibold">
                        {failedChunks.length} lot(s) en erreur ({failedChunks.reduce((s, c) => s + c.videos.length, 0)}{" "}
                        liens)
                      </h4>
                    </div>
                    <Button
                      onClick={retryFailedChunks}
                      variant="destructive"
                      className="gap-2"
                      disabled={retryingErrors}
                    >
                      {retryingErrors ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      Relancer les {failedChunks.reduce((s, c) => s + c.videos.length, 0)} liens en erreur
                    </Button>
                  </div>
                )}

                <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
                  <p>
                    <strong>Modèles :</strong> Définissez un nom de modèle par groupe, ou laissez vide pour détection
                    auto (Coomer)
                  </p>
                  <p>
                    <strong>Parallélisme :</strong> 3 lots de 500 traités simultanément pour une vitesse optimale
                  </p>
                  <p>
                    <strong>Déduplication :</strong> Les liens déjà importés sont ignorés automatiquement
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* IMPORTED TAB - ADVANCED MANAGEMENT */}
          <TabsContent value="imported" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-foreground">
                      Vidéos importées
                      <span className="text-muted-foreground font-normal text-sm ml-2">
                        ({filteredVideos.length} résultat{filteredVideos.length > 1 ? "s" : ""})
                      </span>
                    </CardTitle>
                    {/* Duration scanner - browser (coomer compatible) */}
                    {browserScan.running ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 size={14} className="animate-spin text-primary" />
                        <span>
                          {browserScan.scanned}/{browserScan.total}
                        </span>
                        <span className="text-primary">{browserScan.found} trouvée(s)</span>
                        <Button size="sm" variant="ghost" onClick={stopBrowserScan} className="text-xs h-6">
                          Arrêter
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={startBrowserDurationScan}
                        className="gap-1.5"
                        title="Scanner les durées via le navigateur (compatible coomer)"
                      >
                        <Clock size={14} />
                        Scanner durées ({importedVideos.filter((v: any) => !v.duration_seconds).length})
                      </Button>
                    )}
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filtrer par titre, source, URL..."
                      value={searchFilter}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                    {searchFilter && (
                      <button
                        onClick={() => handleSearchChange("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bulk actions bar */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 mt-3 p-3 rounded-md bg-accent border border-border">
                    <CheckSquare size={16} className="text-primary" />
                    <span className="text-sm text-foreground font-medium">
                      {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
                    </span>
                    <div className="flex gap-2 ml-auto">
                      <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                        Désélectionner
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={bulkDeleting}
                      >
                        {bulkDeleting ? (
                          <Loader2 size={14} className="animate-spin mr-1" />
                        ) : (
                          <Trash2 size={14} className="mr-1" />
                        )}
                        Supprimer ({selectedIds.size})
                      </Button>
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent>
                {importedVideos.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Aucune vidéo importée pour le moment.</p>
                ) : filteredVideos.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Aucun résultat pour "{searchFilter}"</p>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground font-medium uppercase border-b border-border mb-1">
                      <div className="w-6">
                        <Checkbox checked={allSelected} onCheckedChange={selectAll} />
                      </div>
                      <div className="flex-1">Titre</div>
                      <div className="w-20 hidden md:block">Source</div>
                      <div className="w-24 hidden md:block">Date</div>
                      <div className="w-20 hidden md:block text-right">Taille</div>
                      <div className="w-40 text-right">Actions</div>
                    </div>

                    {/* Rows */}
                    <div className="space-y-1">
                      {paginatedVideos.map((video: any) => (
                        <div
                          key={video.id}
                          className={`flex items-center gap-3 p-3 rounded-md transition-colors ${
                            selectedIds.has(video.id)
                              ? "bg-primary/10 border border-primary/30"
                              : "bg-muted hover:bg-accent"
                          }`}
                        >
                          <div className="w-6">
                            <Checkbox
                              checked={selectedIds.has(video.id)}
                              onCheckedChange={() => toggleSelect(video.id)}
                            />
                          </div>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Film size={16} className="text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-foreground text-sm truncate">{video.title}</p>
                              <p className="text-muted-foreground text-xs truncate md:hidden">
                                {video.source} • {new Date(video.imported_at).toLocaleDateString("fr-FR")}
                              </p>
                            </div>
                          </div>
                          <div className="w-20 hidden md:block">
                            <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                              {video.source}
                            </span>
                          </div>
                          <div className="w-24 hidden md:block text-muted-foreground text-xs">
                            {new Date(video.imported_at).toLocaleDateString("fr-FR")}
                          </div>
                          <div className="w-20 hidden md:block text-right text-muted-foreground text-xs">
                            {video.file_size ? `${(video.file_size / 1024 / 1024).toFixed(1)} Mo` : "—"}
                          </div>
                          <div className="w-40 flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2"
                              onClick={() => navigate(`/watch?v=${video.id}`)}
                            >
                              <Play size={12} />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => startEdit(video)}>
                              <Pencil size={12} />
                            </Button>
                            {video.download_url && (
                              <Button size="sm" variant="outline" className="h-7 px-2" asChild>
                                <a href={video.download_url} target="_blank" rel="noopener">
                                  <ExternalLink size={12} />
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2"
                              onClick={() => deleteImported(video.id)}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Page {page} / {totalPages} — {filteredVideos.length} vidéo
                          {filteredVideos.length > 1 ? "s" : ""}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={page === 1}
                            onClick={() => {
                              setPage(page - 1);
                              setSelectedIds(new Set());
                            }}
                          >
                            <ChevronLeft size={14} />
                          </Button>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let p: number;
                            if (totalPages <= 7) {
                              p = i + 1;
                            } else if (page <= 4) {
                              p = i + 1;
                            } else if (page >= totalPages - 3) {
                              p = totalPages - 6 + i;
                            } else {
                              p = page - 3 + i;
                            }
                            return (
                              <Button
                                key={p}
                                size="sm"
                                variant={p === page ? "default" : "outline"}
                                className="w-8 h-8 p-0"
                                onClick={() => {
                                  setPage(p);
                                  setSelectedIds(new Set());
                                }}
                              >
                                {p}
                              </Button>
                            );
                          })}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={page === totalPages}
                            onClick={() => {
                              setPage(page + 1);
                              setSelectedIds(new Set());
                            }}
                          >
                            <ChevronRight size={14} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />

      {/* Edit dialog */}
      <Dialog open={!!editingVideo} onOpenChange={(open) => !open && setEditingVideo(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Modifier la vidéo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Titre</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            {editingVideo && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>Source :</strong> {editingVideo.source}
                </p>
                <p className="truncate">
                  <strong>URL :</strong> {editingVideo.original_url}
                </p>
                <p>
                  <strong>Importé le :</strong> {new Date(editingVideo.imported_at).toLocaleString("fr-FR")}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVideo(null)}>
              Annuler
            </Button>
            <Button onClick={saveEdit} disabled={!editTitle.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle size={20} className="text-destructive" />
              Confirmer la suppression
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Êtes-vous sûr de vouloir supprimer {selectedIds.size} vidéo{selectedIds.size > 1 ? "s" : ""} ? Cette action
            est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={bulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Trash2 size={14} className="mr-1" />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Import;
