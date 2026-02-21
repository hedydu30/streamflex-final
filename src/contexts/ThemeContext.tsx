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

function applyThemeToDOM(colors: ThemeColors) {
  const root = document.documentElement;
  for (const key of THEME_VARS) {
    if (colors[key]) {
      root.style.setProperty(`--${key}`, colors[key]);
    }
  }
  // Also set derived vars
  if (colors.primary) {
    root.style.setProperty("--ring", colors.primary);
    root.style.setProperty("--netflix-red", colors.primary);
    root.style.setProperty("--input", colors.border || "");
    root.style.setProperty("--popover", colors.card || "");
    root.style.setProperty("--popover-foreground", colors["card-foreground"] || "");
    root.style.setProperty("--destructive-foreground", colors["primary-foreground"] || "");
    root.style.setProperty("--sidebar-background", colors.background || "");
    root.style.setProperty("--sidebar-foreground", colors["secondary-foreground"] || "");
    root.style.setProperty("--sidebar-primary", colors.primary);
    root.style.setProperty("--sidebar-primary-foreground", colors["primary-foreground"] || "");
    root.style.setProperty("--sidebar-accent", colors.secondary || "");
    root.style.setProperty("--sidebar-accent-foreground", colors["accent-foreground"] || "");
    root.style.setProperty("--sidebar-border", colors.border || "");
    root.style.setProperty("--sidebar-ring", colors.primary);
  }
}

function clearThemeFromDOM() {
  const root = document.documentElement;
  const allVars = [
    ...THEME_VARS, "ring", "netflix-red", "input", "popover", "popover-foreground",
    "destructive-foreground", "sidebar-background", "sidebar-foreground", "sidebar-primary",
    "sidebar-primary-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
  ];
  for (const key of allVars) {
    root.style.removeProperty(`--${key}`);
  }
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

  // Load global custom colors from site_settings (applies to ALL users, overrides themes)
  const loadGlobalColors = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "custom_site_colors")
      .maybeSingle();

    if (data?.value && typeof data.value === "object") {
      const colors = data.value as Record<string, string>;
      const root = document.documentElement;
      for (const [key, val] of Object.entries(colors)) {
        if (val) root.style.setProperty(`--${key}`, val);
      }
      return colors;
    }
    return null;
  };

  const loadUserTheme = async () => {
    if (!user) {
      // Clear user theme, but apply global colors for guests
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
    if (!allThemes) {
      await loadGlobalColors();
      return;
    }

    const selectedId = (profile as any)?.selected_theme_id;
    const theme = selectedId
      ? allThemes.find((t) => t.id === selectedId)
      : allThemes.find((t) => t.is_default);

    if (theme) {
      setCurrentTheme(theme);
      applyThemeToDOM(theme.colors);
    }

    // Global admin colors ALWAYS override theme colors (applied last = highest priority)
    await loadGlobalColors();
  };

  useEffect(() => {
    loadUserTheme();
  }, [user]);

  const setTheme = async (themeId: string) => {
    if (!user) return;
    const theme = themes.find((t) => t.id === themeId);
    if (!theme) return;

    await supabase
      .from("profiles")
      .update({ selected_theme_id: themeId } as any)
      .eq("user_id", user.id);

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
