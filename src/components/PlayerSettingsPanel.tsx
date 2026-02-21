import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  PlayerSettings, DEFAULT_SETTINGS, PRESET_FORMATS, getPlayerStyles, PlayerPreset, usePlayerPresets
} from "@/hooks/usePlayerSettings";
import {
  Monitor, Save, RotateCcw, Check, Download, Upload, X, Copy,
  Lock, Unlock, Maximize, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface PlayerSettingsPanelProps {
  settings: PlayerSettings;
  onChange: (s: PlayerSettings) => void;
  onSave?: () => void;
  onClose?: () => void;
  saving?: boolean;
  hasChanges?: boolean;
  compact?: boolean;
}

const PlayerSettingsPanel = ({ settings, onChange, onSave, onClose, saving, hasChanges, compact }: PlayerSettingsPanelProps) => {
  const { toast } = useToast();
  const { presets, savePreset, deletePreset, exportPresets, importPresets } = usePlayerPresets();
  const [presetName, setPresetName] = useState("");
  const styles = getPlayerStyles(settings);

  const update = (partial: Partial<PlayerSettings>) => onChange({ ...settings, ...partial });

  const applyPresetFormat = (preset: typeof PRESET_FORMATS[number]) => {
    update({
      width: preset.width,
      height: preset.height,
      ratio: preset.ratio,
    });
  };

  const currentPresetId = PRESET_FORMATS.find(
    p => p.width === settings.width && p.height === settings.height
  )?.id;

  const POSITION_GRID = [
    ["top-left", "↖"], ["top", "↑"], ["top-right", "↗"],
    ["left", "←"], ["center", "●"], ["right", "→"],
    ["bottom-left", "↙"], ["bottom", "↓"], ["bottom-right", "↘"],
  ] as const;

  const handleExport = () => {
    const json = JSON.stringify(settings, null, 2);
    navigator.clipboard.writeText(json);
    toast({ title: "Configuration copiée dans le presse-papier" });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    savePreset({
      id: crypto.randomUUID(),
      name: presetName.trim(),
      settings: { ...settings },
    });
    setPresetName("");
    toast({ title: `Preset "${presetName}" sauvegardé` });
  };

  const handleImport = () => {
    const input = prompt("Collez la configuration JSON :");
    if (!input) return;
    try {
      const parsed = JSON.parse(input);
      onChange({ ...DEFAULT_SETTINGS, ...parsed });
      toast({ title: "Configuration importée" });
    } catch {
      toast({ title: "JSON invalide", variant: "destructive" });
    }
  };

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", compact ? "text-sm" : "")}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Monitor size={20} className="text-primary" /> Paramètres du lecteur
        </h2>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Preview */}
        <div className="p-4 border-b border-border bg-black">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Prévisualisation</p>
          <div className="flex items-center justify-center min-h-[180px]">
            <div
              className="relative overflow-hidden transition-all duration-500 max-w-full"
              style={{
                width: Math.min(240, settings.width * 0.4),
                height: Math.min(320, settings.height * 0.4),
                borderRadius: `${settings.borderRadius}px`,
                border: styles.border,
                boxShadow: styles.boxShadow,
                transform: `rotate(${settings.rotation}deg) scale(${settings.zoom / 100})`,
                background: `linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--accent) / 0.3))`,
                filter: styles.filter !== "none" ? styles.filter : undefined,
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <Monitor size={24} className="text-primary/60" />
                <span className="text-[10px] text-muted-foreground">{settings.width}×{settings.height}</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-black/80 to-transparent flex items-end px-2 pb-1">
                <div className="w-full h-0.5 bg-muted-foreground/30 rounded-full">
                  <div className="w-1/3 h-full bg-[#FF1B6B] rounded-full" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground justify-center">
            <span>📐 {settings.width}×{settings.height}</span>
            <span>🔍 {settings.zoom}%</span>
            <span>📦 {settings.fitMode}</span>
            <span>📍 {settings.position}</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="presets" className="p-4">
          <TabsList className="bg-muted w-full">
            <TabsTrigger value="presets" className="flex-1 text-xs">Presets</TabsTrigger>
            <TabsTrigger value="custom" className="flex-1 text-xs">Custom</TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1 text-xs">Avancé</TabsTrigger>
          </TabsList>

          {/* TAB 1: PRESETS */}
          <TabsContent value="presets" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-2">
              {PRESET_FORMATS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPresetFormat(p)}
                  className={cn(
                    "p-3 rounded-lg border-2 text-left transition-all text-xs",
                    currentPresetId === p.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-muted-foreground/50 text-foreground bg-card"
                  )}
                >
                  <span className="text-base mr-1">{p.icon}</span>
                  <span className="font-medium">{p.label.replace(/^.\s/, "")}</span>
                  {currentPresetId === p.id && <Check size={12} className="inline ml-1 text-primary" />}
                </button>
              ))}
            </div>

            {/* Custom presets */}
            {presets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Mes presets</p>
                {presets.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
                    <span className="text-sm flex-1 text-foreground">{p.name}</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange({ ...DEFAULT_SETTINGS, ...p.settings })}>
                      Charger
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deletePreset(p.id)}>
                      <X size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Save new preset */}
            <div className="flex gap-2">
              <Input
                placeholder="Nom du preset..."
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                className="flex-1 h-8 text-xs"
              />
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSavePreset} disabled={!presetName.trim()}>
                <Save size={12} /> Sauvegarder
              </Button>
            </div>
          </TabsContent>

          {/* TAB 2: CUSTOM */}
          <TabsContent value="custom" className="space-y-5 mt-4">
            {/* Dimensions */}
            <Section title="📐 Dimensions">
              <SliderRow label="Largeur" value={settings.width} min={200} max={1920} unit="px"
                onChange={v => {
                  const w = v;
                  const h = settings.lockRatio ? Math.round(v * (settings.height / settings.width)) : settings.height;
                  update({ width: w, height: Math.min(1080, Math.max(200, h)) });
                }}
              />
              <SliderRow label="Hauteur" value={settings.height} min={200} max={1080} unit="px"
                onChange={v => {
                  const h = v;
                  const w = settings.lockRatio ? Math.round(v * (settings.width / settings.height)) : settings.width;
                  update({ height: h, width: Math.min(1920, Math.max(200, w)) });
                }}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={settings.lockRatio} onCheckedChange={v => update({ lockRatio: !!v })} />
                {settings.lockRatio ? <Lock size={12} /> : <Unlock size={12} />}
                Verrouiller le ratio
              </label>
            </Section>

            {/* Zoom */}
            <Section title="🔍 Zoom">
              <SliderRow label="Niveau" value={settings.zoom} min={50} max={200} unit="%"
                onChange={v => update({ zoom: v })}
              />
              <div className="flex flex-wrap gap-1">
                {[50, 75, 100, 125, 150, 175, 200].map(z => (
                  <button
                    key={z}
                    onClick={() => update({ zoom: z })}
                    className={cn(
                      "px-2 py-1 rounded text-xs border transition-all",
                      settings.zoom === z ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"
                    )}
                  >
                    {z}%
                  </button>
                ))}
              </div>
              {settings.zoom > 150 && (
                <p className="text-[10px] text-yellow-500">⚠️ Zoom élevé — qualité réduite possible</p>
              )}
            </Section>

            {/* Fit mode */}
            <Section title="📦 Mode de cadrage">
              {(["cover", "contain", "fill", "none"] as const).map(mode => (
                <label key={mode} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio" name="fitMode" checked={settings.fitMode === mode}
                    onChange={() => update({ fitMode: mode })}
                    className="accent-[hsl(var(--primary))]"
                  />
                  <span className={settings.fitMode === mode ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {mode === "cover" ? "Cover (Remplir)" : mode === "contain" ? "Contain (Ajuster)" : mode === "fill" ? "Fill (Étirer)" : "None (Original)"}
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer mt-2">
                <Checkbox checked={settings.autoAdapt} onCheckedChange={v => update({ autoAdapt: !!v })} />
                🎯 Cadrage Auto-Adaptatif
              </label>
            </Section>

            {/* Position */}
            <Section title="📍 Position du contenu">
              <div className="grid grid-cols-3 gap-1 w-fit mx-auto">
                {POSITION_GRID.map(([pos, icon]) => (
                  <button
                    key={pos}
                    onClick={() => update({ position: pos })}
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center text-sm transition-all",
                      settings.position === pos
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <SliderRow label="X" value={settings.offsetX} min={-100} max={100} unit="px"
                onChange={v => update({ offsetX: v })}
              />
              <SliderRow label="Y" value={settings.offsetY} min={-100} max={100} unit="px"
                onChange={v => update({ offsetY: v })}
              />
            </Section>

            {/* Rotation */}
            <Section title="🔄 Rotation">
              <div className="flex gap-1 mb-2">
                {[0, 90, 180, 270].map(deg => (
                  <button
                    key={deg}
                    onClick={() => update({ rotation: deg })}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs border transition-all",
                      settings.rotation === deg ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    )}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
              <SliderRow label="Custom" value={settings.rotation} min={-180} max={180} unit="°"
                onChange={v => update({ rotation: v })}
              />
            </Section>
          </TabsContent>

          {/* TAB 3: ADVANCED */}
          <TabsContent value="advanced" className="space-y-5 mt-4">
            {/* Borders */}
            <Section title="🔲 Bordures">
              <SliderRow label="Épaisseur" value={settings.borderWidth} min={0} max={10} unit="px"
                onChange={v => update({ borderWidth: v })}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">Couleur</span>
                <input type="color" value={settings.borderColor}
                  onChange={e => update({ borderColor: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs text-muted-foreground font-mono">{settings.borderColor}</span>
              </div>
              <SliderRow label="Radius" value={settings.borderRadius} min={0} max={50} unit="px"
                onChange={v => update({ borderRadius: v })}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">Style</span>
                <select
                  value={settings.borderStyle}
                  onChange={e => update({ borderStyle: e.target.value as any })}
                  className="bg-muted text-foreground text-xs rounded px-2 py-1 border border-border"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="double">Double</option>
                </select>
              </div>
            </Section>

            {/* Background */}
            <Section title="🎨 Fond">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">Couleur</span>
                <input type="color" value={settings.bgColor}
                  onChange={e => update({ bgColor: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs text-muted-foreground font-mono">{settings.bgColor}</span>
              </div>
              <SliderRow label="Opacité" value={settings.bgOpacity} min={0} max={100} unit="%"
                onChange={v => update({ bgOpacity: v })}
              />
            </Section>

            {/* Shadow */}
            <Section title="✨ Ombres & Effets">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={settings.shadowEnabled} onCheckedChange={v => update({ shadowEnabled: v })} />
                <span className="text-foreground">Ombre portée</span>
              </label>
              {settings.shadowEnabled && (
                <div className="space-y-2 pl-2 border-l-2 border-primary/20 ml-2">
                  <SliderRow label="Blur" value={settings.shadowBlur} min={0} max={50} unit="px"
                    onChange={v => update({ shadowBlur: v })}
                  />
                  <SliderRow label="X" value={settings.shadowX} min={-50} max={50} unit="px"
                    onChange={v => update({ shadowX: v })}
                  />
                  <SliderRow label="Y" value={settings.shadowY} min={-50} max={50} unit="px"
                    onChange={v => update({ shadowY: v })}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Couleur</span>
                    <input type="color" value={settings.shadowColor.substring(0, 7)}
                      onChange={e => update({ shadowColor: e.target.value + "80" })}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer mt-2">
                <Switch checked={settings.glowEffect} onCheckedChange={v => update({ glowEffect: v })} />
                <span className="text-foreground">Effet de brillance</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={settings.vintageEffect} onCheckedChange={v => update({ vintageEffect: v })} />
                <span className="text-foreground">Effet vintage</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={settings.bwFilter} onCheckedChange={v => update({ bwFilter: v })} />
                <span className="text-foreground">Noir & blanc</span>
              </label>
            </Section>

            {/* Behavior */}
            <Section title="⚙️ Comportement">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={settings.autoplay} onCheckedChange={v => update({ autoplay: v })} />
                <span className="text-foreground">Lecture automatique</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={settings.loop} onCheckedChange={v => update({ loop: v })} />
                <span className="text-foreground">Boucle infinie</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={settings.mutedStart} onCheckedChange={v => update({ mutedStart: v })} />
                <span className="text-foreground">Couper le son au démarrage</span>
              </label>
            </Section>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-border space-y-2 shrink-0">
        <div className="flex gap-2">
          {onSave && (
            <Button onClick={onSave} disabled={saving || !hasChanges} className="flex-1 gap-1">
              {saving ? <span className="animate-spin">⏳</span> : <Save size={14} />}
              {hasChanges ? "Sauvegarder" : "Aucun changement"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onChange(DEFAULT_SETTINGS)} className="gap-1">
            <RotateCcw size={12} /> Reset
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={handleExport}>
            <Copy size={12} /> Copier config
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={handleImport}>
            <Download size={12} /> Importer
          </Button>
          <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1"
            onClick={() => {
              const json = exportPresets();
              navigator.clipboard.writeText(json);
              toast({ title: "Presets exportés" });
            }}
          >
            <Upload size={12} /> Exporter
          </Button>
        </div>
      </div>
    </div>
  );
};

// Helper components

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3 bg-card border border-border rounded-lg p-4">
    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h4>
    {children}
  </div>
);

const SliderRow = ({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) => (
  <div className="flex items-center gap-3">
    <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
    <Slider
      value={[value]} min={min} max={max} step={1}
      onValueChange={([v]) => onChange(v)}
      className="flex-1 [&>span:first-child]:h-1.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:h-3.5 [&_[role=slider]]:bg-primary [&_[role=slider]]:border-0 [&>span:first-child>span]:bg-primary"
    />
    <span className="text-xs text-foreground font-mono w-14 text-right">{value}{unit}</span>
  </div>
);

export default PlayerSettingsPanel;
