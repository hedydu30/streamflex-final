import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  HardDrive, Plus, Trash2, FolderOpen, Film, Loader2, CheckSquare,
  Download, Settings, X, AlertTriangle, ChevronRight, Eye, EyeOff,
  User, FolderInput, Check,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface GDriveAccount {
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  expiresAt: number;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FolderImportResult {
  folderName: string;
  modelCreated: boolean;
  modelId: string;
  imported: number;
  skipped: number;
}

const VIDEO_MIME_TYPES = [
  "video/mp4","video/x-matroska","video/webm","video/avi",
  "video/quicktime","video/x-msvideo","video/x-ms-wmv",
  "video/mpeg","video/3gpp",
];

const ACCOUNTS_KEY  = "sf_gdrive_accounts";
const CLIENT_ID_KEY = "sf_gdrive_client_id";
const SCOPES        = "https://www.googleapis.com/auth/drive.readonly";

// ── Helpers ───────────────────────────────────────────────────
function loadGapiScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).gapi) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = () => (window as any).gapi.load("client", resolve);
    document.head.appendChild(s);
  });
}
function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).google?.accounts) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}
function getAccounts(): GDriveAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); } catch { return []; }
}
function saveAccounts(accounts: GDriveAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
function formatSize(bytes?: string): string {
  if (!bytes) return "";
  const n = parseInt(bytes);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} Go`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} Mo`;
  return `${(n / 1024).toFixed(0)} Ko`;
}

