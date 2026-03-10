import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  HardDrive, Plus, Trash2, FolderOpen, Film, Loader2,
  CheckSquare, Download, Settings, X, ChevronRight,
  Eye, EyeOff, FolderInput, Check, ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────
interface SavedAccount { email: string; name: string }
interface DriveFile {
  id: string; name: string; mimeType: string;
  size?: string; thumbnailLink?: string;
  webContentLink?: string; webViewLink?: string; modifiedTime?: string;
}
interface Crumb { id: string; name: string }
interface ImportResult {
  folderName: string; modelCreated: boolean;
  imported: number; skipped: number; errors: number;
}

// ─── Constantes ──────────────────────────────────────────────
const VIDEO_MIME = [
  "video/mp4","video/x-matroska","video/webm","video/avi",
  "video/quicktime","video/x-msvideo","video/x-ms-wmv",
  "video/mpeg","video/3gpp","video/x-flv","video/ogg",
  "video/x-m4v","video/mp2t","video/mkv","video/x-ms-asf",
  "video/divx","video/h264","video/h265",
];
// Extensions vidéo reconnues (fallback si mimeType = application/octet-stream)
const VIDEO_EXT = new Set([
  "mp4","mkv","avi","mov","wmv","flv","webm","m4v","mpg","mpeg",
  "3gp","ts","mts","m2ts","vob","ogv","rm","rmvb","divx","hevc","h264","h265",
]);
const FOLDER_MIME   = "application/vnd.google-apps.folder";
const CLIENT_ID_KEY = "sf_gdrive_client_id";
const ACCOUNTS_KEY  = "sf_gdrive_accounts";
const SCOPES        = "https://www.googleapis.com/auth/drive.readonly openid email profile";

// ─── Helpers ─────────────────────────────────────────────────
function loadSaved(): SavedAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); } catch { return []; }
}
function persistSaved(a: SavedAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a));
}
/** Détecte si un fichier Drive est une vidéo (mimeType OU extension) */
function isVideo(f: { name: string; mimeType: string }): boolean {
  if (VIDEO_MIME.includes(f.mimeType)) return true;
  // Fallback extension pour fichiers uploadés avec application/octet-stream
  const ext = f.name.split(".").pop()?.toLowerCase() || "";
  return VIDEO_EXT.has(ext);
}

function fmtSize(b?: string) {
  if (!b) return "";
  const n = parseInt(b);
  if (n >= 1e9) return `${(n/1e9).toFixed(1)} Go`;
  if (n >= 1e6) return `${(n/1e6).toFixed(0)} Mo`;
  return `${(n/1024).toFixed(0)} Ko`;
}

async function loadScripts() {
  await new Promise<void>(res => {
    if ((window as any).gapi) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = () => (window as any).gapi.load("client", res);
    document.head.appendChild(s);
  });
  await new Promise<void>(res => {
    if ((window as any).google?.accounts) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => res();
    document.head.appendChild(s);
  });
  try { await (window as any).gapi.client.init({}); } catch {}
}

/**
 * Liste le contenu direct d'un dossier (affichage explorateur)
 * Inclut orderBy pour un rendu agréable
 */
async function listFolderDirect(
  token: string, folderId: string, videoOnly: boolean, pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  let q = `'${folderId}' in parents and trashed = false`;
  if (videoOnly) {
    const types = VIDEO_MIME.map(t => `mimeType='${t}'`).join(" or ");
    q += ` and (mimeType='${FOLDER_MIME}' or ${types})`;
  }
  const params = new URLSearchParams({
    q,
    fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink,modifiedTime)",
    pageSize: "200",
    orderBy: "folder,name",
    ...(pageToken ? { pageToken } : {}),
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }));
    throw new Error(err?.error?.message || `Drive API ${r.status}`);
  }
  return r.json();
}

/**
 * Scan récursif — SANS orderBy (incompatible avec pagination drive)
 * Retourne toutes les vidéos dans le dossier et ses sous-dossiers
 */
