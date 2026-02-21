import { useState } from "react";
import { Key, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ActivateKeyModalProps {
  onClose: () => void;
  onActivated: () => void;
}

const ActivateKeyModal = ({ onClose, onActivated }: ActivateKeyModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keyCode, setKeyCode] = useState("");
  const [activating, setActivating] = useState(false);

  const formatKeyInput = (value: string) => {
    const clean = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 25);
    const parts = clean.match(/.{1,5}/g) || [];
    return parts.join("-");
  };

  const handleActivate = async () => {
    if (!user) return;
    const cleanKey = keyCode.replace(/-/g, "");
    if (cleanKey.length !== 25) {
      toast({ title: "Clé invalide", description: "La clé doit contenir 25 caractères.", variant: "destructive" });
      return;
    }

    setActivating(true);
    const formattedKey = cleanKey.match(/.{1,5}/g)!.join("-");
    
    const { data, error } = await supabase.rpc("activate_premium_key", { p_key_code: formattedKey });

    if (error) {
      toast({ title: "Erreur", description: "Une erreur est survenue.", variant: "destructive" });
    } else if (data && typeof data === "object") {
      const result = data as any;
      if (result.success) {
        toast({
          title: "🎉 Premium activé !",
          description: `Durée : ${result.duration_label}${result.expires_at ? ` • Expire le ${new Date(result.expires_at).toLocaleDateString("fr-FR")}` : " • À vie"}`,
        });
        onActivated();
        onClose();
      } else {
        toast({ title: "Échec", description: result.error || "Clé invalide.", variant: "destructive" });
      }
    }
    setActivating(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-lg p-8 max-w-md w-full mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Activer Premium</h2>
            <p className="text-sm text-muted-foreground">Entrez votre clé de 25 caractères</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={keyCode}
              onChange={(e) => setKeyCode(formatKeyInput(e.target.value))}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              maxLength={29}
              className="w-full bg-secondary text-foreground rounded px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-primary border border-border font-mono tracking-wider text-center placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-secondary text-secondary-foreground px-4 py-2.5 rounded font-medium hover:bg-accent transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleActivate}
              disabled={activating || keyCode.replace(/-/g, "").length !== 25}
              className="flex-1 bg-primary text-primary-foreground px-4 py-2.5 rounded font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {activating ? "Activation..." : "Activer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivateKeyModal;
