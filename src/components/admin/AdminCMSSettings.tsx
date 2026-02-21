import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSiteSettings,
  saveSiteSetting,
  DEFAULT_CMS,
  DEFAULT_GENERAL,
  type CmsSettings,
  type GeneralSettings,
} from "@/hooks/useSiteSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save,
  Loader2,
  Layout,
  Grid,
  Image,
  Eye,
  Type,
  Globe,
  Monitor,
  Palette,
  Film,
  RefreshCw,
  AlignLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Section wrapper ───────────────────────────────────────────
const Section = ({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-xl p-5 space-y-4">
    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
      <Icon size={15} className="text-primary" /> {title}
    </h3>
    {children}
  </div>
);

// ── Toggle row ────────────────────────────────────────────────
const ToggleRow = ({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-sm text-foreground">{label}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

// ── Live Preview card ─────────────────────────────────────────
const GridPreview = ({ cms }: { cms: CmsSettings }) => {
  const cols = cms.grid_cols_xl || 5;
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-2">
      <p className="text-xs text-muted-foreground font-medium mb-3">Aperçu grille ({cols} colonnes)</p>
      <div
        className={cn("grid gap-2", {
          "grid-cols-2": cols === 2,
          "grid-cols-3": cols === 3,
          "grid-cols-4": cols === 4,
          "grid-cols-5": cols === 5,
          "grid-cols-6": cols === 6,
        })}
      >
        {Array.from({ length: cols * 2 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg bg-muted/60 border border-border/40 overflow-hidden",
              cms.card_style === "landscape"
                ? "aspect-video"
                : cms.card_style === "square"
                  ? "aspect-square"
                  : "aspect-[2/3]",
            )}
          >
            <div className="w-full h-full flex items-end p-1.5">
              {cms.card_show_duration && <div className="h-1.5 w-8 rounded bg-primary/30 ml-auto" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AdminCMSSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { general: loadedGeneral, cms: loadedCms, isLoading } = useSiteSettings();

  const [general, setGeneral] = useState<GeneralSettings>({ ...DEFAULT_GENERAL });
  const [cms, setCms] = useState<CmsSettings>({ ...DEFAULT_CMS });
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Init from loaded data (only once)
  if (!isLoading && !initialized && (loadedGeneral || loadedCms)) {
    setGeneral({ ...DEFAULT_GENERAL, ...loadedGeneral });
    setCms({ ...DEFAULT_CMS, ...loadedCms });
    setInitialized(true);
  }

  const save = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    await Promise.all([saveSiteSetting("general", general, user.id), saveSiteSetting("cms", cms, user.id)]);
    // Invalidate so all consumers get updated settings instantly
    queryClient.invalidateQueries({ queryKey: ["site-settings"] });
    toast({ title: "✅ CMS sauvegardé" });
    setSaving(false);
  }, [user, general, cms, queryClient, toast]);

  const updateCms = (patch: Partial<CmsSettings>) => setCms((prev) => ({ ...prev, ...patch }));
  const updateGeneral = (patch: Partial<GeneralSettings>) => setGeneral((prev) => ({ ...prev, ...patch }));

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={22} />
      </div>
    );

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Layout size={20} className="text-primary" /> Personnalisation CMS
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open("/", "_blank")} className="gap-1.5 text-xs">
            <Eye size={13} /> Voir le site
          </Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Sauvegarder
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-5">
          {/* ── Identity ── */}
          <Section title="Identité du site" icon={Globe}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nom du site</Label>
                <Input
                  value={general.site_name}
                  onChange={(e) => updateGeneral({ site_name: e.target.value })}
                  placeholder="Mon CinéClub"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Accroche</Label>
                <Input
                  value={general.site_tagline}
                  onChange={(e) => updateGeneral({ site_tagline: e.target.value })}
                  placeholder="Votre plateforme privée"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">URL du logo</Label>
                <Input
                  value={general.logo_url}
                  onChange={(e) => updateGeneral({ logo_url: e.target.value })}
                  placeholder="https://…/logo.png"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Couleur d'accent (optionnel)</Label>
                <div className="flex gap-2">
                  <Input
                    value={cms.accent_color}
                    onChange={(e) => updateCms({ accent_color: e.target.value })}
                    placeholder="#FF1B6B"
                    className="font-mono"
                  />
                  {cms.accent_color && (
                    <div
                      className="w-10 h-10 rounded-lg border border-border shrink-0"
                      style={{ backgroundColor: cms.accent_color }}
                    />
                  )}
                </div>
              </div>
            </div>
            <ToggleRow
              label="Mode maintenance"
              description="Cache le site aux visiteurs non-admins"
              checked={general.maintenance_mode}
              onCheckedChange={(v) => updateGeneral({ maintenance_mode: v })}
            />
            {general.maintenance_mode && (
              <div className="space-y-1.5">
                <Label className="text-xs">Message de maintenance</Label>
                <Input
                  value={general.maintenance_message}
                  onChange={(e) => updateGeneral({ maintenance_message: e.target.value })}
                />
              </div>
            )}
          </Section>

          {/* ── Homepage sections ── */}
          <Section title="Sections de la page d'accueil" icon={Monitor}>
            <div className="space-y-3 divide-y divide-border">
              <ToggleRow
                label="Bannière Hero"
                description="Afficher la grande bannière en haut"
                checked={cms.hero_enabled}
                onCheckedChange={(v) => updateCms({ hero_enabled: v })}
              />
              {cms.hero_enabled && (
                <div className="pt-3 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Titre hero</Label>
                      <Input
                        value={cms.hero_title}
                        onChange={(e) => updateCms({ hero_title: e.target.value })}
                        placeholder="Votre titre hero"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sous-titre</Label>
                      <Input
                        value={cms.hero_subtitle}
                        onChange={(e) => updateCms({ hero_subtitle: e.target.value })}
                        placeholder="Sous-titre…"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Image de fond du hero (URL)</Label>
                    <Input
                      value={cms.hero_bg_url}
                      onChange={(e) => updateCms({ hero_bg_url: e.target.value })}
                      placeholder="https://…/hero.jpg"
                    />
                  </div>
                </div>
              )}
              <div className="pt-3 space-y-3">
                <ToggleRow
                  label="Ligne Tendances"
                  description="Rang horizontal des vidéos trending"
                  checked={cms.trending_row_enabled}
                  onCheckedChange={(v) => updateCms({ trending_row_enabled: v })}
                />
                <ToggleRow
                  label="Continuer à regarder"
                  description="Rang des vidéos en cours"
                  checked={cms.continue_watching_enabled}
                  onCheckedChange={(v) => updateCms({ continue_watching_enabled: v })}
                />
                <ToggleRow
                  label="Recommandations"
                  description="Rang personnalisé basé sur l'historique"
                  checked={cms.recommendations_enabled}
                  onCheckedChange={(v) => updateCms({ recommendations_enabled: v })}
                />
                <ToggleRow
                  label="Pied de page"
                  checked={cms.footer_enabled}
                  onCheckedChange={(v) => updateCms({ footer_enabled: v })}
                />
              </div>
            </div>
          </Section>

          {/* ── Grid layout ── */}
          <Section title="Grille de vidéos" icon={Grid}>
            <div className="space-y-4">
              {/* Columns */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Colonnes par breakpoint
                </p>
                {[
                  { label: "Mobile (sm)", key: "grid_cols_sm" as const, min: 1, max: 3 },
                  { label: "Tablette (md)", key: "grid_cols_md" as const, min: 2, max: 4 },
                  { label: "Desktop (lg)", key: "grid_cols_lg" as const, min: 3, max: 6 },
                  { label: "Grand écran (xl)", key: "grid_cols_xl" as const, min: 3, max: 8 },
                ].map(({ label, key, min, max }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
                    <Slider
                      min={min}
                      max={max}
                      step={1}
                      value={[cms[key]]}
                      onValueChange={([v]) => updateCms({ [key]: v })}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono font-bold text-primary w-6 text-center">{cms[key]}</span>
                  </div>
                ))}
              </div>

              {/* Items per page */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 shrink-0">Vidéos / page</span>
                <Slider
                  min={10}
                  max={60}
                  step={5}
                  value={[cms.items_per_page]}
                  onValueChange={([v]) => updateCms({ items_per_page: v })}
                  className="flex-1"
                />
                <span className="text-sm font-mono font-bold text-primary w-6 text-center">{cms.items_per_page}</span>
              </div>

              {/* Card style */}
              <div className="space-y-1.5">
                <Label className="text-xs">Style des cartes</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["portrait", "landscape", "square"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => updateCms({ card_style: style })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                        cms.card_style === style
                          ? "border-primary text-primary bg-primary/10"
                          : "border-border text-muted-foreground hover:border-border hover:bg-accent",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded bg-muted/80 border border-border/40",
                          style === "portrait" ? "w-8 h-12" : style === "landscape" ? "w-14 h-8" : "w-10 h-10",
                        )}
                      />
                      {style === "portrait" ? "Portrait" : style === "landscape" ? "Paysage" : "Carré"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ── Card options ── */}
          <Section title="Options des cartes vidéo" icon={Film}>
            <div className="space-y-3 divide-y divide-border">
              <ToggleRow
                label="Nom du modèle"
                description="Afficher le nom du modèle sous la carte"
                checked={cms.card_show_model}
                onCheckedChange={(v) => updateCms({ card_show_model: v })}
              />
              <div className="pt-3">
                <ToggleRow
                  label="Durée"
                  description="Badge de durée sur chaque carte"
                  checked={cms.card_show_duration}
                  onCheckedChange={(v) => updateCms({ card_show_duration: v })}
                />
              </div>
              <div className="pt-3">
                <ToggleRow
                  label="Barre de progression"
                  description="Progression de visionnage en bas de la carte"
                  checked={cms.card_show_progress}
                  onCheckedChange={(v) => updateCms({ card_show_progress: v })}
                />
              </div>
              <div className="pt-3">
                <ToggleRow
                  label="Prévisualisation au survol"
                  description="Lancer un aperçu vidéo au hover (désactiver = plus rapide)"
                  checked={cms.card_hover_preview}
                  onCheckedChange={(v) => updateCms({ card_hover_preview: v })}
                />
              </div>
            </div>
          </Section>

          {/* ── UI polish ── */}
          <Section title="Interface" icon={Palette}>
            <ToggleRow
              label="Navbar avec flou"
              description="Effet glassmorphism sur la barre de navigation"
              checked={cms.navbar_blur}
              onCheckedChange={(v) => updateCms({ navbar_blur: v })}
            />
          </Section>
        </div>

        {/* ── Right: Live preview ── */}
        <div className="space-y-4">
          <div className="sticky top-4 space-y-4">
            <GridPreview cms={cms} />

            {/* Site identity preview */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Aperçu identité</p>
              <div className="flex items-center gap-3">
                {general.logo_url ? (
                  <img src={general.logo_url} alt="logo" className="w-10 h-10 rounded-lg object-contain bg-muted" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Film size={18} className="text-primary" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground text-sm">{general.site_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{general.site_tagline || "—"}</p>
                </div>
              </div>
              {cms.accent_color && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: cms.accent_color }} />
                  <span className="font-mono">{cms.accent_color}</span>
                </div>
              )}
            </div>

            {/* Sections preview */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Sections actives</p>
              {[
                { label: "Hero", active: cms.hero_enabled },
                { label: "Tendances", active: cms.trending_row_enabled },
                { label: "Continuer", active: cms.continue_watching_enabled },
                { label: "Recommandations", active: cms.recommendations_enabled },
                { label: "Footer", active: cms.footer_enabled },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <span className={s.active ? "text-foreground" : "text-muted-foreground/50 line-through"}>
                    {s.label}
                  </span>
                  <div className={cn("w-1.5 h-1.5 rounded-full", s.active ? "bg-green-400" : "bg-border")} />
                </div>
              ))}
            </div>

            {/* Save button repeated for convenience */}
            <Button onClick={save} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Sauvegarder les changements
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCMSSettings;
