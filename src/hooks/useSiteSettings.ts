/**
 * useSiteSettings
 * ──────────────────────────────────────────────────────────────
 * Central store for all site_settings rows.
 * - Single query shared across ALL components (React Query dedup)
 * - 5-minute stale time → no refetch on every navigation
 * - Realtime: Supabase broadcast pushes invalidation on admin save
 * - Typed helpers for every domain (general, cms, video, security…)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────

export interface GeneralSettings {
  site_name: string;
  site_tagline: string;
  contact_email: string;
  timezone: string;
  logo_url: string;
  favicon_url: string;
  maintenance_mode: boolean;
  maintenance_message: string;
}

export interface CmsSettings {
  // Homepage
  hero_enabled: boolean;
  hero_title: string;
  hero_subtitle: string;
  hero_bg_url: string;
  trending_row_enabled: boolean;
  continue_watching_enabled: boolean;
  recommendations_enabled: boolean;
  // Grid
  grid_cols_sm: number; // tailwind column count on sm
  grid_cols_md: number;
  grid_cols_lg: number;
  grid_cols_xl: number;
  items_per_page: number;
  card_style: "portrait" | "landscape" | "square";
  card_show_model: boolean;
  card_show_duration: boolean;
  card_show_progress: boolean;
  card_hover_preview: boolean;
  // Layout
  navbar_blur: boolean;
  footer_enabled: boolean;
  accent_color: string;
}

export interface VideoSettings {
  default_quality: string;
  autoplay: boolean;
  allow_quality_change: boolean;
  default_volume: number;
  preload_strategy: "none" | "metadata" | "auto";
  hls_enabled: boolean;
}

export type AllSettings = {
  general: GeneralSettings;
  cms: CmsSettings;
  video: VideoSettings;
  [key: string]: any;
};

// ── Defaults ─────────────────────────────────────────────────

export const DEFAULT_GENERAL: GeneralSettings = {
  site_name: "CinemaCouch",
  site_tagline: "Votre plateforme vidéo privée",
  contact_email: "",
  timezone: "Europe/Paris",
  logo_url: "",
  favicon_url: "",
  maintenance_mode: false,
  maintenance_message: "Site en maintenance, revenez bientôt.",
};

export const DEFAULT_CMS: CmsSettings = {
  hero_enabled: true,
  hero_title: "",
  hero_subtitle: "",
  hero_bg_url: "",
  trending_row_enabled: true,
  continue_watching_enabled: true,
  recommendations_enabled: true,
  grid_cols_sm: 2,
  grid_cols_md: 3,
  grid_cols_lg: 4,
  grid_cols_xl: 5,
  items_per_page: 20,
  card_style: "portrait",
  card_show_model: true,
  card_show_duration: true,
  card_show_progress: true,
  card_hover_preview: true,
  navbar_blur: true,
  footer_enabled: true,
  accent_color: "",
};

export const DEFAULT_VIDEO: VideoSettings = {
  default_quality: "auto",
  autoplay: true,
  allow_quality_change: true,
  default_volume: 80,
  preload_strategy: "metadata",
  hls_enabled: false,
};

// ── Query key ─────────────────────────────────────────────────
const QUERY_KEY = ["site-settings"];

// ── Fetch fn ──────────────────────────────────────────────────
async function fetchAllSettings(): Promise<AllSettings> {
  const { data, error } = await supabase.from("site_settings").select("key, value");

  // Si erreur (table pas encore créée ou vide), retourner les defaults silencieusement
  if (error) {
    console.warn("useSiteSettings: could not fetch settings, using defaults", error.message);
    return {
      general: { ...DEFAULT_GENERAL },
      cms: { ...DEFAULT_CMS },
      video: { ...DEFAULT_VIDEO },
    } as AllSettings;
  }

  const map: AllSettings = {
    general: { ...DEFAULT_GENERAL },
    cms: { ...DEFAULT_CMS },
    video: { ...DEFAULT_VIDEO },
  };

  for (const row of data || []) {
    map[row.key] = { ...(map[row.key] || {}), ...(row.value as object) };
  }

  return map;
}

// ── Main hook ─────────────────────────────────────────────────
export function useSiteSettings() {
  const queryClient = useQueryClient();

  // Subscribe to realtime changes on site_settings
  useEffect(() => {
    const channel = supabase
      .channel("site-settings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => {
        // Invalidate immediately so next render gets fresh data
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAllSettings,
    staleTime: 5 * 60 * 1000, // 5 min — only refetch when stale
    gcTime: 30 * 60 * 1000, // 30 min in memory
    placeholderData: {
      general: { ...DEFAULT_GENERAL },
      cms: { ...DEFAULT_CMS },
      video: { ...DEFAULT_VIDEO },
    } as AllSettings,
  });

  const settings = data ?? { general: DEFAULT_GENERAL, cms: DEFAULT_CMS, video: DEFAULT_VIDEO };

  return {
    settings,
    general: settings.general as GeneralSettings,
    cms: settings.cms as CmsSettings,
    video: settings.video as VideoSettings,
    isLoading,
    error,
  };
}

// ── Grid helper: compute Tailwind class string from cms settings ──
export function gridColsClass(cms: CmsSettings): string {
  const sm = cms.grid_cols_sm || 2;
  const md = cms.grid_cols_md || 3;
  const lg = cms.grid_cols_lg || 4;
  const xl = cms.grid_cols_xl || 5;
  // Return pre-defined safe Tailwind classes
  const map: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  };
  return [
    map[sm] || "grid-cols-2",
    `sm:${map[sm] || "grid-cols-2"}`,
    `md:${map[md] || "grid-cols-3"}`,
    `lg:${map[lg] || "grid-cols-4"}`,
    `xl:${map[xl] || "grid-cols-5"}`,
  ].join(" ");
}

// ── Admin save helper ─────────────────────────────────────────
export async function saveSiteSetting(key: string, value: object, adminId: string): Promise<{ error: any }> {
  return supabase.from("site_settings").upsert({
    key: key as any,
    value: value as any,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  });
}
