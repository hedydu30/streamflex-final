import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Movie } from "@/data/movies";
import MovieCard from "./MovieCard";

interface MovieRowProps {
  title: string;
  movies: Movie[];
  onSelect: (movie: Movie) => void;
  isFavorite?: (movieId: number) => boolean;
  onToggleFavorite?: (movieId: number) => void;
}

const MovieRow = ({ title, movies, onSelect, isFavorite, onToggleFavorite }: MovieRowProps) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (rowRef.current) {
      const scrollAmount = direction === "left" ? -600 : 600;
      rowRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="mb-8 group/row">
      <h2 className="text-lg md:text-xl font-semibold text-foreground px-4 md:px-12 mb-3">
        {title}
      </h2>

      <div className="relative">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 hover:bg-background/80"
        >
          <ChevronLeft size={32} />
        </button>

        <div
          ref={rowRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide px-4 md:px-12 pb-8"
        >
          {movies.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              onSelect={onSelect}
              isFavorite={isFavorite?.(movie.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>

        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-background/60 text-foreground flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 hover:bg-background/80"
        >
          <ChevronRight size={32} />
        </button>
      </div>
    </div>
  );
};

export default MovieRow;
