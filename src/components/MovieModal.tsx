import { X, Play, Plus, Check, ThumbsUp } from "lucide-react";
import { Movie } from "@/data/movies";

interface MovieModalProps {
  movie: Movie;
  onClose: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (movieId: number) => void;
}

const MovieModal = ({ movie, onClose, isFavorite, onToggleFavorite }: MovieModalProps) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-8 pb-8 overflow-y-auto"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl bg-card rounded-lg overflow-hidden shadow-2xl animate-fade-in mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop */}
        <div className="relative h-[400px]">
          <img src={movie.backdrop} alt={movie.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 gradient-overlay" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-card/80 text-foreground flex items-center justify-center hover:bg-card transition-colors"
          >
            <X size={20} />
          </button>

          <div className="absolute bottom-8 left-8 right-8">
            <h2 className="font-display text-4xl md:text-5xl text-foreground tracking-wider mb-4 drop-shadow-lg">
              {movie.title}
            </h2>

            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 bg-foreground text-background font-semibold px-8 py-2.5 rounded hover:bg-foreground/80 transition-all">
                <Play size={20} fill="currentColor" />
                Lecture
              </button>
              <button
                onClick={() => onToggleFavorite?.(movie.id)}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${
                  isFavorite
                    ? "border-primary text-primary hover:border-primary/70"
                    : "border-muted-foreground text-foreground hover:border-foreground"
                }`}
                title={isFavorite ? "Retirer de Ma Liste" : "Ajouter à Ma Liste"}
              >
                {isFavorite ? <Check size={20} /> : <Plus size={20} />}
              </button>
              <button className="w-10 h-10 rounded-full border-2 border-muted-foreground text-foreground flex items-center justify-center hover:border-foreground transition-colors">
                <ThumbsUp size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-8">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-green-400 font-bold text-lg">{movie.match}% Match</span>
                <span className="text-muted-foreground">{movie.year}</span>
                <span className="border border-muted-foreground text-muted-foreground text-xs px-2 py-0.5 rounded">
                  {movie.rating}
                </span>
                <span className="text-muted-foreground">{movie.duration}</span>
              </div>
              <p className="text-secondary-foreground leading-relaxed">{movie.description}</p>
            </div>

            <div className="md:w-48 space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Genres: </span>
                <span className="text-foreground">{movie.genre.join(", ")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Classification: </span>
                <span className="text-foreground">{movie.rating}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Année: </span>
                <span className="text-foreground">{movie.year}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieModal;
