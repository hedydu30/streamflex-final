import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  HardDrive, Plus, Trash2, FolderOpen, Film, ChevronLeft,
  Loader2, CheckSquare, Download, Settings, X, AlertTriangle,
  ChevronRight, Eye, EyeOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface GDriveAccount {
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  expiresAt: number; // timestamp ms
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  parents?: string[];
  modifiedTime?: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

const VIDEO_MIME_TYPES = [
  "video/mp4", "video/x-matroska", "video/webm",
  "video/avi", "video/quicktime", "video/x-msvideo",
  "video/x-ms-wmv", "video/mpeg", "video/3gpp",
];

const SCOPES = "https://www.googleapis.com/auth/drive.readonly";
const ACCOUNTS_KEY = "sf_gdrive_accounts";
const CLIENT_ID_KEY = "sf_gdrive_client_id";

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
  if (n >= 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${n} o`;
}

// ── Main Component ────────────────────────────────────────────
interface GoogleDriveImportProps {
  onImported?: () => void;
}

export default function GoogleDriveImport({ onImported }: GoogleDriveImportProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Config
  const [clientId, setClientId] = useState(() => localStorage.getItem(CLIENT_ID_KEY) || "");
  const [showConfig, setShowConfig] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(clientId);

  // Accounts
  const [accounts, setAccounts] = useState<GDriveAccount[]>(getAccounts);
  const [activeAccount, setActiveAccount] = useState<GDriveAccount | null>(null);

  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: "root", name: "Mon Drive" }]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showOnlyVideos, setShowOnlyVideos] = useState(false);

  // Selection & import
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);

  const tokenClientRef = useRef<any>(null);

  // ── Sauvegarder le Client ID ──────────────────────────────
  const saveClientId = () => {
    localStorage.setItem(CLIENT_ID_KEY, clientIdInput.trim());
    setClientId(clientIdInput.trim());
    setShowConfig(false);
    toast({ title: "Client ID enregistré" });
  };

  // ── Connexion d'un nouveau compte Google ─────────────────
  const connectAccount = useCallback(async () => {
    if (!clientId) { setShowConfig(true); return; }
    await Promise.all([loadGapiScript(), loadGisScript()]);

    // Init gapi client
    await (window as any).gapi.client.init({});

    const google = (window as any).google;
    tokenClientRef.current = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      prompt: "select_account consent",
      callback: async (resp: any) => {
        if (resp.error) {
          toast({ title: "Erreur OAuth", description: resp.error, variant: "destructive" });
          return;
        }
        const token = resp.access_token;
        const expiresAt = Date.now() + resp.expires_in * 1000;

        // Récupérer les infos du compte
        const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json());

        const account: GDriveAccount = {
          email: info.email,
          name: info.name,
          picture: info.picture,
          accessToken: token,
          expiresAt,
        };

        setAccounts((prev) => {
          const updated = prev.filter((a) => a.email !== account.email);
          updated.push(account);
          saveAccounts(updated);
          return updated;
        });

        setActiveAccount(account);
        setCurrentFolderId("root");
        setBreadcrumbs([{ id: "root", name: "Mon Drive" }]);
        setFiles([]);
        toast({ title: `Connecté : ${info.email}` });
      },
    });

    tokenClientRef.current.requestAccessToken();
  }, [clientId, toast]);

  // ── Rafraîchir le token d'un compte existant ─────────────
  const refreshToken = useCallback(async (email: string) => {
    if (!clientId) { setShowConfig(true); return; }
    await Promise.all([loadGapiScript(), loadGisScript()]);
    await (window as any).gapi.client.init({});

    const google = (window as any).google;
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      hint: email,
      prompt: "",
      callback: (resp: any) => {
        if (resp.error) return;
        const expiresAt = Date.now() + resp.expires_in * 1000;
        setAccounts((prev) => {
          const updated = prev.map((a) =>
            a.email === email ? { ...a, accessToken: resp.access_token, expiresAt } : a
          );
          saveAccounts(updated);
          // Mettre à jour le compte actif si c'est lui
          setActiveAccount((cur) => cur?.email === email ? { ...cur!, accessToken: resp.access_token, expiresAt } : cur);
          return updated;
        });
      },
    });
    tc.requestAccessToken();
  }, [clientId]);

  // ── Supprimer un compte ───────────────────────────────────
  const removeAccount = (email: string) => {
    setAccounts((prev) => {
      const updated = prev.filter((a) => a.email !== email);
      saveAccounts(updated);
      return updated;
    });
    if (activeAccount?.email === email) {
      setActiveAccount(null);
      setFiles([]);
    }
  };

  // ── Obtenir un token valide (auto-refresh si expiré) ──────
  const getToken = useCallback(async (account: GDriveAccount): Promise<string> => {
    if (account.expiresAt > Date.now() + 30_000) return account.accessToken;
    // Token expiré — demander un nouveau silencieusement
    await refreshToken(account.email);
    // Retourner le token actuel en attendant
    return account.accessToken;
  }, [refreshToken]);

  // ── Lister les fichiers d'un dossier ─────────────────────
  const listFiles = useCallback(async (folderId: string, pageToken?: string, account?: GDriveAccount) => {
    const acc = account || activeAccount;
    if (!acc) return;
    setLoadingFiles(true);

    try {
      const token = await getToken(acc);
      let q = `'${folderId}' in parents and trashed = false`;
      if (showOnlyVideos) {
        const types = VIDEO_MIME_TYPES.map((t) => `mimeType = '${t}'`).join(" or ");
        q += ` and (mimeType = 'application/vnd.google-apps.folder' or ${types})`;
      }

      const params = new URLSearchParams({
        q,
        fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink,modifiedTime,parents)",
        pageSize: "50",
        orderBy: "folder,name",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (resp.status === 401) {
        toast({ title: "Session expirée", description: "Reconnectez ce compte", variant: "destructive" });
        setLoadingFiles(false);
        return;
      }

      const data = await resp.json();
      setFiles((prev) => pageToken ? [...prev, ...data.files] : data.files || []);
      setNextPageToken(data.nextPageToken || null);
    } catch (e: any) {
      toast({ title: "Erreur Drive", description: e.message, variant: "destructive" });
    }
    setLoadingFiles(false);
  }, [activeAccount, getToken, showOnlyVideos, toast]);

  // ── Navigation dans les dossiers ──────────────────────────
  const openFolder = (folder: DriveFile) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setFiles([]);
    setSelectedIds(new Set());
    setNextPageToken(null);
  };

  const navigateTo = (crumb: BreadcrumbItem, index: number) => {
    setCurrentFolderId(crumb.id);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setFiles([]);
    setSelectedIds(new Set());
    setNextPageToken(null);
  };

  // Charger les fichiers quand le dossier change
  useEffect(() => {
    if (activeAccount && currentFolderId) {
      listFiles(currentFolderId);
    }
  }, [currentFolderId, activeAccount]);

  // Recharger quand filtre change
  useEffect(() => {
    if (activeAccount && currentFolderId) {
      setFiles([]);
      listFiles(currentFolderId);
    }
  }, [showOnlyVideos]);

  // ── Sélection ─────────────────────────────────────────────
  const videoFiles = files.filter((f) => VIDEO_MIME_TYPES.includes(f.mimeType));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVideos = () => {
    if (selectedIds.size === videoFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videoFiles.map((f) => f.id)));
    }
  };

  // ── Import vers Supabase ──────────────────────────────────
  const importSelected = async () => {
    if (!user || !activeAccount || selectedIds.size === 0) return;
    setImporting(true);
    setImportProgress(0);
    setImportTotal(selectedIds.size);

    const toImport = files.filter((f) => selectedIds.has(f.id));
    let done = 0;
    let skipped = 0;

    for (const file of toImport) {
      const ext = file.name.split(".").pop()?.toLowerCase() || null;
      const directUrl = file.webContentLink || null;
      const viewUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;

      const { error } = await supabase.from("imported_videos").insert({
        user_id: user.id,
        source: "gdrive",
        title: file.name.replace(/\.[^.]+$/, ""), // sans extension
        original_url: directUrl || viewUrl,
        file_size: file.size ? parseInt(file.size) : null,
        format: ext,
        thumbnail_url: file.thumbnailLink || null,
        is_active: true,
        metadata: {
          fileId: file.id,
          mimeType: file.mimeType,
          driveAccount: activeAccount.email,
          folderId: currentFolderId,
          folderPath: breadcrumbs.map((b) => b.name).join(" / "),
          webViewLink: viewUrl,
          webContentLink: file.webContentLink || null,
          modifiedTime: file.modifiedTime,
        },
      });

      if (error?.code === "23505") { skipped++; }
      done++;
      setImportProgress(done);
    }

    setImporting(false);
    setSelectedIds(new Set());
    onImported?.();

    const imported = done - skipped;
    toast({
      title: `Import terminé`,
      description: `${imported} vidéo${imported > 1 ? "s" : ""} importée${imported > 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} doublon${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""})` : ""}`,
    });
  };

  // ── Rendre un fichier / dossier ───────────────────────────
  const isVideo = (f: DriveFile) => VIDEO_MIME_TYPES.includes(f.mimeType);
  const isFolder = (f: DriveFile) => f.mimeType === "application/vnd.google-apps.folder";

  // ── UI ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Configuration Client ID */}
      {(showConfig || !clientId) && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings size={16} className="text-yellow-500" />
                Configuration Google OAuth
              </CardTitle>
              {clientId && (
                <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              )}
            </div>
            <CardDescription className="text-xs">
              Créez un projet sur{" "}
              <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer"
                className="text-primary underline">console.cloud.google.com</a>
              , activez l'API Google Drive, créez des identifiants OAuth 2.0 (type "Application Web"),
              ajoutez <code className="bg-muted px-1 rounded text-xs">{window.location.origin}</code> comme
              origine JavaScript autorisée.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Client ID Google</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showClientSecret ? "text" : "password"}
                      placeholder="xxxx.apps.googleusercontent.com"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      className="pr-10 font-mono text-xs"
                    />
                    <button onClick={() => setShowClientSecret(!showClientSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showClientSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <Button size="sm" onClick={saveClientId} disabled={!clientIdInput.trim()}>
                    Enregistrer
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle size={12} className="text-yellow-500 mt-0.5 shrink-0" />
                Le Client ID est stocké localement dans votre navigateur. Il n'est pas envoyé à nos serveurs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comptes connectés */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive size={18} className="text-primary" />
              Comptes Google Drive
            </CardTitle>
            <div className="flex items-center gap-2">
              {clientId && (
                <button onClick={() => setShowConfig(!showConfig)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
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
              <p className="text-sm text-muted-foreground">Aucun compte connecté</p>
              <p className="text-xs text-muted-foreground mt-1">
                {clientId ? "Cliquez sur \"Ajouter un compte\" pour commencer" : "Configurez d'abord votre Client ID Google"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => {
                const expired = acc.expiresAt < Date.now();
                const isActive = activeAccount?.email === acc.email;
                return (
                  <div key={acc.email}
                    onClick={() => {
                      if (!isActive) {
                        setActiveAccount(acc);
                        setCurrentFolderId("root");
                        setBreadcrumbs([{ id: "root", name: "Mon Drive" }]);
                        setFiles([]);
                        setSelectedIds(new Set());
                      }
                    }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isActive
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-muted/30 hover:bg-muted/60",
                    )}>
                    <img src={acc.picture} alt={acc.name}
                      className="w-9 h-9 rounded-full border border-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{acc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
                    </div>
                    {expired && (
                      <button onClick={(e) => { e.stopPropagation(); refreshToken(acc.email); }}
                        className="text-xs text-yellow-500 hover:text-yellow-400 flex items-center gap-1 shrink-0">
                        <AlertTriangle size={12} /> Reconnecter
                      </button>
                    )}
                    {isActive && <span className="text-xs text-primary font-medium shrink-0">Actif</span>}
                    <button onClick={(e) => { e.stopPropagation(); removeAccount(acc.email); }}
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

      {/* Explorateur Drive */}
      {activeAccount && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderOpen size={18} className="text-primary" />
                  {activeAccount.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox checked={showOnlyVideos} onCheckedChange={(v) => setShowOnlyVideos(!!v)} className="scale-90" />
                    Vidéos uniquement
                  </label>
                  {selectedIds.size > 0 && (
                    <Button size="sm" onClick={importSelected} disabled={importing} className="gap-1.5">
                      {importing
                        ? <><Loader2 size={14} className="animate-spin" /> {importProgress}/{importTotal}</>
                        : <><Download size={14} /> Importer ({selectedIds.size})</>
                      }
                    </Button>
                  )}
                </div>
              </div>

              {/* Barre de progression import */}
              {importing && (
                <div className="space-y-1">
                  <Progress value={(importProgress / importTotal) * 100} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    Import {importProgress}/{importTotal}…
                  </p>
                </div>
              )}

              {/* Fil d'Ariane */}
              <div className="flex items-center gap-1 flex-wrap">
                {breadcrumbs.map((crumb, i) => (
                  <div key={crumb.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={12} className="text-muted-foreground/50" />}
                    <button
                      onClick={() => navigateTo(crumb, i)}
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded transition-colors",
                        i === breadcrumbs.length - 1
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}>
                      {crumb.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Sélection rapide */}
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

            {/* Liste fichiers */}
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
                {/* Dossiers */}
                {files.filter(isFolder).map((folder) => (
                  <div key={folder.id}
                    onClick={() => openFolder(folder)}
                    className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-muted/60 transition-colors group">
                    <FolderOpen size={18} className="text-yellow-500 shrink-0" />
                    <span className="text-sm text-foreground flex-1 truncate group-hover:text-primary">{folder.name}</span>
                    <ChevronRight size={14} className="text-muted-foreground/50 group-hover:text-primary" />
                  </div>
                ))}

                {/* Vidéos */}
                {files.filter(isVideo).map((file) => {
                  const sel = selectedIds.has(file.id);
                  return (
                    <div key={file.id}
                      onClick={() => toggleSelect(file.id)}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all",
                        sel ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent",
                      )}>
                      <Checkbox checked={sel} onCheckedChange={() => toggleSelect(file.id)}
                        onClick={(e) => e.stopPropagation()} className="shrink-0" />
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
                          {file.modifiedTime && (
                            <span>{new Date(file.modifiedTime).toLocaleDateString("fr-FR")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Autres fichiers */}
                {files.filter((f) => !isFolder(f) && !isVideo(f)).map((file) => (
                  <div key={file.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg opacity-40">
                    <div className="w-4" />
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <Film size={16} className="text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate flex-1">{file.name}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Charger plus */}
            {nextPageToken && !loadingFiles && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm"
                  onClick={() => listFiles(currentFolderId, nextPageToken)}>
                  Charger plus
                </Button>
              </div>
            )}
            {loadingFiles && files.length > 0 && (
              <div className="mt-3 flex justify-center">
                <Loader2 size={16} className="animate-spin text-primary" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}