async function scanAllVideos(
  token: string,
  rootFolderId: string,
  onProgress: (msg: string) => void
): Promise<DriveFile[]> {
  const videos: DriveFile[] = [];
  const queue: string[] = [rootFolderId];
  let scannedFolders = 0;

  while (queue.length > 0) {
    const folderId = queue.shift()!;
    scannedFolders++;
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink,modifiedTime)",
        pageSize: "1000",
        ...(pageToken ? { pageToken } : {}),
      });

      const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!r.ok) {
        const errBody = await r.json().catch(() => null);
        console.error("Drive scan error:", r.status, errBody);
        throw new Error(`Drive API ${r.status}: ${errBody?.error?.message || "erreur inconnue"}`);
      }

      const data = await r.json();
      const items: DriveFile[] = data.files || [];

      for (const f of items) {
        if (f.mimeType === FOLDER_MIME) {
          queue.push(f.id);
        } else if (isVideo(f)) {
          videos.push(f);
        } else {
          // Debug : log les fichiers ignorés pour diagnostic
          console.debug(`[GDrive] Ignoré: ${f.name} (${f.mimeType})`);
        }
      }

      pageToken = data.nextPageToken;
      onProgress(`${videos.length} vidéo${videos.length > 1 ? "s" : ""} · ${scannedFolders + queue.length} dossier${queue.length > 0 ? "s restants" : "s scannés"}`);
    } while (pageToken);
  }

  return videos;
}

