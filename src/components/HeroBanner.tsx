import { memo } from "react";
import { Play, Info } from "lucide-react";
import { Movie } from "@/data/movies";
const heroBanner = "/hero-banner.jpg";

interface HeroBannerProps {
  movie: Movie;
  onInfo: (movie: Movie) => void;
}

const HeroBanner = ({ movie, onInfo }: HeroBannerProps) => {
  return (
    <div className="relative h-[85vh] w-full overflow-hidden">
      <img
        src={heroBanner}
        alt={movie.title}
        className="absolute inset-0 w-full h-full object-cover"
        fetchPriority="high"
      />
      <div className="absolute inset-0 gradient-overlay" />
      <div className="absolute inset-0 gradient-overlay-right" />

      <div className="absolute bottom-[15%] left-4 md:left-12 max-w-xl z-10 animate-fade-in">
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl text-foreground tracking-wider mb-4 drop-shadow-lg">
          {movie.title}
        </h1>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-green-400 font-semibold">{movie.match}% Match</span>
          <span className="text-muted-foreground">{movie.year}</span>
          <span className="border border-muted-foreground text-muted-foreground text-xs px-2 py-0.5 rounded">
            {movie.rating}
          </span>
          <span className="text-muted-foreground">{movie.duration}</span>
        </div>

        <p className="text-sm md:text-base text-secondary-foreground mb-6 line-clamp-3 leading-relaxed">
          {movie.description}
        </p>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-foreground text-background font-semibold px-6 py-2.5 rounded hover:bg-foreground/80 transition-all duration-200">
            <Play size={20} fill="currentColor" />
            Lecture
          </button>
          <button
            onClick={() => onInfo(movie)}
            className="flex items-center gap-2 bg-secondary/80 text-foreground font-semibold px-6 py-2.5 rounded hover:bg-secondary transition-all duration-200"
          >
            <Info size={20} />
            Plus d'infos
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(HeroBanner);
