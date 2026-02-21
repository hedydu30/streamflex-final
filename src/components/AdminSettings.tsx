import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Save, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from "lucide-react";

const AdminSettings = () => {
  const { toast } = useToast();
  const [alldebridToken, setAlldebridToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"unknown" | "valid" | "invalid">("unknown");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("id", "alldebrid_token")
      .maybeSingle();
    if (data?.value) {
      setAlldebridToken(data.value);
      setTokenStatus("unknown");
    }
    setLoading(false);
  };

  const saveToken = async () => {
    if (!alldebridToken.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase
      .from("admin_settings")
      .upsert({
        id: "alldebrid_token",
        value: alldebridToken.trim(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Token AllDebrid sauvegardé" });
    }
    setSaving(false);
  };

  const testToken = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-alldebrid", {
        body: { token: alldebridToken },
      });
      if (!error && data?.status === "success") {
        setTokenStatus("valid");
        toast({ title: "Token valide", description: `Compte: ${data.data?.user?.username || "OK"}` });
      } else {
        setTokenStatus("invalid");
        toast({ title: "Token invalide", description: data?.error?.message || "Erreur", variant: "destructive" });
      }
    } catch {
      setTokenStatus("invalid");
      toast({ title: "Erreur de test", variant: "destructive" });
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Settings size={20} className="text-primary" /> Paramètres
      </h2>

      <section className="bg-card border border-border rounded-lg p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">AllDebrid - Débrideur de liens</h3>
          <p className="text-sm text-muted-foreground">
            Les liens 1fichier seront automatiquement débridés via AllDebrid avant la lecture pour éviter le blocage IP.
            Obtenez votre token API sur{" "}
            <a href="https://alldebrid.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              alldebrid.com/apikeys
            </a>
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Token API AllDebrid</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? "text" : "password"}
                value={alldebridToken}
                onChange={(e) => { setAlldebridToken(e.target.value); setTokenStatus("unknown"); }}
                placeholder="Collez votre token API AllDebrid ici..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Button onClick={saveToken} disabled={saving || !alldebridToken.trim()}>
              <Save size={16} className="mr-1" />
              {saving ? "..." : "Sauvegarder"}
            </Button>
            <Button variant="outline" onClick={testToken} disabled={testing || !alldebridToken.trim()}>
              {testing ? <Loader2 size={16} className="animate-spin" /> : tokenStatus === "valid" ? <CheckCircle size={16} className="text-green-500" /> : tokenStatus === "invalid" ? <XCircle size={16} className="text-destructive" /> : null}
              <span className="ml-1">Tester</span>
            </Button>
          </div>

          {tokenStatus === "valid" && (
            <p className="text-sm text-green-500 flex items-center gap-1">
              <CheckCircle size={14} /> Token valide et fonctionnel
            </p>
          )}
          {tokenStatus === "invalid" && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <XCircle size={14} /> Token invalide ou expiré
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminSettings;
