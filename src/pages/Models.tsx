/**
 * GoogleDriveImport — réécriture complète
 * Corrections :
 * - Chargement auto des fichiers au montage si un compte est sauvegardé
 * - Import récursif des sous-dossiers
 * - Insertions vérifiées avec log d'erreurs explicite
 * - Pas de closure périmée (useRef pour le token actif)
 */
import { useState, useCallback, useRef, useEffect } from "react";
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
  HardDrive, Plus, Trash2, FolderOpen, Film, Loader2,
  CheckSquare, Download, Settings, X, AlertTriangle,
  ChevronRight, Eye, EyeOff, User, FolderInput, Check,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface SavedAccount {
  email: string;
  name: string;
  picture: string;
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

interface Crumb { id: string; name: string }

interface ImportResult {
  folderName: string;
  modelCreated: boolean;
  imported: number;
  skipped: number;
  errors: number;
}

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────
const VIDEO_MIME = [
  "video/mp4","video/x-matroska","video/webm","video/avi",
  "video/quicktime","video/x-msvideo","video/x-ms-wmv",
  "video/mpeg","video/3gpp","video/x-flv","video/ogg",
];
const FOLDER_MIME = "application/vnd.google-apps.folder";
const CLIENT_ID_KEY = "sf_gdrive_client_id";
const ACCOUNTS_KEY  = "sf_gdrive_accounts";
const SCOPES        = "https://www.googleapis.com/auth/drive.readonly";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getSavedAccounts(): SavedAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); }
  catch { return []; }
}
function saveSavedAccounts(a: SavedAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a));
}
function fmtSize(b?: string) {
  if (!b) return "";
  const n = parseInt(b);
  if (n >= 1e9) return `${(n/1e9).toFixed(1)} Go`;
  if (n >= 1e6) return `${(n/1e6).toFixed(0)} Mo`;
  return `${(n/1024).toFixed(0)} Ko`;
}

async function loadScripts() {
  // GAPI
  await new Promise<void>(res => {
    if ((window as any).gapi) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = () => (window as any).gapi.load("client", res);
    document.head.appendChild(s);
  });
  // GIS
  await new Promise<void>(res => {
    if ((window as any).google?.accounts) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => res();
    document.head.appendChild(s);
  });
  await (window as any).gapi.client.init({});
}

