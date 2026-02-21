import { useState, useMemo } from "react";

interface UsePaginationOptions {
  pageSize?: number;
  storageKey?: string;
}

export const usePagination = <T>(items: T[], options: UsePaginationOptions = {}) => {
  const { pageSize = 30, storageKey } = options;

  // Restore page from sessionStorage if available
  const getInitialPage = () => {
    if (storageKey) {
      const saved = sessionStorage.getItem(`pagination_${storageKey}`);
      if (saved) return Math.max(1, parseInt(saved) || 1);
    }
    return 1;
  };

  const [currentPage, setCurrentPage] = useState(getInitialPage);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Clamp page
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(p);
    if (storageKey) sessionStorage.setItem(`pagination_${storageKey}`, p.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const nextPage = () => goToPage(safePage + 1);
  const prevPage = () => goToPage(safePage - 1);

  return {
    paginatedItems,
    currentPage: safePage,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    totalItems: items.length,
    pageSize,
    startIndex: (safePage - 1) * pageSize,
    endIndex: Math.min(safePage * pageSize, items.length),
  };
};
