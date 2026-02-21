/**
 * useVirtualGrid
 * ──────────────────────────────────────────────────────────────
 * Lightweight virtualization using IntersectionObserver.
 * No external dependency — renders placeholders for off-screen items
 * and swaps in real content as they enter the viewport.
 *
 * Benefits:
 *  - Renders only visible cards → drastically fewer DOM nodes
 *  - Images/videos load only when needed
 *  - Smooth scroll without jank
 *
 * Usage:
 *   const { renderedItems, containerRef } = useVirtualGrid(items, { overscan: 6 })
 *   // renderedItems[i] = { item, visible }
 *   // Pass containerRef to your grid wrapper
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

interface Options {
  /** Extra items to render beyond visible viewport (default: 6) */
  overscan?: number;
  /** Margin around viewport to trigger early load (default: "200px") */
  rootMargin?: string;
  /** Placeholder height when not visible (default: "auto") */
  placeholderAspect?: string;
}

export interface RenderedItem<T> {
  item: T;
  visible: boolean;
  index: number;
}

export function useVirtualGrid<T>(
  items: T[],
  options: Options = {}
): {
  renderedItems: RenderedItem<T>[];
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const { overscan = 8, rootMargin = "300px 0px" } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());
  const observersRef = useRef<Map<number, IntersectionObserver>>(new Map());
  const itemRefsMap = useRef<Map<number, Element>>(new Map());

  const observe = useCallback((el: Element | null, index: number) => {
    if (!el) {
      // Cleanup if element removed
      observersRef.current.get(index)?.disconnect();
      observersRef.current.delete(index);
      itemRefsMap.current.delete(index);
      return;
    }

    if (itemRefsMap.current.get(index) === el) return; // Already observing
    itemRefsMap.current.set(index, el);

    // Disconnect old observer if any
    observersRef.current.get(index)?.disconnect();

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisibleIndices(prev => {
          const next = new Set(prev);
          if (entry.isIntersecting) {
            // Once visible, keep rendered (never unrender — avoids flicker)
            next.add(index);
            // Also mark overscan neighbours
            for (let i = Math.max(0, index - overscan); i <= Math.min(items.length - 1, index + overscan); i++) {
              next.add(i);
            }
          }
          return next;
        });
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(el);
    observersRef.current.set(index, observer);
  }, [overscan, rootMargin, items.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      observersRef.current.forEach(obs => obs.disconnect());
      observersRef.current.clear();
      itemRefsMap.current.clear();
    };
  }, []);

  // Pre-render first batch immediately (above the fold)
  useEffect(() => {
    const initial = new Set<number>();
    for (let i = 0; i < Math.min(overscan * 2, items.length); i++) initial.add(i);
    setVisibleIndices(initial);
  }, []); // Only on mount

  const renderedItems = useMemo<RenderedItem<T>[]>(() =>
    items.map((item, index) => ({
      item,
      index,
      visible: visibleIndices.has(index),
    })),
    [items, visibleIndices]
  );

  return { renderedItems, containerRef };
}

/**
 * VirtualItem — wrapper component that registers with useVirtualGrid
 * Pass as a render prop child.
 */
export function useItemRef(
  index: number,
  observe: (el: Element | null, index: number) => void
) {
  return useCallback((el: HTMLElement | null) => {
    observe(el, index);
  }, [index, observe]);
}
