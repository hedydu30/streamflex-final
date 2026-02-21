import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlayerSettings {
  // Legacy compat
  shape: "square" | "rounded" | "pill" | "circle";
  ratio: "native" | "16:9" | "4:3" | "9:16" | "1:1" | "21:9";
  // Dimensions
  width: number;
  height: number;
  lockRatio: boolean;
  // Zoom
  zoom: number;
  // Fit mode
  fitMode: "cover" | "contain" | "fill" | "none";
  autoAdapt: boolean;
  // Position
  position: string; // "center" | "top" | "bottom" | "left" | "right" | etc.
  offsetX: number;
  offsetY: number;
  // Rotation
  rotation: number;
  // Border
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  borderStyle: "solid" | "dashed" | "dotted" | "double";
  // Background
  bgType: "solid" | "gradient" | "blur";
  bgColor: string;
  bgOpacity: number;
  // Shadow
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  shadowColor: string;
  // Behavior
  autoplay: boolean;
  loop: boolean;
  mutedStart: boolean;
  // Effects
  glowEffect: boolean;
  vintageEffect: boolean;
  bwFilter: boolean;
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  shape: "square",
  ratio: "native",
  width: 360,
  height: 640,
  lockRatio: true,
  zoom: 100,
  fitMode: "contain",
  autoAdapt: true,
  position: "center",
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  borderWidth: 0,
  borderColor: "#FFFFFF",
  borderRadius: 0,
  borderStyle: "solid",
  bgType: "solid",
  bgColor: "#000000",
  bgOpacity: 100,
  shadowEnabled: false,
  shadowBlur: 20,
  shadowX: 0,
  shadowY: 10,
  shadowColor: "#00000080",
  autoplay: true,
  loop: false,
  mutedStart: false,
  glowEffect: false,
  vintageEffect: false,
  bwFilter: false,
};

export const PRESET_FORMATS = [
  { id: "9:16", label: "📱 Vertical 9:16", icon: "📱", width: 360, height: 640, ratio: "9:16" as const },
  { id: "16:9", label: "💻 Horizontal 16:9", icon: "💻", width: 854, height: 480, ratio: "16:9" as const },
  { id: "1:1", label: "⬛ Carré 1:1", icon: "⬛", width: 500, height: 500, ratio: "1:1" as const },
  { id: "4:3", label: "📺 TV 4:3", icon: "📺", width: 640, height: 480, ratio: "4:3" as const },
  { id: "21:9", label: "🎬 Cinéma 21:9", icon: "🎬", width: 840, height: 360, ratio: "21:9" as const },
  { id: "9:18", label: "📲 Mobile 9:18", icon: "📲", width: 360, height: 720, ratio: "9:16" as const },
  { id: "16:10", label: "🖥️ Desktop 16:10", icon: "🖥️", width: 800, height: 500, ratio: "native" as const },
  { id: "3:2", label: "📸 Photo 3:2", icon: "📸", width: 600, height: 400, ratio: "native" as const },
] as const;

export const SHAPE_OPTIONS = [
  { value: "square" as const, label: "Carré", borderRadius: "0px" },
  { value: "rounded" as const, label: "Arrondi", borderRadius: "16px" },
  { value: "pill" as const, label: "Très arrondi", borderRadius: "32px" },
  { value: "circle" as const, label: "Ovale", borderRadius: "50%" },
];

export const RATIO_OPTIONS = [
  { value: "native" as const, label: "Original", css: undefined },
  { value: "16:9" as const, label: "16:9 Paysage", css: "16/9" },
  { value: "4:3" as const, label: "4:3 Classique", css: "4/3" },
  { value: "9:16" as const, label: "9:16 Portrait", css: "9/16" },
  { value: "1:1" as const, label: "1:1 Carré", css: "1/1" },
  { value: "21:9" as const, label: "21:9 Ultra-wide", css: "21/9" },
];

export interface PlayerPreset {
  id: string;
  name: string;
  settings: Partial<PlayerSettings>;
}

export function getPlayerStyles(settings: PlayerSettings) {
  const shape = SHAPE_OPTIONS.find(s => s.value === settings.shape) || SHAPE_OPTIONS[0];
  const ratio = RATIO_OPTIONS.find(r => r.value === settings.ratio) || RATIO_OPTIONS[0];
  
  const br = settings.borderRadius > 0 ? `${settings.borderRadius}px` : shape.borderRadius;

  return {
    borderRadius: br,
    aspectRatio: ratio.css,
    objectFit: settings.fitMode || (settings.ratio !== "native" ? "cover" : "contain"),
    zoom: settings.zoom || 100,
    rotation: settings.rotation || 0,
    border: settings.borderWidth > 0 ? `${settings.borderWidth}px ${settings.borderStyle} ${settings.borderColor}` : "none",
    boxShadow: settings.shadowEnabled
      ? `${settings.shadowX}px ${settings.shadowY}px ${settings.shadowBlur}px ${settings.shadowColor}`
      : "none",
    filter: [
      settings.vintageEffect ? "sepia(0.4)" : "",
      settings.bwFilter ? "grayscale(1)" : "",
    ].filter(Boolean).join(" ") || "none",
  };
}

const SETTINGS_KEY = "player_settings";
const PRESETS_KEY = "player_custom_presets";

export function usePlayerSettings() {
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("id", SETTINGS_KEY)
      .maybeSingle();
    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newSettings: PlayerSettings, userId: string) => {
    setSettings(newSettings);
    await supabase.from("admin_settings").upsert({
      id: SETTINGS_KEY,
      value: JSON.stringify(newSettings),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    });
  }, []);

  return { settings, loading, save, reload: load };
}

export function usePlayerPresets() {
  const [presets, setPresets] = useState<PlayerPreset[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
  }, []);

  const savePreset = (preset: PlayerPreset) => {
    const next = [...presets.filter(p => p.id !== preset.id), preset];
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  const deletePreset = (id: string) => {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  const exportPresets = () => JSON.stringify(presets, null, 2);

  const importPresets = (json: string) => {
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        setPresets(imported);
        localStorage.setItem(PRESETS_KEY, JSON.stringify(imported));
        return true;
      }
    } catch {}
    return false;
  };

  return { presets, savePreset, deletePreset, exportPresets, importPresets };
}
