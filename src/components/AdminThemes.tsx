import { useState, useEffect } from "react";
import { Palette, Plus, Trash2, Save, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ThemeColors {
  background: string;
  foreground: string;
  primary: string;
  "primary-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  card: string;
  "card-foreground": string;
  accent: string;
  "accent-foreground": string;
  muted: string;
  "muted-foreground": string;
  border: string;
}

interface Theme {
  id: string;
  name: string;
  description: string | null;
  colors: ThemeColors;
  is_default: boolean;
  is_active: boolean;
}

const DEFAULT_COLORS: ThemeColors = {
  background: "0 0% 8%",
  foreground: "0 0% 95%",
  primary: "0 85% 50%",
  "primary-foreground": "0 0% 100%",
  secondary: "0 0% 16%",
  "secondary-foreground": "0 0% 90%",
  card: "0 0% 11%",
  "card-foreground": "0 0% 95%",
  accent: "0 0% 20%",
  "accent-foreground": "0 0% 95%",
  muted: "0 0% 16%",
  "muted-foreground": "0 0% 60%",
  border: "0 0% 18%",
};

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  background: "Fond",
  foreground: "Texte",
  primary: "Primaire",
  "primary-foreground": "Texte primaire",
  secondary: "Secondaire",
  "secondary-foreground": "Texte secondaire",
  card: "Carte",
  "card-foreground": "Texte carte",
  accent: "Accent",
  "accent-foreground": "Texte accent",
  muted: "Atténué",
  "muted-foreground": "Texte atténué",
  border: "Bordure",
};

function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return "#808080";
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const AdminThemes = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColors, setNewColors] = useState<ThemeColors>({ ...DEFAULT_COLORS });
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchThemes = async () => {
    const { data } = await supabase.from("themes").select("*").order("created_at", { ascending: true });
    if (data) setThemes(data as unknown as Theme[]);
  };

  useEffect(() => { fetchThemes(); }, []);

  const startCreate = () => {
    setCreating(true);
    setEditingTheme(null);
    setNewName("");
    setNewDesc("");
    setNewColors({ ...DEFAULT_COLORS });
  };

  const startEdit = (theme: Theme) => {
    setCreating(false);
    setEditingTheme(theme);
    setNewName(theme.name);
    setNewDesc(theme.description || "");
    setNewColors({ ...theme.colors });
  };

  const handleSave = async () => {
    if (!newName.trim()) return;
    setSaving(true);

    if (creating) {
      const { error } = await supabase.from("themes").insert({
        name: newName,
        description: newDesc || null,
        colors: newColors as any,
        created_by: userId,
      } as any);
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      else { toast({ title: "Thème créé" }); setCreating(false); }
    } else if (editingTheme) {
      const { error } = await supabase.from("themes").update({
        name: newName,
        description: newDesc || null,
        colors: newColors as any,
      } as any).eq("id", editingTheme.id);
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      else { toast({ title: "Thème mis à jour" }); setEditingTheme(null); }
    }
    setSaving(false);
    fetchThemes();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("themes").delete().eq("id", id);
    toast({ title: "Thème supprimé" });
    if (editingTheme?.id === id) setEditingTheme(null);
    fetchThemes();
  };

  const toggleActive = async (theme: Theme) => {
    await supabase.from("themes").update({ is_active: !theme.is_active } as any).eq("id", theme.id);
    fetchThemes();
  };

  const setDefault = async (id: string) => {
    await supabase.from("themes").update({ is_default: false } as any).neq("id", id);
    await supabase.from("themes").update({ is_default: true } as any).eq("id", id);
    toast({ title: "Thème par défaut modifié" });
    fetchThemes();
  };

  const isEditing = creating || !!editingTheme;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Palette size={20} className="text-primary" /> Thèmes ({themes.length})
        </h2>
        <Button onClick={startCreate} size="sm" disabled={creating}>
          <Plus size={16} className="mr-1" /> Nouveau thème
        </Button>
      </div>

      {/* Theme list */}
      <div className="grid gap-3">
        {themes.map((theme) => (
          <div key={theme.id} className={cn(
            "flex items-center gap-4 bg-card border rounded-lg px-4 py-3",
            editingTheme?.id === theme.id ? "border-primary" : "border-border"
          )}>
            {/* Color preview dots */}
            <div className="flex gap-1 shrink-0">
              {["primary", "background", "secondary", "accent"].map((k) => (
                <div
                  key={k}
                  className="w-5 h-5 rounded-full border border-border"
                  style={{ backgroundColor: `hsl(${(theme.colors as any)[k] || "0 0% 50%"})` }}
                />
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground text-sm">{theme.name}</span>
                {theme.is_default && (
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">Défaut</span>
                )}
                {!theme.is_active && (
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Inactif</span>
                )}
              </div>
              {theme.description && (
                <p className="text-xs text-muted-foreground truncate">{theme.description}</p>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => toggleActive(theme)} className="text-xs">
                {theme.is_active ? "Désactiver" : "Activer"}
              </Button>
              {!theme.is_default && theme.is_active && (
                <Button variant="ghost" size="sm" onClick={() => setDefault(theme.id)} className="text-xs">
                  Défaut
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => startEdit(theme)}>
                <Eye size={14} />
              </Button>
              {!theme.is_default && (
                <Button variant="ghost" size="sm" onClick={() => handleDelete(theme.id)}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Editor */}
      {isEditing && (
        <section className="bg-card border border-primary/30 rounded-lg p-6 space-y-5">
          <h3 className="text-lg font-semibold text-foreground">
            {creating ? "Nouveau thème" : `Modifier : ${editingTheme?.name}`}
          </h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Nom</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Description</label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={200} />
            </div>
          </div>

          {/* Color pickers */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Couleurs (HSL)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((key) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{COLOR_LABELS[key]}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={hslToHex(newColors[key])}
                      onChange={(e) => setNewColors((prev) => ({ ...prev, [key]: hexToHsl(e.target.value) }))}
                      className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                    />
                    <span className="text-xs text-muted-foreground font-mono">{newColors[key]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Aperçu</h4>
            <div
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: `hsl(${newColors.background})`,
                borderColor: `hsl(${newColors.border})`,
                color: `hsl(${newColors.foreground})`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="px-3 py-1.5 rounded text-sm font-medium"
                  style={{ backgroundColor: `hsl(${newColors.primary})`, color: `hsl(${newColors["primary-foreground"]})` }}>
                  Bouton primaire
                </div>
                <div className="px-3 py-1.5 rounded text-sm"
                  style={{ backgroundColor: `hsl(${newColors.secondary})`, color: `hsl(${newColors["secondary-foreground"]})` }}>
                  Secondaire
                </div>
                <div className="px-3 py-1.5 rounded text-sm"
                  style={{ backgroundColor: `hsl(${newColors.accent})`, color: `hsl(${newColors["accent-foreground"]})` }}>
                  Accent
                </div>
              </div>
              <div className="rounded p-3" style={{ backgroundColor: `hsl(${newColors.card})`, color: `hsl(${newColors["card-foreground"]})` }}>
                <p className="text-sm font-medium">Carte exemple</p>
                <p className="text-xs" style={{ color: `hsl(${newColors["muted-foreground"]})` }}>Texte atténué de description</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !newName.trim()}>
              <Save size={16} className="mr-1" /> {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setEditingTheme(null); }}>
              Annuler
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminThemes;
