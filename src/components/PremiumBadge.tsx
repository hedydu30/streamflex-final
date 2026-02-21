import { Sparkles } from "lucide-react";

interface PremiumBadgeProps {
  size?: "sm" | "md";
}

const PremiumBadge = ({ size = "sm" }: PremiumBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center gap-1 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground rounded-full font-semibold ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      }`}
    >
      <Sparkles size={size === "sm" ? 10 : 14} />
      PREMIUM
    </span>
  );
};

export default PremiumBadge;
