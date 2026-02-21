import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
}

const PaginationBar = ({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  hasNext,
  hasPrev,
}: PaginationBarProps) => {
  const [pageInput, setPageInput] = useState("");

  if (totalPages <= 1) return null;

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = parseInt(pageInput);
      if (!isNaN(val) && val >= 1 && val <= totalPages) {
        onPageChange(val);
        setPageInput("");
      }
    }
  };

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);

    pages.push(1);
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8 pt-6 border-t border-border">
      <p className="text-xs text-muted-foreground">
        {startIndex + 1}–{endIndex} sur {totalItems}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!hasPrev}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft size={16} />
        </Button>

        {getPageNumbers().map((page, i) =>
          page === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-xs">…</span>
          ) : (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "ghost"}
              size="sm"
              className={cn("h-8 w-8 p-0 text-xs", page === currentPage && "pointer-events-none")}
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </Button>
          )
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!hasNext}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight size={16} />
        </Button>

        <div className="ml-2 flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={totalPages}
            placeholder={`${currentPage}`}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handlePageInput}
            className="h-8 w-14 text-xs text-center px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">/ {totalPages}</span>
        </div>
      </div>
    </div>
  );
};

export default PaginationBar;
