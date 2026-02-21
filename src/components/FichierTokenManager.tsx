import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Key, Save, Trash2, Eye, EyeOff, CheckCircle, XCircle, Loader2, Plus, User, HardDrive, Clock, RefreshCw
} from "lucide-react";

interface TokenEntry {
  id: string;
  token: string;
  label: string;
  valid: boolean | null;
  accountInfo: any | null;
  testing: boolean;
}

interface FichierTokenManagerProps {
  onTokenValidated: (hasValid: boolean) => void;
}

const FichierTokenManager = ({ onTokenValidated }: FichierTokenManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showTokens, setShowTokens] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);

  // Load tokens from database
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("fichier_tokens")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading tokens:", error);
        // Fallback: migrate from localStorage
        migrateFromLocalStorage();
      } else if (data && data.length > 0) {
        const entries: TokenEntry[] = data.map(d => ({
          id: d.id,
          token: d.token,
          label: d.label,
          valid: d.is_valid,
          accountInfo: d.account_info,
          testing: false,
        }));
        setTokens(entries);
        // Sync legacy localStorage key for callOneFichier compatibility
        const active = entries.find(t => t.valid === true) || entries[0];
        if (active) localStorage.setItem("one_fichier_token", active.token);
        if (entries.some(t => t.valid === true)) onTokenValidated(true);
        // Re-test tokens with null validity
        entries.filter(t => t.valid === null).forEach(t => testToken(t.id, t.token));
      } else {
        // No tokens in DB, try migrate from localStorage
        migrateFromLocalStorage();
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const migrateFromLocalStorage = async () => {
    if (!user) return;
    // Check old localStorage tokens
    const oldMulti = localStorage.getItem("one_fichier_tokens");
    const oldSingle = localStorage.getItem("one_fichier_token");
    let toMigrate: { token: string; label: string }[] = [];

    if (oldMulti) {
      try {
        const parsed = JSON.parse(oldMulti);
        toMigrate = parsed.map((t: any) => ({ token: t.token, label: t.label || "Compte" }));
      } catch { }
    } else if (oldSingle) {
      toMigrate = [{ token: oldSingle, label: "Compte 1" }];
    }

    if (toMigrate.length > 0) {
      for (const t of toMigrate) {
        const { data, error } = await supabase
          .from("fichier_tokens")
          .insert({ user_id: user.id, token: t.token, label: t.label })
          .select()
          .single();
        if (data) {
          const entry: TokenEntry = { id: data.id, token: data.token, label: data.label, valid: null, accountInfo: null, testing: false };
          setTokens(prev => [...prev, entry]);
          testToken(data.id, data.token);
        }
      }
      // Cleanup localStorage
      localStorage.removeItem("one_fichier_tokens");
      toast({ title: "Tokens migrés", description: "Vos tokens ont été transférés vers le stockage sécurisé." });
    }
  };

  const testToken = useCallback(async (id: string, tokenValue: string) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, testing: true } : t));
    try {
      const { data, error } = await supabase.functions.invoke("one-fichier?action=account-info", {
        body: { _token: tokenValue },
      });
      const valid = !error && data?.valid;
      const accountInfo = valid ? data : null;

      setTokens(prev => {
        const next = prev.map(t => t.id === id ? { ...t, valid, accountInfo, testing: false } : t);
        const hasValid = next.some(t => t.valid === true);
        onTokenValidated(hasValid);
        // Keep legacy key in sync
        const active = next.find(t => t.valid === true) || next[0];
        if (active) localStorage.setItem("one_fichier_token", active.token);
        return next;
      });

      // Persist validation result to DB
      await supabase.from("fichier_tokens").update({
        is_valid: valid,
        account_info: accountInfo,
      }).eq("id", id);
    } catch {
      setTokens(prev => prev.map(t => t.id === id ? { ...t, valid: false, accountInfo: null, testing: false } : t));
      await supabase.from("fichier_tokens").update({ is_valid: false, account_info: null }).eq("id", id);
    }
  }, [onTokenValidated]);

  const addToken = async () => {
    if (!newToken.trim() || !user) return;
    const { data, error } = await supabase
      .from("fichier_tokens")
      .insert({ user_id: user.id, token: newToken.trim(), label: newLabel.trim() || `Compte ${tokens.length + 1}` })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Ce token existe déjà", variant: "destructive" });
      } else {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      }
      return;
    }

    const entry: TokenEntry = { id: data.id, token: data.token, label: data.label, valid: null, accountInfo: null, testing: false };
    setTokens(prev => [...prev, entry]);
    setNewToken("");
    setNewLabel("");
    setShowAddForm(false);
    toast({ title: "Token enregistré — vérification en cours..." });
    testToken(data.id, data.token);
  };

  const removeToken = async (id: string) => {
    await supabase.from("fichier_tokens").delete().eq("id", id);
    setTokens(prev => {
      const next = prev.filter(t => t.id !== id);
      onTokenValidated(next.some(t => t.valid === true));
      const active = next.find(t => t.valid === true) || next[0];
      if (active) localStorage.setItem("one_fichier_token", active.token);
      else localStorage.removeItem("one_fichier_token");
      return next;
    });
    toast({ title: "Token supprimé" });
  };

  const toggleShow = (id: string) => {
    setShowTokens(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "—";
    try { return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return dateStr; }
  };

  const formatSize = (bytes: number | undefined) => {
    if (!bytes) return "—";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1024) return `${(gb / 1024).toFixed(1)} To`;
    return `${gb.toFixed(1)} Go`;
  };

  const hasAnyToken = tokens.length > 0;
  const isChecking = tokens.some(t => t.testing);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-3">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Chargement des tokens...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key size={18} className="text-primary" />
          <h3 className="text-foreground font-semibold">Comptes 1fichier</h3>
          {isChecking && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 size={12} className="animate-spin" /> Vérification...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasAnyToken && (
            <Button size="sm" variant="ghost" onClick={() => tokens.forEach(t => testToken(t.id, t.token))} className="gap-1 text-xs">
              <RefreshCw size={12} /> Actualiser
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)} className="gap-1">
            <Plus size={14} /> Ajouter
          </Button>
        </div>
      </div>

      {/* Token list */}
      {tokens.map(t => (
        <div key={t.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
          {t.valid === true && t.accountInfo && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 rounded-lg p-3 bg-green-500/10">
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Statut</p>
                  <p className="text-sm font-medium text-green-500">Connecté</p>
                </div>
              </div>
              {t.accountInfo.email && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                  <User size={16} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium text-foreground truncate">{t.accountInfo.email}</p>
                  </div>
                </div>
              )}
              {t.accountInfo.offer && (
                <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-3">
                  <HardDrive size={16} className="text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Abonnement</p>
                    <p className="text-sm font-medium text-foreground">{t.accountInfo.offer}</p>
                  </div>
                </div>
              )}
              {t.accountInfo.subscription_end && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                  <Clock size={16} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Expire le</p>
                    <p className="text-sm font-medium text-foreground">{formatDate(t.accountInfo.subscription_end)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {t.valid === false && (
            <div className="flex items-center gap-3 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <XCircle size={18} />
              <div>
                <p className="font-medium text-sm">Token invalide ou expiré</p>
                <p className="text-xs opacity-80">Vérifiez votre token sur 1fichier.com/console/params.pl</p>
              </div>
            </div>
          )}

          {t.testing && (
            <div className="flex items-center gap-3 text-muted-foreground bg-muted rounded-lg p-4">
              <Loader2 size={18} className="animate-spin text-primary" />
              <div>
                <p className="font-medium text-sm text-foreground">Chargement du compte en cours...</p>
                <p className="text-xs">Connexion à l'API 1fichier et récupération des informations</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground min-w-[80px]">{t.label}</span>
            <div className="relative flex-1">
              <Input
                type={showTokens.has(t.id) ? "text" : "password"}
                value={t.token}
                readOnly
                className="pr-10 font-mono text-xs bg-muted/30"
              />
              <button type="button" onClick={() => toggleShow(t.id)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showTokens.has(t.id) ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button size="sm" variant="outline" onClick={() => testToken(t.id, t.token)} disabled={t.testing} className="gap-1">
              {t.testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => removeToken(t.id)} className="text-destructive hover:text-destructive">
              <Trash2 size={14} />
            </Button>
          </div>

          {t.valid === true && t.accountInfo && (t.accountInfo.used_space || t.accountInfo.available_storage) && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Stockage utilisé</span>
                <span>
                  {t.accountInfo.used_space ? formatSize(t.accountInfo.used_space) : "—"}
                  {t.accountInfo.available_storage ? ` / ${formatSize(t.accountInfo.available_storage)}` : ""}
                </span>
              </div>
              {t.accountInfo.used_space && t.accountInfo.available_storage && (
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (t.accountInfo.used_space / t.accountInfo.available_storage) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add form */}
      {(showAddForm || !hasAnyToken) && (
        <div className="rounded-xl border border-dashed border-border p-5 space-y-4 bg-card/50">
          <p className="text-sm font-medium text-foreground">
            {hasAnyToken ? "Ajouter un nouveau compte" : "Configurez votre token API 1fichier"}
          </p>
          <p className="text-xs text-muted-foreground">
            Trouvez votre token sur{" "}
            <a href="https://1fichier.com/console/params.pl" target="_blank" rel="noopener" className="text-primary underline">
              1fichier.com/console/params.pl
            </a>
            {" "}— Le token est stocké de manière sécurisée dans votre compte.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nom du compte (optionnel)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="sm:w-40"
            />
            <Input
              type="password"
              placeholder="Collez votre token API 1fichier..."
              value={newToken}
              onChange={e => setNewToken(e.target.value)}
              className="flex-1"
              onKeyDown={e => e.key === "Enter" && addToken()}
            />
            <Button onClick={addToken} disabled={!newToken.trim()} className="gap-1">
              <Save size={14} /> Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FichierTokenManager;
