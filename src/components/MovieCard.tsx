import { useState, memo } from "react";
import { Play, Plus, Check, ThumbsUp, ChevronDown } from "lucide-react";
import { Movie } from "@/data/movies";

interface MovieCardProps {
  movie: Movie;
  onSelect: (movie: Movie) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (movieId: number) => void;
}

const MovieCard = ({ movie, onSelect, isFavorite, onToggleFavorite }: MovieCardProps) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 w-[200px] md:w-[240px] cursor-pointer card-hover"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(movie)}
    >
      <img
        src={movie.image}
        alt={movie.title}
        className="w-full h-[300px] md:h-[340px] object-cover rounded-sm"
        loading="lazy"
      />

      {hovered && (
        <div className="absolute inset-x-0 bottom-0 bg-card rounded-b-md p-3 animate-fade-in shadow-xl border border-border">
          <div className="flex items-center gap-2 mb-2">
            <button className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/80 transition-colors">
              <Play size={14} fill="currentColor" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(movie.id);
              }}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                isFavorite
                  ? "border-primary text-primary hover:border-primary/70"
                  : "border-muted-foreground text-foreground hover:border-foreground"
              }`}
              title={isFavorite ? "Retirer de Ma Liste" : "Ajouter à Ma Liste"}
            >
              {isFavorite ? <Check size={14} /> : <Plus size={14} />}
            </button>
            <button className="w-8 h-8 rounded-full border border-muted-foreground text-foreground flex items-center justify-center hover:border-foreground transition-colors">
              <ThumbsUp size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(movie); }}
              className="w-8 h-8 rounded-full border border-muted-foreground text-foreground flex items-center justify-center hover:border-foreground transition-colors ml-auto"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="text-green-400 font-semibold">{movie.match}%</span>
            <span className="border border-muted-foreground text-muted-foreground px-1 py-0.5 rounded text-[10px]">
              {movie.rating}
            </span>
            <span className="text-muted-foreground">{movie.duration}</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {movie.genre.slice(0, 3).map((g, i) => (
              <span key={g} className="text-[10px] text-secondary-foreground">
                {i > 0 && <span className="text-muted-foreground mr-1">•</span>}
                {g}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(MovieCard);
