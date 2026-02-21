import { useRef, useCallback } from "react";

interface UseVerticalSwipeOptions {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // minimum px to trigger swipe
}

export function useVerticalSwipe({ onSwipeUp, onSwipeDown, threshold = 50 }: UseVerticalSwipeOptions) {
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    swiping.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null || startX.current === null) return;
    const diffY = e.touches[0].clientY - startY.current;
    const diffX = e.touches[0].clientX - startX.current;
    // Only consider vertical swipes (more vertical than horizontal)
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > threshold / 2) {
      swiping.current = true;
    }
  }, [threshold]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startY.current === null) return;
    const endY = e.changedTouches[0].clientY;
    const endX = e.changedTouches[0].clientX;
    const diffY = endY - startY.current;
    const diffX = endX - (startX.current ?? 0);

    startY.current = null;
    startX.current = null;

    // Must be primarily vertical and exceed threshold
    if (Math.abs(diffY) < threshold || Math.abs(diffX) > Math.abs(diffY)) return;

    if (diffY < 0 && onSwipeUp) {
      onSwipeUp(); // Swipe up = next
    } else if (diffY > 0 && onSwipeDown) {
      onSwipeDown(); // Swipe down = previous
    }
  }, [onSwipeUp, onSwipeDown, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