// ─── Composant principal ─────────────────────────────────────
export default function GoogleDriveImport({ onImported }: { onImported?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Config Client ID
  const [clientId, setClientId]   = useState(() => localStorage.getItem(CLIENT_ID_KEY) || "");
  const [showSetup, setShowSetup] = useState(false);
  const [cidDraft, setCidDraft]   = useState("");
  const [showCid, setShowCid]     = useState(false);

  // Comptes sauvegardés
  const [accounts, setAccounts]   = useState<SavedAccount[]>(loadSaved);

  // Token et email en refs pour éviter tout problème de closure
  const tokenRef = useRef<string | null>(null);
  const emailRef = useRef<string | null>(null);

  // État UI du compte actif
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [activeName, setActiveName]   = useState("");

  // Explorateur
  const [crumbs, setCrumbs]       = useState<Crumb[]>([{ id: "root", name: "Mon Drive" }]);
  const [files, setFiles]         = useState<DriveFile[]>([]);
  const [moreToken, setMoreToken] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [videoOnly, setVideoOnly] = useState(false);

  // Sélection & import
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importMsg, setImportMsg] = useState("");
  const [result, setResult]       = useState<ImportResult | null>(null);

  const currentId = crumbs[crumbs.length - 1].id;

  // ── Charger un dossier ──────────────────────────────────
  const loadFolder = useCallback(async (
    folderId: string, token: string, append = false, pageToken?: string
  ) => {
    setLoading(true);
    try {
      const data = await listFolderDirect(token, folderId, videoOnly, pageToken);
      setFiles(prev => append ? [...prev, ...(data.files || [])] : (data.files || []));
      setMoreToken(data.nextPageToken || null);
    } catch (e: any) {
      toast({ title: "Erreur Drive", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [videoOnly, toast]);

  // Recharger si filtre change
  useEffect(() => {
    if (tokenRef.current && currentId) {
      setFiles([]);
      loadFolder(currentId, tokenRef.current);
    }
  }, [videoOnly]);

  // ── OAuth ───────────────────────────────────────────────
  const getToken = useCallback(async (hint?: string, prompt = "select_account consent"): Promise<string> => {
    const cid = localStorage.getItem(CLIENT_ID_KEY) || "";
    if (!cid) { setShowSetup(true); throw new Error("Client ID manquant"); }
    await loadScripts();
    return new Promise((resolve, reject) => {
      (window as any).google.accounts.oauth2.initTokenClient({
        client_id: cid, scope: SCOPES, hint, prompt,
        callback: (r: any) => r.error ? reject(new Error(r.error)) : resolve(r.access_token),
      }).requestAccessToken();
    });
  }, []);

  // ── Activer un compte avec token ────────────────────────
  // Pas de useCallback pour éviter closure périmée sur loadFolder
  const activateAccount = async (token: string, email: string, name: string) => {
    tokenRef.current = token;
    emailRef.current = email;
    setActiveEmail(email);
    setActiveName(name);
    setCrumbs([{ id: "root", name: "Mon Drive" }]);
    setFiles([]); setSelected(new Set()); setResult(null);
    // Charger directement sans passer par loadFolder (évite closure périmée)
    setLoading(true);
    try {
      const data = await listFolderDirect(token, "root", false);
      setFiles(data.files || []);
      setMoreToken(data.nextPageToken || null);
    } catch (e: any) {
      toast({ title: "Erreur Drive", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Ajouter un compte ───────────────────────────────────
  const addAccount = async () => {
    try {
      const token = await getToken(undefined, "select_account consent");
      const userinfoResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userinfoResp.ok) throw new Error(`Userinfo ${userinfoResp.status}`);
      const info = await userinfoResp.json();
      if (!info.email) throw new Error("Email non reçu — vérifiez les scopes OAuth");
      const displayName = info.name || [info.given_name, info.family_name].filter(Boolean).join(" ") || info.email;
      const acc: SavedAccount = { email: info.email, name: displayName };
      setAccounts(prev => {
        const u = [...prev.filter(a => a.email !== info.email), acc];
        persistSaved(u); return u;
      });
      await activateAccount(token, info.email, displayName);
      toast({ title: `✅ ${info.email} connecté` });
    } catch (e: any) {
      if (!e.message.includes("popup_closed") && !e.message.includes("access_denied"))
        toast({ title: "Erreur connexion", description: e.message, variant: "destructive" });
    }
  };

  // ── Sélectionner un compte sauvegardé ──────────────────
  const selectAccount = async (acc: SavedAccount) => {
    if (acc.email === emailRef.current) return;
    try {
      const token = await getToken(acc.email, "").catch(() => getToken(acc.email, "select_account"));
      await activateAccount(token, acc.email, acc.name);
    } catch (e: any) {
      if (!e.message.includes("popup_closed"))
        toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const removeAccount = (email: string) => {
    setAccounts(prev => { const u = prev.filter(a => a.email !== email); persistSaved(u); return u; });
    if (email === emailRef.current) {
      tokenRef.current = null; emailRef.current = null;
      setActiveEmail(null); setActiveName(""); setFiles([]);
      setCrumbs([{ id: "root", name: "Mon Drive" }]);
    }
  };

  // ── Navigation ──────────────────────────────────────────
  const openFolder = (f: DriveFile) => {
    if (!tokenRef.current) return;
    setCrumbs(prev => [...prev, { id: f.id, name: f.name }]);
    setFiles([]); setSelected(new Set()); setMoreToken(null);
    loadFolder(f.id, tokenRef.current!);
  };

  const goToCrumb = (c: Crumb, i: number) => {
    if (!tokenRef.current) return;
    setCrumbs(prev => prev.slice(0, i + 1));
    setFiles([]); setSelected(new Set()); setMoreToken(null);
    loadFolder(c.id, tokenRef.current!);
  };

  // ── Upsert modèle ───────────────────────────────────────
  const upsertModel = async (name: string) => {
    if (!user) throw new Error("Non authentifié");
    const { data: ex } = await supabase.from("models").select("id")
      .eq("user_id", user.id).eq("name", name).maybeSingle();
    if (ex) return { id: ex.id, created: false };
    const { data: nm, error } = await supabase.from("models")
      .insert({ user_id: user.id, name, source_platform: "gdrive" })
      .select("id").single();
    if (error) throw error;
    return { id: nm.id, created: true };
  };

  // ── Insérer une vidéo — utilise les refs pour email ────
  const insertVideo = async (
    file: DriveFile, modelId: string, folderName: string, folderPath: string,
    onFirstError?: (msg: string) => void
  ): Promise<"ok"|"dupe"|"error"> => {
    if (!user) return "error";
    const ext = file.name.split(".").pop()?.toLowerCase() || null;
    // Construire l'URL de lecture (webViewLink en priorité — toujours accessible)
    const url = file.webViewLink || file.webContentLink || `https://drive.google.com/file/d/${file.id}/view`;
    const driveAccount = emailRef.current || "";
    // Utiliser exactement les mêmes champs que les autres imports (coomer/bulk)
    const { error } = await supabase.from("imported_videos").insert({
      source: "gdrive",
      title: file.name.replace(/\.[^.]+$/, ""),
      original_url: url,
      download_url: url,
      thumbnail_url: file.thumbnailLink?.replace(/=s\d+/, "=s400") || null,
      model_id: modelId,
      metadata: {
        tag: "google_drive",
        fileId: file.id,
        mimeType: file.mimeType,
        ext,
        fileSize: file.size || null,
        driveAccount,
        folderName,
        folderPath,
        webViewLink: file.webViewLink || null,
        webContentLink: file.webContentLink || null,
        modifiedTime: file.modifiedTime || null,
      },
    });
    if (!error) return "ok";
    if (error.code === "23505") return "dupe";
    // Afficher la vraie erreur (première occurrence seulement)
    const msg = `${error.message} [code: ${error.code}]`;
    console.error("Erreur insertion vidéo:", file.name, error);
    onFirstError?.(msg);
    return "error";
  };

  // ── Import dossier récursif ─────────────────────────────
  const importFolder = async (folder: DriveFile) => {
    if (!user || !tokenRef.current || importing) return;
    const token = tokenRef.current; // capture locale pour éviter mutation
    setImporting(true); setImportPct(0); setResult(null);
    setImportMsg(`Scan de "${folder.name}"…`);

    try {
      console.log("Import dossier:", folder.name, folder.id);

      // Scan récursif complet
      const videos = await scanAllVideos(token, folder.id, msg => setImportMsg(msg));
      console.log(`Trouvé ${videos.length} vidéos dans "${folder.name}"`);

      if (videos.length === 0) {
        toast({
          title: "Aucune vidéo trouvée",
          description: `"${folder.name}" et ses sous-dossiers ne contiennent aucun fichier vidéo reconnu. Vérifiez la console pour les types de fichiers ignorés.`,
          variant: "destructive",
        });
        setImporting(false); return;
      }

      // Upsert modèle (crée ou trouve par nom)
      const { id: modelId, created: modelCreated } = await upsertModel(folder.name);
      const folderPath = [...crumbs.map(c => c.name), folder.name].join(" / ");

      let done = 0, skipped = 0, errors = 0;
      for (const f of videos) {
        let firstError = "";
        const r = await insertVideo(f, modelId, folder.name, folderPath, (msg) => {
          if (!firstError) firstError = msg;
        });
        if (r === "dupe") skipped++;
        else if (r === "error") {
          errors++;
          // Afficher la première erreur dans le toast final
          if (errors === 1 && firstError) console.warn("Première erreur DB:", firstError);
        }
        done++;
        setImportPct(Math.round(done / videos.length * 100));
        setImportMsg(`${done}/${videos.length} — ${f.name}`);
      }

      const imported = done - skipped - errors;
      setResult({ folderName: folder.name, modelCreated, imported, skipped, errors });
      if (imported > 0) onImported?.();
      toast({
        title: imported > 0 ? `✅ "${folder.name}"` : `⚠️ "${folder.name}" — 0 vidéos importées`,
        description: imported > 0
          ? `${imported} vidéo${imported !== 1 ? "s" : ""} · modèle ${modelCreated ? "créé" : "mis à jour"}${skipped ? ` · ${skipped} doublon${skipped !== 1 ? "s" : ""}` : ""}${errors ? ` · ${errors} erreur${errors !== 1 ? "s" : ""}` : ""}`
          : `${errors} erreur${errors !== 1 ? "s" : ""} DB · Consultez la console (F12) pour le détail`,
        variant: imported > 0 ? "default" : "destructive",
      });
    } catch (e: any) {
      console.error("Import error:", e);
      toast({ title: "Erreur import", description: e.message, variant: "destructive" });
    }
    setImporting(false); setImportMsg("");
  };

  // ── Import sélection manuelle ───────────────────────────
  const importSelected = async () => {
    if (!user || !tokenRef.current || !selected.size || importing) return;
    setImporting(true); setImportPct(0); setResult(null);
    const folderName = crumbs[crumbs.length - 1].name;
    setImportMsg(`Modèle "${folderName}"…`);

    try {
      const { id: modelId, created: modelCreated } = await upsertModel(folderName);
      const toImport = files.filter(f => selected.has(f.id));
      const folderPath = crumbs.map(c => c.name).join(" / ");
      let done = 0, skipped = 0, errors = 0;
      for (const f of toImport) {
        const r = await insertVideo(f, modelId, folderName, folderPath, (msg) => {
          console.warn("Erreur insertion:", msg);
        });
        if (r === "dupe") skipped++; else if (r === "error") errors++;
        done++;
        setImportPct(Math.round(done / toImport.length * 100));
        setImportMsg(`${done}/${toImport.length} — ${f.name}`);
      }
      const imported = done - skipped - errors;
      setResult({ folderName, modelCreated, imported, skipped, errors });
      setSelected(new Set()); onImported?.();
      toast({
        title: "Import terminé",
        description: `${imported} vidéo${imported !== 1 ? "s" : ""} · "${folderName}" ${modelCreated ? "créé" : "mis à jour"}`,
      });
    } catch (e: any) {
      toast({ title: "Erreur import", description: e.message, variant: "destructive" });
    }
    setImporting(false); setImportMsg("");
  };

  // ─── UI ────────────────────────────────────────────────
  const videoFiles  = files.filter(f => isVideo(f));
  const folderFiles = files.filter(f => f.mimeType === FOLDER_MIME);
  const otherFiles  = files.filter(f => f.mimeType !== FOLDER_MIME && !isVideo(f));

  const toggleSel = (id: string) =>
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(selected.size === videoFiles.length ? new Set() : new Set(videoFiles.map(f => f.id)));

  return (
    <div className="space-y-4">

      {/* Dialog config Client ID */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive size={18} className="text-primary" /> Configuration Google Drive
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs pt-1">Configuration unique — quelques minutes</div>
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 text-xs text-muted-foreground">
            {[
              <><a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">console.cloud.google.com <ExternalLink size={10} /></a> → Créer un projet</>,
              <>APIs &amp; Services → Activer <strong className="text-foreground">Google Drive API</strong></>,
              <>Identifiants → Créer → <strong className="text-foreground">ID client OAuth 2.0</strong> → Application Web</>,
              <>Origines JS autorisées : <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{window.location.origin}</code></>,
              "Copier le Client ID et coller ci-dessous",
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Input
                type={showCid ? "text" : "password"}
                placeholder="xxxxxxxxx.apps.googleusercontent.com"
                value={cidDraft}
                onChange={e => setCidDraft(e.target.value)}
                className="pr-10 font-mono text-xs"
                autoFocus
              />
              <button onClick={() => setShowCid(!showCid)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCid ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button disabled={!cidDraft.trim()} onClick={() => {
              localStorage.setItem(CLIENT_ID_KEY, cidDraft.trim());
              setClientId(cidDraft.trim());
              setShowSetup(false);
              toast({ title: "Client ID enregistré" });
              setTimeout(addAccount, 300);
            }}>
              Enregistrer
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Stocké localement, jamais envoyé à nos serveurs.</p>
        </DialogContent>
      </Dialog>

      {/* Comptes */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive size={18} className="text-primary" /> Comptes Google Drive
            </CardTitle>
            <div className="flex items-center gap-2">
              {clientId && (
                <button onClick={() => { setCidDraft(clientId); setShowSetup(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted">
                  <Settings size={15} />
                </button>
              )}
              <Button onClick={addAccount} className="gap-2">
                <Plus size={15} /> Ajouter un compte Google
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <HardDrive size={36} className="mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium mb-1">Aucun compte connecté</p>
              <p className="text-xs">Cliquez sur "Ajouter un compte Google"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map(acc => {
                const isActive = acc.email === activeEmail;
                return (
                  <div key={acc.email} onClick={() => selectAccount(acc)}
                    className={cn("flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none",
                      isActive
                        ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
                        : "border-border bg-muted/20 hover:bg-muted/50")}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                      {acc.name?.charAt(0)?.toUpperCase() || "G"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{acc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{acc.email}</p>
                    </div>
                    {isActive
                      ? <span className="text-xs font-medium text-primary shrink-0 bg-primary/10 px-2 py-0.5 rounded-full">Actif</span>
                      : <span className="text-xs text-muted-foreground shrink-0">Activer</span>}
                    <button onClick={e => { e.stopPropagation(); removeAccount(acc.email); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Résultat import */}
      {result && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-green-500/30 bg-green-500/5">
          <Check size={18} className="text-green-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-2">"{result.folderName}" importé</p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">{result.imported} vidéo{result.imported !== 1 ? "s" : ""}</span>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">Modèle {result.modelCreated ? "créé" : "mis à jour"}</span>
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">🏷 Google Drive</span>
              {result.skipped > 0 && <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">{result.skipped} doublon{result.skipped !== 1 ? "s" : ""}</span>}
              {result.errors > 0 && <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">{result.errors} erreur{result.errors !== 1 ? "s" : ""}</span>}
            </div>
          </div>
          <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* Explorateur Drive */}
      {activeEmail && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                    {activeName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">{activeName}</p>
                    <p className="text-xs text-muted-foreground">{activeEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <Checkbox checked={videoOnly} onCheckedChange={v => setVideoOnly(!!v)} className="scale-90" />
                    Vidéos seulement
                  </label>
                  {selected.size > 0 && (
                    <Button size="sm" onClick={importSelected} disabled={importing} className="gap-1.5">
                      {importing
                        ? <><Loader2 size={13} className="animate-spin" />{importPct}%</>
                        : <><Download size={13} />Importer ({selected.size})</>}
                    </Button>
                  )}
                </div>
              </div>

              {importing && (
                <div className="space-y-1.5">
                  <Progress value={importPct} className="h-1.5" />
                  <p className="text-xs text-muted-foreground truncate">{importMsg}</p>
                </div>
              )}

              {/* Fil d'Ariane */}
              <div className="flex items-center gap-0.5 flex-wrap">
                {crumbs.map((c, i) => (
                  <span key={`${c.id}-${i}`} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight size={12} className="text-muted-foreground/40" />}
                    <button onClick={() => goToCrumb(c, i)}
                      className={cn("text-xs px-1.5 py-0.5 rounded transition-colors",
                        i === crumbs.length - 1
                          ? "text-foreground font-medium cursor-default"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {videoFiles.length > 0 && (
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-border/50">
                <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <CheckSquare size={13} />
                  {selected.size === videoFiles.length ? "Tout désélectionner" : `Tout sélectionner (${videoFiles.length})`}
                </button>
                {selected.size > 0 && <span className="text-xs text-primary">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>}
              </div>
            )}

            {loading && !files.length ? (
              <div className="flex items-center justify-center py-14 gap-2 text-muted-foreground">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-sm">Chargement…</span>
              </div>
            ) : !files.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderOpen size={28} className="mx-auto mb-2 opacity-25" />
                <p className="text-sm">Dossier vide</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {/* Dossiers avec bouton Importer au survol */}
                {folderFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-2 px-2 py-2.5 rounded-lg hover:bg-muted/60 transition-colors group">
                    <button onClick={() => openFolder(f)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <FolderOpen size={16} className="text-yellow-500 shrink-0" />
                      <span className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{f.name}</span>
                    </button>
                    <Button size="sm" variant="outline" disabled={importing}
                      onClick={() => importFolder(f)}
                      className="shrink-0 h-7 px-2.5 text-xs gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity border-primary/40 text-primary hover:bg-primary/10">
                      <FolderInput size={12} /> Importer
                    </Button>
                    <button onClick={() => openFolder(f)} className="text-muted-foreground/30 group-hover:text-muted-foreground shrink-0">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}

                {/* Vidéos */}
                {videoFiles.map(f => {
                  const isSel = selected.has(f.id);
                  return (
                    <div key={f.id} onClick={() => toggleSel(f.id)}
                      className={cn("flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all",
                        isSel ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/40")}>
                      <Checkbox checked={isSel} onCheckedChange={() => toggleSel(f.id)} onClick={e => e.stopPropagation()} className="shrink-0" />
                      {f.thumbnailLink
                        ? <img src={f.thumbnailLink.replace(/=s\d+/, "=s80")} alt={f.name} className="w-10 h-10 rounded object-cover border border-border shrink-0" />
                        : <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0"><Film size={15} className="text-muted-foreground" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[fmtSize(f.size), f.mimeType?.split("/")[1]?.toUpperCase(),
                            f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("fr-FR") : null
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Autres fichiers grisés */}
                {otherFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-2 py-2 rounded-lg opacity-20 pointer-events-none">
                    <div className="w-4 shrink-0" />
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0"><Film size={13} className="text-muted-foreground" /></div>
                    <p className="text-xs text-muted-foreground truncate flex-1">{f.name} <span className="opacity-60">({f.mimeType})</span></p>
                  </div>
                ))}
              </div>
            )}

            {moreToken && !loading && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm"
                  onClick={() => tokenRef.current && loadFolder(currentId, tokenRef.current, true, moreToken)}>
                  Charger plus
                </Button>
              </div>
            )}
            {loading && files.length > 0 && (
              <div className="mt-3 flex justify-center"><Loader2 size={15} className="animate-spin text-primary" /></div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}