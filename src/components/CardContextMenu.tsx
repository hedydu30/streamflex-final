import { useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { ExternalLink, Play, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  separator?: boolean;
}

interface CardContextMenuProps {
  children: ReactNode;
  items: ContextMenuItem[];
  className?: string;
}

export const CardContextMenu = ({ children, items, className }: CardContextMenuProps) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ajuster la position pour ne pas déborder de l'écran
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - (items.length * 40 + 16));
    setPos({ x, y });
    setVisible(true);
  }, [items.length]);

  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    document.addEventListener("click", hide);
    document.addEventListener("contextmenu", hide);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
    return () => {
      document.removeEventListener("click", hide);
      document.removeEventListener("contextmenu", hide);
    };
  }, [visible]);

  return (
    <div ref={containerRef} onContextMenu={handleContextMenu} className={cn("relative", className)}>
      {children}

      {visible && (
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[180px] rounded-lg border border-border bg-card shadow-xl shadow-black/40 py-1 text-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style={{ left: pos.x, top: pos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.separator && i > 0 && <div className="h-px bg-border mx-2 my-1" />}
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={() => {
                  item.onClick();
                  setVisible(false);
                }}
              >
                {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper pour construire les items d'une vidéo
export function videoContextMenuItems(videoId: string, title?: string) {
  return [
    {
      label: "Ouvrir dans un nouvel onglet",
      icon: <ExternalLink size={14} />,
      onClick: () => window.open(`/watch?v=${videoId}`, "_blank"),
    },
    {
      label: "Lire",
      icon: <Play size={14} />,
      onClick: () => window.location.href = `/watch?v=${videoId}`,
    },
    {
      label: "Copier le lien",
      icon: <Copy size={14} />,
      separator: true,
      onClick: () => {
        const url = `${window.location.origin}/watch?v=${videoId}`;
        navigator.clipboard.writeText(url).catch(() => {});
      },
    },
  ];
}

// Helper pour construire les items d'un modèle
export function modelContextMenuItems(modelName: string) {
  const encoded = encodeURIComponent(modelName);
  return [
    {
      label: "Ouvrir dans un nouvel onglet",
      icon: <ExternalLink size={14} />,
      onClick: () => window.open(`/models?select=${encoded}`, "_blank"),
    },
    {
      label: "Copier le lien",
      icon: <Copy size={14} />,
      separator: true,
      onClick: () => {
        const url = `${window.location.origin}/models?select=${encoded}`;
        navigator.clipboard.writeText(url).catch(() => {});
      },
    },
  ];
}