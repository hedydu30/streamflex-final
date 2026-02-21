import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePlayerSettings, PlayerSettings } from "@/hooks/usePlayerSettings";
import PlayerSettingsPanel from "@/components/PlayerSettingsPanel";
import { Loader2 } from "lucide-react";

const AdminPlayerSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings, loading, save } = usePlayerSettings();
  const [local, setLocal] = useState<PlayerSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(settings); }, [settings]);

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    await save(local, user.id);
    toast({ title: "Format du player appliqué en temps réel" });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: "80vh", minHeight: "400px" }}>
      <PlayerSettingsPanel
        settings={local}
        onChange={setLocal}
        onSave={handleSave}
        saving={saving}
        hasChanges={hasChanges}
      />
    </div>
  );
};

export default AdminPlayerSettings;
