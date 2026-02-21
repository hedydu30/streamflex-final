export interface Movie {
  id: number;
  title: string;
  description: string;
  image: string;
  backdrop: string;
  year: number;
  rating: string;
  duration: string;
  genre: string[];
  match: number;
}

const TMDB_IMAGES = [
  "https://image.tmdb.org/t/p/w300/1E5baAaEse26fej7uHcjOgEERB2.jpg",
  "https://image.tmdb.org/t/p/w300/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
  "https://image.tmdb.org/t/p/w300/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
  "https://image.tmdb.org/t/p/w300/sv1xJUazXeYqALzczSZ3O6nkH75.jpg",
  "https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  "https://image.tmdb.org/t/p/w300/pB8BM7pdSp6B6Ih7QI4S2t0POoJ.jpg",
  "https://image.tmdb.org/t/p/w300/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg",
  "https://image.tmdb.org/t/p/w300/6CoRTJTmijhBLJTUNoVSUNxZMEI.jpg",
  "https://image.tmdb.org/t/p/w300/7WsyChQLEftFiDhRkZjg3YTMmew.jpg",
  "https://image.tmdb.org/t/p/w300/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",
];

const BACKDROP_IMAGES = [
  "https://image.tmdb.org/t/p/w1280/9yBVqNruk6Ykrwc32qrK2TIE5xw.jpg",
  "https://image.tmdb.org/t/p/w1280/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  "https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg",
  "https://image.tmdb.org/t/p/w1280/56v2KjBlYj05OzNBHOXxRSlu76O.jpg",
  "https://image.tmdb.org/t/p/w1280/nMKdUUepR0i5zn0y1T4CsSB5ez.jpg",
];

export const movies: Movie[] = [
  {
    id: 1,
    title: "The Dark Kingdom",
    description: "Dans un monde ravagé par les ténèbres, un héros improbable se lève pour affronter les forces du mal et restaurer la lumière. Une épopée fantastique pleine de rebondissements.",
    image: TMDB_IMAGES[0],
    backdrop: BACKDROP_IMAGES[0],
    year: 2024,
    rating: "16+",
    duration: "2h 15min",
    genre: ["Action", "Fantastique", "Aventure"],
    match: 97,
  },
  {
    id: 2,
    title: "Neon Streets",
    description: "Un détective privé parcourt les rues néon d'une mégalopole futuriste pour résoudre le mystère d'une disparition qui pourrait changer le destin de l'humanité.",
    image: TMDB_IMAGES[1],
    backdrop: BACKDROP_IMAGES[1],
    year: 2024,
    rating: "16+",
    duration: "1h 52min",
    genre: ["Sci-Fi", "Thriller", "Mystère"],
    match: 94,
  },
  {
    id: 3,
    title: "L'Écho du Silence",
    description: "Une pianiste sourde découvre qu'elle peut entendre la musique à travers les vibrations de l'univers. Un voyage émotionnel à travers l'art et la résilience humaine.",
    image: TMDB_IMAGES[2],
    backdrop: BACKDROP_IMAGES[2],
    year: 2023,
    rating: "12+",
    duration: "1h 48min",
    genre: ["Drame", "Musique"],
    match: 92,
  },
  {
    id: 4,
    title: "Opération Tempête",
    description: "Une équipe d'agents secrets doit déjouer un complot international qui menace de plonger le monde dans le chaos. Course contre la montre explosive.",
    image: TMDB_IMAGES[3],
    backdrop: BACKDROP_IMAGES[3],
    year: 2024,
    rating: "16+",
    duration: "2h 05min",
    genre: ["Action", "Espionnage", "Thriller"],
    match: 89,
  },
  {
    id: 5,
    title: "Les Derniers Jours",
    description: "Dans un futur post-apocalyptique, un groupe de survivants traverse un continent dévasté à la recherche d'un refuge mythique. Leur humanité sera mise à rude épreuve.",
    image: TMDB_IMAGES[4],
    backdrop: BACKDROP_IMAGES[4],
    year: 2023,
    rating: "18+",
    duration: "2h 20min",
    genre: ["Sci-Fi", "Drame", "Survie"],
    match: 95,
  },
  {
    id: 6,
    title: "Cœurs en Flammes",
    description: "Deux âmes brisées se rencontrent dans un petit village de Provence et découvrent que l'amour peut renaître des cendres du passé.",
    image: TMDB_IMAGES[5],
    backdrop: BACKDROP_IMAGES[0],
    year: 2024,
    rating: "12+",
    duration: "1h 55min",
    genre: ["Romance", "Drame"],
    match: 88,
  },
  {
    id: 7,
    title: "Le Pacte des Ombres",
    description: "Un avocat découvre que sa firme est au cœur d'un réseau criminel tentaculaire. Pour sauver sa famille, il devra jouer un jeu dangereux.",
    image: TMDB_IMAGES[6],
    backdrop: BACKDROP_IMAGES[1],
    year: 2023,
    rating: "16+",
    duration: "2h 10min",
    genre: ["Thriller", "Crime", "Drame"],
    match: 91,
  },
  {
    id: 8,
    title: "Horizon Lointain",
    description: "Un astronaute en mission solo vers Mars doit lutter pour sa survie quand sa navette subit une avarie critique à mi-chemin.",
    image: TMDB_IMAGES[7],
    backdrop: BACKDROP_IMAGES[2],
    year: 2024,
    rating: "12+",
    duration: "2h 30min",
    genre: ["Sci-Fi", "Aventure", "Drame"],
    match: 96,
  },
  {
    id: 9,
    title: "Rire et Châtiment",
    description: "Un comédien raté hérite d'un théâtre hanté et découvre que les fantômes qui l'habitent sont d'anciens humoristes décidés à lui apprendre l'art du rire.",
    image: TMDB_IMAGES[8],
    backdrop: BACKDROP_IMAGES[3],
    year: 2024,
    rating: "Tous publics",
    duration: "1h 40min",
    genre: ["Comédie", "Fantastique"],
    match: 85,
  },
  {
    id: 10,
    title: "Le Dernier Samouraï Moderne",
    description: "À Tokyo, un maître d'arts martiaux doit protéger son dojo ancestral face à une corporation qui veut le démolir. Tradition contre modernité.",
    image: TMDB_IMAGES[9],
    backdrop: BACKDROP_IMAGES[4],
    year: 2023,
    rating: "16+",
    duration: "2h 00min",
    genre: ["Action", "Arts Martiaux", "Drame"],
    match: 93,
  },
];

export const categories = [
  { title: "Tendances actuelles", movies: movies.slice(0, 6) },
  { title: "Films d'action", movies: movies.filter(m => m.genre.includes("Action")) },
  { title: "Science-Fiction", movies: movies.filter(m => m.genre.includes("Sci-Fi")) },
  { title: "Drames captivants", movies: movies.filter(m => m.genre.includes("Drame")) },
  { title: "Nouveautés 2024", movies: movies.filter(m => m.year === 2024) },
  { title: "Les mieux notés", movies: [...movies].sort((a, b) => b.match - a.match).slice(0, 6) },
];