// ─────────────────────────────────────────────────────────────
// Drive API helpers (token passé explicitement, pas de closure)
// ─────────────────────────────────────────────────────────────
async function driveList(token: string, q: string, extraParams: Record<string,string> = {}): Promise<{files: DriveFile[], nextPageToken?: string}> {
  const params = new URLSearchParams({
    q,
    fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink,modifiedTime)",
    pageSize: "200",
    orderBy: "folder,name",
    ...extraParams,
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Drive API ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Liste le contenu DIRECT d'un dossier (dossiers + vidéos) */
async function listFolder(token: string, folderId: string, videoOnly = false, pageToken?: string): Promise<{files: DriveFile[], nextPageToken?: string}> {
  let q = `'${folderId}' in parents and trashed = false`;
  if (videoOnly) {
    const types = VIDEO_MIME.map(t => `mimeType='${t}'`).join(" or ");
    q += ` and (mimeType='${FOLDER_MIME}' or ${types})`;
  }
  const extra: Record<string,string> = {};
  if (pageToken) extra.pageToken = pageToken;
  return driveList(token, q, extra);
}

/** Collecte TOUTES les vidéos d'un dossier, récursivement dans les sous-dossiers */
async function collectAllVideos(
  token: string,
  folderId: string,
  onProgress?: (msg: string) => void,
): Promise<DriveFile[]> {
  const result: DriveFile[] = [];
  const queue: string[] = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    let pageToken: string | undefined;
    do {
      const extra: Record<string,string> = {};
      if (pageToken) extra.pageToken = pageToken;
      const data = await driveList(
        token,
        `'${currentId}' in parents and trashed = false`,
        { ...extra, pageSize: "1000" }
      );
      for (const f of data.files || []) {
        if (f.mimeType === FOLDER_MIME) {
          queue.push(f.id); // descendre dans le sous-dossier
        } else if (VIDEO_MIME.includes(f.mimeType)) {
          result.push(f);
        }
      }
      pageToken = data.nextPageToken;
      if (onProgress) onProgress(`Scan… ${result.length} vidéo${result.length > 1 ? "s" : ""} trouvée${result.length > 1 ? "s" : ""}`);
    } while (pageToken);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────
export default function GoogleDriveImport({ onImported }: { onImported?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Config
  const [clientId, setClientId]         = useState(() => localStorage.getItem(CLIENT_ID_KEY) || "");
  const [showConfig, setShowConfig]      = useState(false);
  const [showCid, setShowCid]            = useState(false);
  const [cidInput, setCidInput]          = useState(clientId);

  // Comptes sauvegardés (pas de token — le token est en mémoire seulement)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(getSavedAccounts);

  // Token actif en ref — pas de re-render, pas de closure périmée
  const tokenRef   = useRef<string | null>(null);
  const emailRef   = useRef<string | null>(null);

  // Compte actif affiché
  const [activeEmail, setActiveEmail]   = useState<string | null>(null);
  const [activeName, setActiveName]     = useState<string>("");

  // Explorateur
  const [crumbs, setCrumbs]             = useState<Crumb[]>([{ id: "root", name: "Mon Drive" }]);
  const [files, setFiles]               = useState<DriveFile[]>([]);
  const [moreToken, setMoreToken]       = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [videoOnly, setVideoOnly]       = useState(false);

  // Sélection
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  // Import
  const [importing, setImporting]       = useState(false);
  const [importPct, setImportPct]       = useState(0);
  const [importLabel, setImportLabel]   = useState("");
  const [result, setResult]             = useState<ImportResult | null>(null);

  const currentFolderId = crumbs[crumbs.length - 1].id;

  // ── Sauvegarder config ──────────────────────────────────
  const saveCid = () => {
    localStorage.setItem(CLIENT_ID_KEY, cidInput.trim());
    setClientId(cidInput.trim());
    setShowConfig(false);
    toast({ title: "Client ID enregistré" });
  };

  // ── Charger le dossier courant ───────────────────────────
  const loadFolder = useCallback(async (folderId: string, token: string, append = false, pageToken?: string) => {
    setLoadingFiles(true);
    try {
      const data = await listFolder(token, folderId, videoOnly, pageToken);
      setFiles(prev => append ? [...prev, ...(data.files || [])] : (data.files || []));
      setMoreToken(data.nextPageToken || null);
    } catch (e: any) {
      toast({ title: "Erreur Drive", description: e.message, variant: "destructive" });
    }
    setLoadingFiles(false);
  }, [videoOnly, toast]);

  // Recharger quand filtre change
  useEffect(() => {
    if (tokenRef.current && currentFolderId) {
      setFiles([]);
      loadFolder(currentFolderId, tokenRef.current);
    }
  }, [videoOnly]);

  // ── OAuth — obtenir un token ─────────────────────────────
  const requestToken = useCallback(async (hint?: string, prompt = "select_account consent"): Promise<string> => {
    if (!clientId) { setShowConfig(true); throw new Error("Client ID manquant"); }
    await loadScripts();

    return new Promise((resolve, reject) => {
      const tc = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint,
        prompt,
        callback: (resp: any) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          resolve(resp.access_token);
        },
      });
      tc.requestAccessToken();
    });
  }, [clientId]);

  // ── Connecter un nouveau compte ─────────────────────────
  const connectAccount = useCallback(async () => {
    try {
      const token = await requestToken(undefined, "select_account consent");
      // Récupérer le profil
      const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());

      // Sauvegarder le compte (sans token)
      const saved: SavedAccount = { email: info.email, name: info.name, picture: info.picture };
      setSavedAccounts(prev => {
        const updated = [...prev.filter(a => a.email !== info.email), saved];
        saveSavedAccounts(updated);
        return updated;
      });

      // Activer
      tokenRef.current = token;
      emailRef.current = info.email;
      setActiveEmail(info.email);
      setActiveName(info.name);
      setCrumbs([{ id: "root", name: "Mon Drive" }]);
      setFiles([]);
      setSelected(new Set());
      setResult(null);

      // Charger immédiatement
      await loadFolder("root", token);
      toast({ title: `Connecté : ${info.email}` });
    } catch (e: any) {
      if (!e.message.includes("popup")) {
        toast({ title: "Erreur connexion", description: e.message, variant: "destructive" });
      }
    }
  }, [requestToken, loadFolder, toast]);

  // ── Sélectionner un compte sauvegardé ───────────────────
  const selectAccount = useCallback(async (acc: SavedAccount) => {
    if (acc.email === activeEmail) return;
    try {
      // Demande silencieuse avec hint (pas de popup si session active)
      const token = await requestToken(acc.email, "");
      tokenRef.current = token;
      emailRef.current = acc.email;
      setActiveEmail(acc.email);
      setActiveName(acc.name);
      setCrumbs([{ id: "root", name: "Mon Drive" }]);
      setFiles([]);
      setSelected(new Set());
      setResult(null);
      await loadFolder("root", token);
    } catch {
      // Si hint silencieux échoue → popup
      try {
        const token = await requestToken(acc.email, "select_account");
        tokenRef.current = token;
        emailRef.current = acc.email;
        setActiveEmail(acc.email);
        setActiveName(acc.name);
        setCrumbs([{ id: "root", name: "Mon Drive" }]);
        setFiles([]);
        setSelected(new Set());
        setResult(null);
        await loadFolder("root", token);
      } catch (e2: any) {
        if (!e2.message.includes("popup")) {
          toast({ title: "Erreur", description: e2.message, variant: "destructive" });
        }
      }
    }
  }, [activeEmail, requestToken, loadFolder, toast]);

  const removeAccount = (email: string) => {
    setSavedAccounts(prev => { const u = prev.filter(a => a.email !== email); saveSavedAccounts(u); return u; });
    if (email === activeEmail) {
      tokenRef.current = null;
      emailRef.current = null;
      setActiveEmail(null);
      setActiveName("");
      setFiles([]);
      setCrumbs([{ id: "root", name: "Mon Drive" }]);
    }
  };

  // ── Navigation ───────────────────────────────────────────
  const openFolder = (f: DriveFile) => {
    if (!tokenRef.current) return;
    const newCrumbs = [...crumbs, { id: f.id, name: f.name }];
    setCrumbs(newCrumbs);
    setFiles([]);
    setSelected(new Set());
    setMoreToken(null);
    loadFolder(f.id, tokenRef.current);
  };

  const navigateTo = (crumb: Crumb, idx: number) => {
    if (!tokenRef.current) return;
    const newCrumbs = crumbs.slice(0, idx + 1);
    setCrumbs(newCrumbs);
    setFiles([]);
    setSelected(new Set());
    setMoreToken(null);
    loadFolder(crumb.id, tokenRef.current);
  };

  // ── Upsert modèle ────────────────────────────────────────
  const upsertModel = useCallback(async (name: string) => {
    if (!user) throw new Error("Non authentifié");
    const { data: ex } = await supabase
      .from("models").select("id").eq("user_id", user.id).eq("name", name).maybeSingle();
    if (ex) return { id: ex.id, created: false };
    const { data: nm, error } = await supabase
      .from("models")
      .insert({ user_id: user.id, name, source_platform: "gdrive" })
      .select("id").single();
    if (error) throw error;
    return { id: nm.id, created: true };
  }, [user]);

  // ── Insérer une vidéo ────────────────────────────────────
  const insertVideo = async (file: DriveFile, modelId: string, folderName: string, folderPath: string) => {
    if (!user || !emailRef.current) return "error";
    const ext = file.name.split(".").pop()?.toLowerCase() || null;
    const url = file.webContentLink
      || file.webViewLink
      || `https://drive.google.com/file/d/${file.id}/view`;

    const { error } = await supabase.from("imported_videos").insert({
      user_id: user.id,
      source: "gdrive",
      title: file.name.replace(/\.[^.]+$/, ""),
      original_url: url,
      file_size: file.size ? parseInt(file.size) : null,
      format: ext,
      thumbnail_url: file.thumbnailLink?.replace(/=s\d+/, "=s400") || null,
      model_id: modelId,
      is_active: true,
      metadata: {
        tag: "google_drive",
        fileId: file.id,
        mimeType: file.mimeType,
        driveAccount: emailRef.current,
        folderId: currentFolderId,
        folderName,
        folderPath,
        webViewLink: file.webViewLink || null,
        webContentLink: file.webContentLink || null,
        modifiedTime: file.modifiedTime || null,
      },
    });

    if (!error) return "ok";
    if (error.code === "23505") return "dupe";
    console.error("Insert error:", error);
    return "error";
  };

  // ── IMPORT DOSSIER (récursif) ────────────────────────────
  const importFolder = useCallback(async (folder: DriveFile) => {
    if (!user || !tokenRef.current || importing) return;
    const token = tokenRef.current;
    setImporting(true);
    setImportPct(0);
    setImportLabel(`Scan de "${folder.name}"…`);
    setResult(null);

    try {
      // 1. Collecter toutes les vidéos récursivement
      const videos = await collectAllVideos(token, folder.id, msg => setImportLabel(msg));

      if (videos.length === 0) {
        toast({ title: "Aucune vidéo", description: `Aucun fichier vidéo trouvé dans "${folder.name}" (ni sous-dossiers)` });
        setImporting(false);
        return;
      }

      setImportLabel(`Modèle "${folder.name}"…`);

      // 2. Upsert modèle
      const { id: modelId, created: modelCreated } = await upsertModel(folder.name);

      // 3. Insérer les vidéos
      const folderPath = [...crumbs.map(c => c.name), folder.name].join(" / ");
      let done = 0, skipped = 0, errors = 0;

      for (const file of videos) {
        const r = await insertVideo(file, modelId, folder.name, folderPath);
        if (r === "dupe") skipped++;
        else if (r === "error") errors++;
        done++;
        setImportPct(Math.round((done / videos.length) * 100));
        setImportLabel(`${done}/${videos.length} — ${file.name}`);
      }

      const imported = done - skipped - errors;
      const res: ImportResult = { folderName: folder.name, modelCreated, imported, skipped, errors };
      setResult(res);
      onImported?.();
      toast({
        title: `✅ "${folder.name}" importé`,
        description: `${imported} vidéo${imported !== 1 ? "s" : ""} • modèle ${modelCreated ? "créé" : "mis à jour"}${skipped > 0 ? ` • ${skipped} doublon${skipped !== 1 ? "s" : ""}` : ""}${errors > 0 ? ` • ${errors} erreur${errors !== 1 ? "s" : ""}` : ""}`,
      });
    } catch (e: any) {
      toast({ title: "Erreur import", description: e.message, variant: "destructive" });
    }

    setImporting(false);
    setImportLabel("");
  }, [user, importing, upsertModel, crumbs, onImported, toast]);

  // ── IMPORT sélection manuelle ────────────────────────────
  const importSelected = useCallback(async () => {
    if (!user || !tokenRef.current || selected.size === 0 || importing) return;
    setImporting(true);
    setImportPct(0);
    setResult(null);

    const folderName = crumbs[crumbs.length - 1].name;
    setImportLabel(`Modèle "${folderName}"…`);

    try {
      const { id: modelId, created: modelCreated } = await upsertModel(folderName);
      const toImport = files.filter(f => selected.has(f.id));
      const folderPath = crumbs.map(c => c.name).join(" / ");
      let done = 0, skipped = 0, errors = 0;

      for (const file of toImport) {
        const r = await insertVideo(file, modelId, folderName, folderPath);
        if (r === "dupe") skipped++;
        else if (r === "error") errors++;
        done++;
        setImportPct(Math.round((done / toImport.length) * 100));
        setImportLabel(`${done}/${toImport.length} — ${file.name}`);
      }

      const imported = done - skipped - errors;
      const res: ImportResult = { folderName, modelCreated, imported, skipped, errors };
      setResult(res);
      setSelected(new Set());
      onImported?.();
      toast({
        title: "Import terminé",
        description: `${imported} vidéo${imported !== 1 ? "s" : ""} • "${folderName}" ${modelCreated ? "créé" : "mis à jour"}`,
      });
    } catch (e: any) {
      toast({ title: "Erreur import", description: e.message, variant: "destructive" });
    }

    setImporting(false);
    setImportLabel("");
  }, [user, selected, importing, files, crumbs, upsertModel, onImported, toast]);

  // ─ UI helpers ─────────────────────────────────────────────
  const videoFiles  = files.filter(f => VIDEO_MIME.includes(f.mimeType));
  const folderFiles = files.filter(f => f.mimeType === FOLDER_MIME);
  const otherFiles  = files.filter(f => f.mimeType !== FOLDER_MIME && !VIDEO_MIME.includes(f.mimeType));

  const toggleSel = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () =>
    setSelected(selected.size === videoFiles.length ? new Set() : new Set(videoFiles.map(f => f.id)));

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Config Client ID ── */}
      {(showConfig || !clientId) && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings size={16} className="text-yellow-500" /> Configuration Google OAuth
              </CardTitle>
              {clientId && <button onClick={() => setShowConfig(false)}><X size={16} className="text-muted-foreground" /></button>}
            </div>
            <CardDescription className="text-xs mt-2 space-y-1">
              <p>1. <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.cloud.google.com</a> → Nouveau projet</p>
              <p>2. APIs & Services → Activer <strong>Google Drive API</strong></p>
              <p>3. Identifiants → OAuth 2.0 → Type : Application Web</p>
              <p>4. Origines JS autorisées : <code className="bg-muted px-1 rounded">{window.location.origin}</code></p>
              <p>5. Copier le <strong>Client ID</strong> ci-dessous</p>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showCid ? "text" : "password"}
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={cidInput}
                  onChange={e => setCidInput(e.target.value)}
                  className="pr-10 font-mono text-xs"
                />
                <button onClick={() => setShowCid(!showCid)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showCid ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Button size="sm" onClick={saveCid} disabled={!cidInput.trim()}>Enregistrer</Button>
            </div>
            <p className="text-xs text-muted-foreground flex gap-1.5">
              <AlertTriangle size={12} className="text-yellow-500 mt-0.5 shrink-0" />
              Stocké uniquement dans votre navigateur.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Comptes ── */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive size={18} className="text-primary" /> Comptes Google Drive
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
          {savedAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{clientId ? "Cliquez sur « Ajouter un compte »" : "Configurez d'abord votre Client ID"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedAccounts.map(acc => {
                const isActive = acc.email === activeEmail;
                return (
                  <div key={acc.email}
                    onClick={() => selectAccount(acc)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isActive ? "border-primary/60 bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/60"
                    )}>
                    {/* Avatar avec initiale en fallback */}
                    <div className="relative w-9 h-9 rounded-full border border-border overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary z-10">
                        {acc.name?.charAt(0)?.toUpperCase() || "G"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{acc.name || acc.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
                    </div>
                    {isActive
                      ? <span className="text-xs text-primary font-medium shrink-0">Actif</span>
                      : <span className="text-xs text-muted-foreground shrink-0">Cliquer pour activer</span>
                    }
                    <button
                      onClick={e => { e.stopPropagation(); removeAccount(acc.email); }}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Résultat dernier import ── */}
      {result && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-3">
              <Check size={18} className="text-green-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">"{result.folderName}" importé</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">
                    {result.imported} vidéo{result.imported !== 1 ? "s" : ""}
                  </span>
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Modèle {result.modelCreated ? "créé" : "mis à jour"}
                  </span>
                  <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    🏷 Google Drive
                  </span>
                  {result.skipped > 0 && (
                    <span className="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
                      {result.skipped} doublon{result.skipped !== 1 ? "s" : ""}
                    </span>
                  )}
                  {result.errors > 0 && (
                    <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
                      {result.errors} erreur{result.errors !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Explorateur Drive ── */}
      {activeEmail && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderOpen size={18} className="text-primary" /> {activeName}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox checked={videoOnly} onCheckedChange={v => setVideoOnly(!!v)} className="scale-90" />
                    Vidéos uniquement
                  </label>
                  {selected.size > 0 && (
                    <Button size="sm" onClick={importSelected} disabled={importing} className="gap-1.5">
                      {importing
                        ? <><Loader2 size={14} className="animate-spin" /> {importPct}%</>
                        : <><Download size={14} /> Importer ({selected.size})</>
                      }
                    </Button>
                  )}
                </div>
              </div>

              {/* Barre de progression */}
              {importing && (
                <div className="space-y-1.5">
                  <Progress value={importPct} className="h-1.5" />
                  <p className="text-xs text-muted-foreground truncate">{importLabel}</p>
                </div>
              )}

              {/* Fil d'Ariane */}
              <div className="flex items-center gap-0.5 flex-wrap">
                {crumbs.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight size={12} className="text-muted-foreground/40" />}
                    <button
                      onClick={() => navigateTo(c, i)}
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded transition-colors",
                        i === crumbs.length - 1
                          ? "text-foreground font-medium cursor-default"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}>
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Sélection rapide */}
            {videoFiles.length > 0 && (
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-border/60">
                <button onClick={selectAll}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <CheckSquare size={14} />
                  {selected.size === videoFiles.length ? "Tout désélectionner" : `Tout sélectionner (${videoFiles.length})`}
                </button>
                {selected.size > 0 && (
                  <span className="text-xs text-primary">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
                )}
              </div>
            )}

            {/* Contenu */}
            {loadingFiles && files.length === 0 ? (
              <div className="flex items-center justify-center py-14 gap-2">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Chargement…</span>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderOpen size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Dossier vide</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {/* Dossiers */}
                {folderFiles.map(f => (
                  <div key={f.id}
                    className="flex items-center gap-2 px-2 py-2.5 rounded-lg hover:bg-muted/60 transition-colors group">
                    <button onClick={() => openFolder(f)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <FolderOpen size={17} className="text-yellow-500 shrink-0" />
                      <span className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{f.name}</span>
                    </button>
                    <Button
                      size="sm" variant="outline" disabled={importing}
                      onClick={() => importFolder(f)}
                      className="shrink-0 h-7 px-2 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <FolderInput size={12} /> Importer
                    </Button>
                    <button onClick={() => openFolder(f)} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}

                {/* Vidéos */}
                {videoFiles.map(f => {
                  const isSel = selected.has(f.id);
                  return (
                    <div key={f.id} onClick={() => toggleSel(f.id)}
                      className={cn(
                        "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all",
                        isSel ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                      )}>
                      <Checkbox checked={isSel} onCheckedChange={() => toggleSel(f.id)}
                        onClick={e => e.stopPropagation()} className="shrink-0" />
                      {f.thumbnailLink ? (
                        <img src={f.thumbnailLink.replace(/=s\d+/, "=s80")} alt={f.name}
                          className="w-10 h-10 rounded object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <Film size={16} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[fmtSize(f.size), f.mimeType?.split("/")[1]?.toUpperCase(), f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("fr-FR") : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Autres (non vidéo, non dossier) — grisés */}
                {otherFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-2 py-2 rounded-lg opacity-25">
                    <div className="w-4 shrink-0" />
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <Film size={14} className="text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate flex-1">{f.name}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Charger plus */}
            {moreToken && !loadingFiles && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm"
                  onClick={() => tokenRef.current && loadFolder(currentFolderId, tokenRef.current, true, moreToken)}>
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