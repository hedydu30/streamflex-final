import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

const SCROLL_STORE_KEY = "scroll_positions";

/** Saves and restores scroll position per route key. */
export const useScrollRestore = (key?: string) => {
  const location = useLocation();
  const storeKey = key || location.pathname;
  const restored = useRef(false);

  // Restore on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SCROLL_STORE_KEY);
    if (stored) {
      try {
        const map = JSON.parse(stored);
        const pos = map[storeKey];
        if (pos && !restored.current) {
          // Delay to let content render
          requestAnimationFrame(() => {
            window.scrollTo(0, pos);
            restored.current = true;
          });
        }
      } catch {}
    }
  }, [storeKey]);

  // Save on scroll (debounced)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const stored = sessionStorage.getItem(SCROLL_STORE_KEY);
        const map = stored ? JSON.parse(stored) : {};
        map[storeKey] = window.scrollY;
        sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify(map));
      }, 150);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", handler);
    };
  }, [storeKey]);
};