// ── Composant principal ───────────────────────────────────────
export default function GoogleDriveImport({ onImported }: { onImported?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Config
  const [clientId, setClientId]           = useState(() => localStorage.getItem(CLIENT_ID_KEY) || "");
  const [showConfig, setShowConfig]        = useState(false);
  const [showClientId, setShowClientId]    = useState(false);
  const [clientIdInput, setClientIdInput]  = useState(clientId);

  // Accounts
  const [accounts, setAccounts]           = useState<GDriveAccount[]>(getAccounts);
  const [activeAccount, setActiveAccount] = useState<GDriveAccount | null>(null);

  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [breadcrumbs, setBreadcrumbs]          = useState<BreadcrumbItem[]>([{ id: "root", name: "Mon Drive" }]);
  const [files, setFiles]                      = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken]      = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles]        = useState(false);
  const [showOnlyVideos, setShowOnlyVideos]    = useState(false);

  // Sélection fichiers individuels
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());

  // Import progression
  const [importing, setImporting]         = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal]     = useState(0);
  const [importLabel, setImportLabel]     = useState("");
  const [lastResult, setLastResult]       = useState<FolderImportResult | null>(null);

  const tokenClientRef = useRef<any>(null);

  // ── Sauvegarder le Client ID ──────────────────────────────
  const saveClientId = () => {
    localStorage.setItem(CLIENT_ID_KEY, clientIdInput.trim());
    setClientId(clientIdInput.trim());
    setShowConfig(false);
    toast({ title: "Client ID enregistré" });
  };

  // ── Connexion compte Google ───────────────────────────────
  const connectAccount = useCallback(async () => {
    if (!clientId) { setShowConfig(true); return; }
    await Promise.all([loadGapiScript(), loadGisScript()]);
    await (window as any).gapi.client.init({});
    const tc = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      prompt: "select_account consent",
      callback: async (resp: any) => {
        if (resp.error) {
          toast({ title: "Erreur OAuth", description: resp.error, variant: "destructive" });
          return;
        }
        const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${resp.access_token}` },
        }).then(r => r.json());
        const account: GDriveAccount = {
          email: info.email, name: info.name, picture: info.picture,
          accessToken: resp.access_token,
          expiresAt: Date.now() + resp.expires_in * 1000,
        };
        setAccounts(prev => {
          const updated = [...prev.filter(a => a.email !== account.email), account];
          saveAccounts(updated);
          return updated;
        });
        setActiveAccount(account);
        setCurrentFolderId("root");
        setBreadcrumbs([{ id: "root", name: "Mon Drive" }]);
        setFiles([]);
        setSelectedIds(new Set());
        toast({ title: `Connecté : ${info.email}` });
        // Charger immédiatement les fichiers avec le nouveau compte
        setTimeout(() => listFiles("root", account), 100);
      },
    });
    tc.requestAccessToken();
  }, [clientId, toast]);

  // ── Rafraîchir token ──────────────────────────────────────
  const refreshToken = useCallback(async (email: string) => {
    if (!clientId) return;
    await Promise.all([loadGapiScript(), loadGisScript()]);
    await (window as any).gapi.client.init({});
    const tc = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPES, hint: email, prompt: "",
      callback: (resp: any) => {
        if (resp.error) return;
        const expiresAt = Date.now() + resp.expires_in * 1000;
        setAccounts(prev => {
          const updated = prev.map(a => a.email === email
            ? { ...a, accessToken: resp.access_token, expiresAt } : a);
          saveAccounts(updated);
          return updated;
        });
        setActiveAccount(cur => cur?.email === email
          ? { ...cur!, accessToken: resp.access_token, expiresAt } : cur);
      },
    });
    tc.requestAccessToken();
  }, [clientId]);

  const removeAccount = (email: string) => {
    setAccounts(prev => { const u = prev.filter(a => a.email !== email); saveAccounts(u); return u; });
    if (activeAccount?.email === email) { setActiveAccount(null); setFiles([]); }
  };

  const getToken = useCallback(async (account: GDriveAccount): Promise<string> => {
    if (account.expiresAt > Date.now() + 30_000) return account.accessToken;
    await refreshToken(account.email);
    return account.accessToken;
  }, [refreshToken]);

  // ── Lister les fichiers d'un dossier ─────────────────────
  // listFiles prend toujours le compte explicitement pour éviter les closures périmées
  const listFiles = useCallback(async (folderId: string, account: GDriveAccount, pageToken?: string) => {
    setLoadingFiles(true);
    try {
      const token = await getToken(account);
      let q = `'${folderId}' in parents and trashed = false`;
      if (showOnlyVideos) {
        const types = VIDEO_MIME_TYPES.map(t => `mimeType = '${t}'`).join(" or ");
        q += ` and (mimeType = 'application/vnd.google-apps.folder' or ${types})`;
      }
      const params = new URLSearchParams({
        q,
        fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink,modifiedTime)",
        pageSize: "100",
        orderBy: "folder,name",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 401) {
        toast({ title: "Session expirée", description: "Reconnectez ce compte", variant: "destructive" });
        setLoadingFiles(false); return;
      }
      const data = await resp.json();
      setFiles(prev => pageToken ? [...prev, ...(data.files || [])] : data.files || []);
      setNextPageToken(data.nextPageToken || null);
    } catch (e: any) {
      toast({ title: "Erreur Drive", description: e.message, variant: "destructive" });
    }
    setLoadingFiles(false);
  }, [getToken, showOnlyVideos, toast]);

  // ── Récupérer TOUTES les vidéos d'un dossier (récursif optionnel) ──
  const fetchAllVideosInFolder = useCallback(async (folderId: string, token: string): Promise<DriveFile[]> => {
    let all: DriveFile[] = [];
    let pageToken: string | undefined;
    const types = VIDEO_MIME_TYPES.map(t => `mimeType = '${t}'`).join(" or ");
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false and (${types})`,
        fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink,modifiedTime)",
        pageSize: "1000",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      all = [...all, ...(data.files || [])];
      pageToken = data.nextPageToken;
    } while (pageToken);
    return all;
  }, []);

  // ── Upsert modèle (crée ou retrouve) ─────────────────────
  const upsertModel = useCallback(async (folderName: string): Promise<{ id: string; created: boolean }> => {
    if (!user) throw new Error("Non connecté");
    const { data: existing } = await supabase
      .from("models")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", folderName)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };
    const { data: newModel, error } = await supabase
      .from("models")
      .insert({ user_id: user.id, name: folderName, source_platform: "gdrive" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: newModel.id, created: true };
  }, [user]);

  // ── IMPORT D'UN DOSSIER ENTIER ────────────────────────────
  const importFolder = useCallback(async (folder: DriveFile) => {
    if (!user || !activeAccount || importing) return;
    setImporting(true);
    setImportProgress(0);
    setImportLabel(`Scan de "${folder.name}"…`);
    setLastResult(null);

    try {
      const token = await getToken(activeAccount);

      // 1. Récupérer toutes les vidéos du dossier
      const videos = await fetchAllVideosInFolder(folder.id, token);
      if (videos.length === 0) {
        toast({ title: "Aucune vidéo", description: `Aucun fichier vidéo dans "${folder.name}"` });
        setImporting(false);
        return;
      }

      setImportTotal(videos.length);
      setImportLabel(`Création du modèle "${folder.name}"…`);

      // 2. Créer ou retrouver le modèle depuis le nom du dossier
      const { id: modelId, created: modelCreated } = await upsertModel(folder.name);

      // 3. Importer toutes les vidéos avec model_id + tag gdrive
      let done = 0, skipped = 0;
      const folderPath = [...breadcrumbs.map(b => b.name), folder.name].join(" / ");

      for (const file of videos) {
        setImportProgress(done);
        setImportLabel(`${done + 1}/${videos.length} — ${file.name}`);
        const ext = file.name.split(".").pop()?.toLowerCase() || null;

        const { error } = await supabase.from("imported_videos").insert({
          user_id: user.id,
          source: "gdrive",
          title: file.name.replace(/\.[^.]+$/, ""),
          original_url: file.webContentLink || file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
          file_size: file.size ? parseInt(file.size) : null,
          format: ext,
          thumbnail_url: file.thumbnailLink || null,
          model_id: modelId,
          is_active: true,
          metadata: {
            tag: "google_drive",
            fileId: file.id,
            mimeType: file.mimeType,
            driveAccount: activeAccount.email,
            folderId: folder.id,
            folderName: folder.name,
            folderPath,
            webViewLink: file.webViewLink,
            webContentLink: file.webContentLink || null,
            modifiedTime: file.modifiedTime,
          },
        });

        if (error?.code === "23505") skipped++;
        done++;
      }

      setImportProgress(done);
      const imported = done - skipped;
      const result: FolderImportResult = {
        folderName: folder.name,
        modelCreated,
        modelId,
        imported,
        skipped,
      };
      setLastResult(result);
      onImported?.();
      toast({
        title: `✅ "${folder.name}" importé`,
        description: `${imported} vidéo${imported > 1 ? "s" : ""} • Modèle ${modelCreated ? "créé" : "mis à jour"}${skipped > 0 ? ` • ${skipped} doublon${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}` : ""}`,
      });
    } catch (e: any) {
      toast({ title: "Erreur import", description: e.message, variant: "destructive" });
    }
    setImporting(false);
    setImportLabel("");
  }, [user, activeAccount, importing, getToken, fetchAllVideosInFolder, upsertModel, breadcrumbs, onImported, toast]);

  // ── IMPORT sélection fichiers individuels ─────────────────
  const importSelected = useCallback(async () => {
    if (!user || !activeAccount || selectedIds.size === 0 || importing) return;
    setImporting(true);
    setImportProgress(0);
    setImportTotal(selectedIds.size);
    setImportLabel("Préparation…");

    // Nom du dossier courant comme nom de modèle
    const folderName = breadcrumbs[breadcrumbs.length - 1]?.name || "Google Drive";
    const { id: modelId, created: modelCreated } = await upsertModel(folderName);

    const toImport = files.filter(f => selectedIds.has(f.id));
    let done = 0, skipped = 0;
    const folderPath = breadcrumbs.map(b => b.name).join(" / ");

    for (const file of toImport) {
      setImportProgress(done);
      setImportLabel(`${done + 1}/${toImport.length} — ${file.name}`);
      const ext = file.name.split(".").pop()?.toLowerCase() || null;

      const { error } = await supabase.from("imported_videos").insert({
        user_id: user.id,
        source: "gdrive",
        title: file.name.replace(/\.[^.]+$/, ""),
        original_url: file.webContentLink || file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        file_size: file.size ? parseInt(file.size) : null,
        format: ext,
        thumbnail_url: file.thumbnailLink || null,
        model_id: modelId,
        is_active: true,
        metadata: {
          tag: "google_drive",
          fileId: file.id,
          mimeType: file.mimeType,
          driveAccount: activeAccount.email,
          folderId: currentFolderId,
          folderName,
          folderPath,
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink || null,
          modifiedTime: file.modifiedTime,
        },
      });

      if (error?.code === "23505") skipped++;
      done++;
    }

    setImportProgress(done);
    const imported = done - skipped;
    setLastResult({ folderName, modelCreated, modelId, imported, skipped });
    setSelectedIds(new Set());
    onImported?.();
    toast({
      title: "Import terminé",
      description: `${imported} vidéo${imported > 1 ? "s" : ""} • Modèle "${folderName}" ${modelCreated ? "créé" : "mis à jour"}`,
    });
    setImporting(false);
    setImportLabel("");
  }, [user, activeAccount, selectedIds, importing, files, breadcrumbs, currentFolderId, upsertModel, onImported, toast]);

  // ── Navigation ────────────────────────────────────────────
  const openFolder = (folder: DriveFile) => {
    if (!activeAccount) return;
    const newBreadcrumbs = [...breadcrumbs, { id: folder.id, name: folder.name }];
    setBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(folder.id);
    setFiles([]); setSelectedIds(new Set()); setNextPageToken(null);
    listFiles(folder.id, activeAccount);
  };

  const navigateTo = (crumb: BreadcrumbItem, index: number) => {
    if (!activeAccount) return;
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentFolderId(crumb.id);
    setFiles([]); setSelectedIds(new Set()); setNextPageToken(null);
    listFiles(crumb.id, activeAccount);
  };

  useEffect(() => {
    if (activeAccount && currentFolderId) listFiles(currentFolderId, activeAccount);
  }, [currentFolderId, activeAccount, listFiles]);

  useEffect(() => {
    if (activeAccount && currentFolderId) {
      setFiles([]);
      listFiles(currentFolderId, activeAccount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnlyVideos]);

  const videoFiles = files.filter(f => VIDEO_MIME_TYPES.includes(f.mimeType));
  const folderFiles = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  const isVideo = (f: DriveFile) => VIDEO_MIME_TYPES.includes(f.mimeType);
  const isFolder = (f: DriveFile) => f.mimeType === "application/vnd.google-apps.folder";

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAllVideos = () => {
    setSelectedIds(selectedIds.size === videoFiles.length ? new Set() : new Set(videoFiles.map(f => f.id)));
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Config Client ID */}
      {(showConfig || !clientId) && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings size={16} className="text-yellow-500" /> Configuration Google OAuth
              </CardTitle>
              {clientId && <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>}
            </div>
            <CardDescription className="text-xs">
              Créez un projet sur{" "}
              <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                console.cloud.google.com
              </a>
              , activez l'API Google Drive, créez des identifiants OAuth 2.0 (type "Application Web"),
              ajoutez <code className="bg-muted px-1 rounded text-xs">{window.location.origin}</code> comme origine JavaScript autorisée.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Client ID Google</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showClientId ? "text" : "password"}
                      placeholder="xxxx.apps.googleusercontent.com"
                      value={clientIdInput}
                      onChange={e => setClientIdInput(e.target.value)}
                      className="pr-10 font-mono text-xs"
                    />
                    <button onClick={() => setShowClientId(!showClientId)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showClientId ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <Button size="sm" onClick={saveClientId} disabled={!clientIdInput.trim()}>Enregistrer</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle size={12} className="text-yellow-500 mt-0.5 shrink-0" />
                Le Client ID est stocké localement dans votre navigateur uniquement.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comptes */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive size={18} className="text-primary" /> Comptes Google Drive
            </CardTitle>
            <div className="flex items-center gap-2">
              {clientId && (
                <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Settings size={12} /> Config
                </button>
              )}
              <Button size="sm" onClick={connectAccount} className="gap-1.5">
                <Plus size={14} /> Ajouter un compte
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-6">
              <HardDrive size={32} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{clientId ? "Cliquez sur \"Ajouter un compte\"" : "Configurez d'abord votre Client ID Google"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map(acc => {
                const expired = acc.expiresAt < Date.now();
                const isActive = activeAccount?.email === acc.email;
                return (
                  <div key={acc.email} onClick={() => {
                    if (!isActive) {
                    setActiveAccount(acc);
                    setCurrentFolderId("root");
                    setBreadcrumbs([{ id: "root", name: "Mon Drive" }]);
                    setFiles([]);
                    setSelectedIds(new Set());
                    setTimeout(() => listFiles("root", acc), 50);
                  }
                  }}
                    className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isActive ? "border-primary/60 bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/60")}>
                    {/* Avatar avec fallback initiales si image bloquée */}
                    <div className="w-9 h-9 rounded-full border border-border overflow-hidden bg-primary/20 flex items-center justify-center shrink-0">
                      <img
                        src={acc.picture} alt={acc.name}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="text-xs font-bold text-primary absolute">
                        {acc.name?.charAt(0)?.toUpperCase() || "G"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{acc.name || acc.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
                    </div>
                    {expired && (
                      <button onClick={e => { e.stopPropagation(); refreshToken(acc.email); }}
                        className="text-xs text-yellow-500 hover:text-yellow-400 flex items-center gap-1 shrink-0">
                        <AlertTriangle size={12} /> Reconnecter
                      </button>
                    )}
                    {isActive && <span className="text-xs text-primary font-medium shrink-0">Actif</span>}
                    <button onClick={e => { e.stopPropagation(); removeAccount(acc.email); }}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Résultat dernier import */}
      {lastResult && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Check size={18} className="text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">Import terminé — "{lastResult.folderName}"</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Film size={11} /> {lastResult.imported} vidéo{lastResult.imported > 1 ? "s" : ""}
                  </Badge>
                  <Badge variant={lastResult.modelCreated ? "default" : "secondary"} className="text-xs gap-1">
                    <User size={11} /> Modèle {lastResult.modelCreated ? "créé" : "mis à jour"}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                    <HardDrive size={11} /> Google Drive
                  </Badge>
                  {lastResult.skipped > 0 && (
                    <Badge variant="outline" className="text-xs text-yellow-500 gap-1">
                      {lastResult.skipped} doublon{lastResult.skipped > 1 ? "s" : ""} ignoré{lastResult.skipped > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </div>
              <button onClick={() => setLastResult(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Explorateur */}
      {activeAccount && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderOpen size={18} className="text-primary" /> {activeAccount.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox checked={showOnlyVideos} onCheckedChange={v => setShowOnlyVideos(!!v)} className="scale-90" />
                    Vidéos uniquement
                  </label>
                  {selectedIds.size > 0 && (
                    <Button size="sm" onClick={importSelected} disabled={importing} className="gap-1.5">
                      {importing
                        ? <><Loader2 size={14} className="animate-spin" />{importProgress}/{importTotal}</>
                        : <><Download size={14} />Importer ({selectedIds.size})</>
                      }
                    </Button>
                  )}
                </div>
              </div>

              {/* Progression import */}
              {importing && (
                <div className="space-y-1.5">
                  <Progress value={importTotal > 0 ? (importProgress / importTotal) * 100 : 0} className="h-1.5" />
                  <p className="text-xs text-muted-foreground truncate">{importLabel}</p>
                </div>
              )}

              {/* Fil d'Ariane */}
              <div className="flex items-center gap-1 flex-wrap">
                {breadcrumbs.map((crumb, i) => (
                  <div key={crumb.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={12} className="text-muted-foreground/50" />}
                    <button onClick={() => navigateTo(crumb, i)}
                      className={cn("text-xs px-1.5 py-0.5 rounded transition-colors",
                        i === breadcrumbs.length - 1
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                      {crumb.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Sélection rapide vidéos */}
            {videoFiles.length > 0 && (
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
                <button onClick={selectAllVideos}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <CheckSquare size={14} />
                  {selectedIds.size === videoFiles.length ? "Tout désélectionner" : `Tout sélectionner (${videoFiles.length} vidéos)`}
                </button>
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size > 0 && `${selectedIds.size} sélectionné${selectedIds.size > 1 ? "s" : ""}`}
                </span>
              </div>
            )}

            {loadingFiles && files.length === 0 ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Chargement…</span>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-10">
                <FolderOpen size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Dossier vide</p>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Dossiers — avec bouton "Importer tout le dossier" */}
                {folderFiles.map(folder => (
                  <div key={folder.id}
                    className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/60 transition-colors group">
                    <button onClick={() => openFolder(folder)}
                      className="flex items-center gap-3 flex-1 min-w-0">
                      <FolderOpen size={18} className="text-yellow-500 shrink-0" />
                      <span className="text-sm text-foreground truncate group-hover:text-primary">{folder.name}</span>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={importing}
                      onClick={() => importFolder(folder)}
                      className="shrink-0 h-7 px-2.5 text-xs gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <FolderInput size={13} />
                      Importer le dossier
                    </Button>
                    <button onClick={() => openFolder(folder)} className="text-muted-foreground/50 group-hover:text-primary shrink-0">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}

                {/* Vidéos */}
                {files.filter(isVideo).map(file => {
                  const sel = selectedIds.has(file.id);
                  return (
                    <div key={file.id} onClick={() => toggleSelect(file.id)}
                      className={cn("flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all",
                        sel ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent")}>
                      <Checkbox checked={sel} onCheckedChange={() => toggleSelect(file.id)}
                        onClick={e => e.stopPropagation()} className="shrink-0" />
                      {file.thumbnailLink ? (
                        <img src={file.thumbnailLink} alt={file.name}
                          className="w-10 h-10 rounded object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <Film size={18} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{file.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {file.size && <span>{formatSize(file.size)}</span>}
                          {file.mimeType && <span>{file.mimeType.split("/")[1]?.toUpperCase()}</span>}
                          {file.modifiedTime && <span>{new Date(file.modifiedTime).toLocaleDateString("fr-FR")}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Autres fichiers */}
                {files.filter(f => !isFolder(f) && !isVideo(f)).map(file => (
                  <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg opacity-30">
                    <div className="w-4 shrink-0" />
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <Film size={16} className="text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate flex-1">{file.name}</p>
                  </div>
                ))}
              </div>
            )}

            {nextPageToken && !loadingFiles && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" onClick={() => activeAccount && listFiles(currentFolderId, activeAccount, nextPageToken)}>
                  Charger plus
                </Button>
              </div>
            )}
            {loadingFiles && files.length > 0 && (
              <div className="mt-3 flex justify-center"><Loader2 size={16} className="animate-spin text-primary" /></div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}