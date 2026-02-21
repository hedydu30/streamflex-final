import { useState, useEffect, useCallback } from "react";
import { Palette, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ColorDef {
  key: string;
  label: string;
  cssVar: string;
}

const COLOR_DEFS: ColorDef[] = [
  { key: "background", label: "Arrière-plan", cssVar: "--background" },
  { key: "foreground", label: "Texte", cssVar: "--foreground" },
  { key: "primary", label: "Primaire", cssVar: "--primary" },
  { key: "primary-foreground", label: "Texte primaire", cssVar: "--primary-foreground" },
  { key: "secondary", label: "Secondaire", cssVar: "--secondary" },
  { key: "card", label: "Carte", cssVar: "--card" },
  { key: "accent", label: "Accent", cssVar: "--accent" },
  { key: "muted", label: "Atténué", cssVar: "--muted" },
  { key: "muted-foreground", label: "Texte atténué", cssVar: "--muted-foreground" },
  { key: "border", label: "Bordure", cssVar: "--border" },
];

const SITE_COLORS_KEY = "custom_site_colors";

function parseHSL(hsl: string): [number, number, number] {
  const parts = hsl.trim().split(/[\s,%]+/);
  return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0, parseFloat(parts[2]) || 0];
}

function hslString(h: number, s: number, l: number) {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function hslToCSS(h: number, s: number, l: number) {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

const AdminColorEditor = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [colors, setColors] = useState<Record<string, [number, number, number]>>({});
  const [savedColors, setSavedColors] = useState<Record<string, [number, number, number]>>({});
  const [activeColor, setActiveColor] = useState<string>("background");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load saved colors from site_settings
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", SITE_COLORS_KEY)
        .maybeSingle();

      const root = document.documentElement;
      const style = getComputedStyle(root);

      if (data?.value && typeof data.value === "object") {
        const saved = data.value as Record<string, string>;
        const parsed: Record<string, [number, number, number]> = {};
        for (const def of COLOR_DEFS) {
          parsed[def.key] = saved[def.key] ? parseHSL(saved[def.key]) : parseHSL(style.getPropertyValue(def.cssVar).trim());
        }
        setColors({ ...parsed });
        setSavedColors({ ...parsed });
      } else {
        // No saved colors, read from CSS
        const initial: Record<string, [number, number, number]> = {};
        for (const def of COLOR_DEFS) {
          initial[def.key] = parseHSL(style.getPropertyValue(def.cssVar).trim());
        }
        setColors({ ...initial });
        setSavedColors({ ...initial });
      }
      setLoaded(true);
    };
    load();
  }, []);

  const updateColor = useCallback((key: string, component: 0 | 1 | 2, value: number) => {
    setColors(prev => {
      const updated = { ...prev };
      const c = [...(updated[key] || [0, 0, 0])] as [number, number, number];
      c[component] = value;
      updated[key] = c;

      // Apply immediately to CSS for live preview
      const def = COLOR_DEFS.find(d => d.key === key);
      if (def) {
        document.documentElement.style.setProperty(def.cssVar, hslString(c[0], c[1], c[2]));
      }
      return updated;
    });
  }, []);

  const resetAll = () => {
    setColors({ ...savedColors });
    for (const def of COLOR_DEFS) {
      const c = savedColors[def.key];
      if (c) document.documentElement.style.setProperty(def.cssVar, hslString(c[0], c[1], c[2]));
    }
    toast({ title: "Couleurs réinitialisées" });
  };

  const saveColors = async () => {
    if (!user) return;
    setSaving(true);

    // Build HSL string map
    const colorMap: Record<string, string> = {};
    for (const def of COLOR_DEFS) {
      const c = colors[def.key];
      if (c) colorMap[def.key] = hslString(c[0], c[1], c[2]);
    }

    const { error } = await supabase
      .from("site_settings")
      .upsert(
        { key: SITE_COLORS_KEY, value: colorMap as any, updated_by: user.id },
        { onConflict: "key" }
      );

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setSavedColors({ ...colors });
      toast({ title: "Couleurs sauvegardées", description: "Les modifications sont appliquées à tout le site pour tous les utilisateurs." });
    }
    setSaving(false);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const active = colors[activeColor] || [0, 0, 0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Palette size={20} className="text-primary" /> Éditeur de couleurs du site
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw size={14} className="mr-1" /> Annuler
          </Button>
          <Button size="sm" onClick={saveColors} disabled={saving}>
            <Save size={14} className="mr-1" /> {saving ? "Sauvegarde..." : "Sauvegarder pour tous"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Les couleurs modifiées ici s'appliquent <strong>globalement</strong> à tout le site pour tous les utilisateurs.
      </p>

      {/* Color selector buttons */}
      <div className="flex flex-wrap gap-2">
        {COLOR_DEFS.map(def => {
          const c = colors[def.key] || [0, 0, 0];
          return (
            <button
              key={def.key}
              onClick={() => setActiveColor(def.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                activeColor === def.key
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              )}
            >
              <div
                className="w-5 h-5 rounded-full border border-border shrink-0"
                style={{ backgroundColor: hslToCSS(c[0], c[1], c[2]) }}
              />
              {def.label}
            </button>
          );
        })}
      </div>

      {/* HSL Sliders */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <div
            className="w-16 h-16 rounded-xl border-2 border-border shadow-lg"
            style={{ backgroundColor: hslToCSS(active[0], active[1], active[2]) }}
          />
          <div>
            <p className="text-foreground font-semibold">
              {COLOR_DEFS.find(d => d.key === activeColor)?.label}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              hsl({Math.round(active[0])}, {Math.round(active[1])}%, {Math.round(active[2])}%)
            </p>
          </div>
        </div>

        {/* Hue */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Teinte (H)</span>
            <span className="text-foreground font-mono">{Math.round(active[0])}°</span>
          </div>
          <div className="relative">
            <div className="absolute inset-0 h-3 rounded-full mt-1.5" style={{
              background: "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))"
            }} />
            <Slider
              value={[active[0]]}
              min={0} max={360} step={1}
              onValueChange={([v]) => updateColor(activeColor, 0, v)}
              className="relative z-10 [&>span:first-child]:bg-transparent [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:bg-foreground [&_[role=slider]]:border-2 [&_[role=slider]]:border-background [&_[role=slider]]:shadow-lg [&>span:first-child>span]:bg-transparent"
            />
          </div>
        </div>

        {/* Saturation */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Saturation (S)</span>
            <span className="text-foreground font-mono">{Math.round(active[1])}%</span>
          </div>
          <div className="relative">
            <div className="absolute inset-0 h-3 rounded-full mt-1.5" style={{
              background: `linear-gradient(to right, hsl(${active[0]},0%,${active[2]}%), hsl(${active[0]},100%,${active[2]}%))`
            }} />
            <Slider
              value={[active[1]]}
              min={0} max={100} step={1}
              onValueChange={([v]) => updateColor(activeColor, 1, v)}
              className="relative z-10 [&>span:first-child]:bg-transparent [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:bg-foreground [&_[role=slider]]:border-2 [&_[role=slider]]:border-background [&_[role=slider]]:shadow-lg [&>span:first-child>span]:bg-transparent"
            />
          </div>
        </div>

        {/* Lightness */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Luminosité (L)</span>
            <span className="text-foreground font-mono">{Math.round(active[2])}%</span>
          </div>
          <div className="relative">
            <div className="absolute inset-0 h-3 rounded-full mt-1.5" style={{
              background: `linear-gradient(to right, hsl(${active[0]},${active[1]}%,0%), hsl(${active[0]},${active[1]}%,50%), hsl(${active[0]},${active[1]}%,100%))`
            }} />
            <Slider
              value={[active[2]]}
              min={0} max={100} step={1}
              onValueChange={([v]) => updateColor(activeColor, 2, v)}
              className="relative z-10 [&>span:first-child]:bg-transparent [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:bg-foreground [&_[role=slider]]:border-2 [&_[role=slider]]:border-background [&_[role=slider]]:shadow-lg [&>span:first-child>span]:bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* Live preview grid */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-medium text-foreground">Aperçu en direct</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {COLOR_DEFS.map(def => {
            const c = colors[def.key] || [0, 0, 0];
            return (
              <div key={def.key} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: hslToCSS(c[0], c[1], c[2]) }} />
                <span className="text-xs text-muted-foreground">{def.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminColorEditor;
