import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

interface ThemeContextType {
  themes: Theme[];
  currentTheme: Theme | null;
  setTheme: (themeId: string) => Promise<void>;
  refreshThemes: () => Promise<void | any>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_VARS: (keyof ThemeColors)[] = [
  "background", "foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "card", "card-foreground",
  "accent", "accent-foreground", "muted", "muted-foreground", "border",
];

const CACHE_KEY = "sf_theme";

function applyColors(colors: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(colors)) {
    if (v) root.style.setProperty(`--${k}`, v);
  }
}

function buildFullColors(colors: ThemeColors): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of THEME_VARS) {
    if (colors[key]) result[key] = colors[key];
  }
  if (colors.primary) {
    result["ring"] = colors.primary;
    result["netflix-red"] = colors.primary;
    result["input"] = colors.border || "";
    result["popover"] = colors.card || "";
    result["popover-foreground"] = colors["card-foreground"] || "";
    result["destructive-foreground"] = colors["primary-foreground"] || "";
    result["sidebar-background"] = colors.background || "";
    result["sidebar-foreground"] = colors["secondary-foreground"] || "";
    result["sidebar-primary"] = colors.primary;
    result["sidebar-primary-foreground"] = colors["primary-foreground"] || "";
    result["sidebar-accent"] = colors.secondary || "";
    result["sidebar-accent-foreground"] = colors["accent-foreground"] || "";
    result["sidebar-border"] = colors.border || "";
    result["sidebar-ring"] = colors.primary;
  }
  return result;
}

function applyThemeToDOM(colors: ThemeColors) {
  const full = buildFullColors(colors);
  applyColors(full);
  // Sauvegarder pour le prochain chargement
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(full)); } catch {}
}

function clearThemeFromDOM() {
  const root = document.documentElement;
  const vars = [...THEME_VARS, "ring","netflix-red","input","popover","popover-foreground",
    "destructive-foreground","sidebar-background","sidebar-foreground","sidebar-primary",
    "sidebar-primary-foreground","sidebar-accent","sidebar-accent-foreground","sidebar-border","sidebar-ring"];
  for (const key of vars) root.style.removeProperty(`--${key}`);
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);

  const fetchThemes = async () => {
    const { data } = await supabase
      .from("themes")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false });
    if (data) setThemes(data as unknown as Theme[]);
    return data as unknown as Theme[] | null;
  };

  const loadGlobalColors = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "custom_site_colors")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      const colors = data.value as Record<string, string>;
      applyColors(colors);
      // Merge dans le cache
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cached, ...colors }));
      } catch {}
      return colors;
    }
    return null;
  };

  const loadUserTheme = async () => {
    if (!user) {
      setCurrentTheme(null);
      clearThemeFromDOM();
      await loadGlobalColors();
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("selected_theme_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const allThemes = await fetchThemes();
    if (!allThemes) { await loadGlobalColors(); return; }

    const selectedId = (profile as any)?.selected_theme_id;
    const theme = selectedId
      ? allThemes.find((t) => t.id === selectedId)
      : allThemes.find((t) => t.is_default);

    if (theme) {
      setCurrentTheme(theme);
      applyThemeToDOM(theme.colors);
    }

    await loadGlobalColors();

    // Sync watermark
    try {
      const { data: ws } = await supabase.from("site_settings").select("value").eq("key", "video").maybeSingle();
      (window as any).__sf_watermark = ws?.value ? (ws.value as any).show_watermark !== false : true;
    } catch { (window as any).__sf_watermark = true; }
  };

  useEffect(() => { loadUserTheme(); }, [user]);

  const setTheme = async (themeId: string) => {
    if (!user) return;
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;
    await supabase.from("profiles").update({ selected_theme_id: themeId } as any).eq("user_id", user.id);
    setCurrentTheme(theme);
    applyThemeToDOM(theme.colors);
  };

  return (
    <ThemeContext.Provider value={{ themes, currentTheme, setTheme, refreshThemes: fetchThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};