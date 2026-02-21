import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Save, Check, Palette, User, Ghost, Cat, Dog, Bird, Fish, Bug, Flower2, Skull, Heart, Star, Zap, Shield, Crown, Flame } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import PremiumBadge from "@/components/PremiumBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { findReservedTerm } from "@/lib/reserved-names";

const AVAILABLE_GENRES = [
  "Action", "Aventure", "Comédie", "Crime", "Drame", "Fantastique",
  "Espionnage", "Arts Martiaux", "Musique", "Mystère", "Romance",
  "Sci-Fi", "Survie", "Thriller",
];

const RATINGS = ["Tous publics", "12+", "16+", "18+"];
const LANGUAGES = ["Français", "English", "Español", "Deutsch", "Italiano"];

const AVATAR_ICONS = [
  { icon: User, label: "Utilisateur", bg: "hsl(200 80% 50%)" },
  { icon: Ghost, label: "Fantôme", bg: "hsl(270 70% 55%)" },
  { icon: Cat, label: "Chat", bg: "hsl(30 85% 50%)" },
  { icon: Dog, label: "Chien", bg: "hsl(20 75% 45%)" },
  { icon: Bird, label: "Oiseau", bg: "hsl(180 70% 45%)" },
  { icon: Fish, label: "Poisson", bg: "hsl(210 80% 50%)" },
  { icon: Bug, label: "Insecte", bg: "hsl(120 60% 40%)" },
  { icon: Flower2, label: "Fleur", bg: "hsl(340 75% 55%)" },
  { icon: Skull, label: "Crâne", bg: "hsl(0 0% 35%)" },
  { icon: Heart, label: "Cœur", bg: "hsl(350 80% 50%)" },
  { icon: Star, label: "Étoile", bg: "hsl(45 90% 50%)" },
  { icon: Zap, label: "Éclair", bg: "hsl(55 85% 50%)" },
  { icon: Shield, label: "Bouclier", bg: "hsl(220 70% 50%)" },
  { icon: Crown, label: "Couronne", bg: "hsl(42 85% 55%)" },
  { icon: Flame, label: "Flamme", bg: "hsl(15 90% 50%)" },
];

const Profile = () => {
  const { user } = useAuth();
  const { themes, currentTheme, setTheme: applyTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [preferredRating, setPreferredRating] = useState("Tous publics");
  const [language, setLanguage] = useState("Français");
  const [autoplay, setAutoplay] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    fetchProfile();
    // Check admin role
    supabase.rpc("has_role", { _role: "admin", _user_id: user.id }).then(({ data }) => {
      setIsAdmin(!!data);
    });
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setDisplayName(data.display_name || "");
      setAvatarUrl(data.avatar_url);
      setFavoriteGenres((data as any).favorite_genres || []);
      setPreferredRating((data as any).preferred_rating || "Tous publics");
      setLanguage((data as any).language || "Français");
      setAutoplay((data as any).autoplay_enabled ?? true);
      setIsPremium(!!(data as any).is_premium);
      setPremiumUntil((data as any).premium_until);
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Erreur", description: "Impossible de charger l'image", variant: "destructive" });
      return;
    }

    const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setAvatarUrl(publicUrl.publicUrl + "?t=" + Date.now());
  };

  const selectPresetAvatar = (iconLabel: string) => {
    setAvatarUrl(`icon:${iconLabel}`);
  };

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleSave = async () => {
    if (!user) return;

    // Validate display name against reserved terms (skip for admins)
    if (!isAdmin) {
      const reservedTerm = findReservedTerm(displayName);
      if (reservedTerm) {
        toast({ title: "Nom interdit", description: `Le nom contient un terme réservé : "${reservedTerm}". Veuillez en choisir un autre.`, variant: "destructive" });
        return;
      }
    }

    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        avatar_url: avatarUrl,
        favorite_genres: favoriteGenres,
        preferred_rating: preferredRating,
        language,
        autoplay_enabled: autoplay,
      } as any)
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder", variant: "destructive" });
    } else {
      toast({ title: "Profil mis à jour", description: "Vos préférences ont été sauvegardées." });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 md:px-12 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              Mon Profil
              {isPremium && <PremiumBadge size="md" />}
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        {/* Avatar Section */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-foreground">Avatar</h2>
          <div className="flex items-start gap-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-border flex items-center justify-center"
                style={{ backgroundColor: avatarUrl?.startsWith("icon:") ? AVATAR_ICONS.find(a => a.label === avatarUrl.replace("icon:", ""))?.bg || "hsl(var(--secondary))" : undefined }}
              >
                {avatarUrl?.startsWith("icon:") ? (
                  (() => {
                    const found = AVATAR_ICONS.find(a => a.label === avatarUrl.replace("icon:", ""));
                    const IconComp = found?.icon || User;
                    return <IconComp size={48} className="text-white" />;
                  })()
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary bg-secondary">
                    {displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
              >
                <Camera size={24} className="text-foreground" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-3">Ou choisissez un personnage :</p>
              <div className="flex gap-2 flex-wrap max-w-md">
                {AVATAR_ICONS.map(({ icon: Icon, label, bg }) => (
                  <button
                    key={label}
                    onClick={() => selectPresetAvatar(label)}
                    className={`w-11 h-11 rounded-lg flex items-center justify-center border-2 transition-all ${
                      avatarUrl === `icon:${label}` ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border hover:border-muted-foreground"
                    }`}
                    style={{ backgroundColor: bg }}
                    title={label}
                  >
                    <Icon size={22} className="text-white" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Display Name */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Nom d'affichage</h2>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="Votre nom"
            className="w-full max-w-sm bg-secondary/80 text-foreground rounded px-4 py-3 text-base placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary border border-border/50"
          />
        </section>

        {/* Favorite Genres */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Genres favoris</h2>
          <p className="text-sm text-muted-foreground">Sélectionnez vos genres préférés pour des recommandations personnalisées.</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_GENRES.map((genre) => {
              const selected = favoriteGenres.includes(genre);
              return (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
                >
                  {selected && <Check size={14} className="inline mr-1" />}
                  {genre}
                </button>
              );
            })}
          </div>
        </section>

        {/* Preferences */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-foreground">Préférences de visionnage</h2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Rating */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Classification d'âge maximale</label>
              <select
                value={preferredRating}
                onChange={(e) => setPreferredRating(e.target.value)}
                className="w-full bg-secondary/80 text-foreground rounded px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border/50"
              >
                {RATINGS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Langue préférée</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-secondary/80 text-foreground rounded px-4 py-3 outline-none focus:ring-2 focus:ring-primary border border-border/50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Autoplay toggle */}
          <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-4 border border-border/30">
            <div>
              <p className="text-foreground font-medium">Lecture automatique</p>
              <p className="text-sm text-muted-foreground">Lancer automatiquement l'épisode suivant</p>
            </div>
            <button
              onClick={() => setAutoplay(!autoplay)}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                autoplay ? "bg-primary" : "bg-secondary"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${
                  autoplay ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </section>

        {/* Theme Selector */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Palette size={20} className="text-primary" /> Thème visuel
          </h2>
          <p className="text-sm text-muted-foreground">Choisissez un thème pour personnaliser l'apparence de l'interface.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {themes.map((theme) => {
              const isSelected = currentTheme?.id === theme.id;
              const colors = theme.colors as any;
              return (
                <button
                  key={theme.id}
                  onClick={() => applyTheme(theme.id)}
                  className={`relative rounded-lg p-3 border-2 transition-all text-left ${
                    isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted-foreground"
                  }`}
                  style={{ backgroundColor: `hsl(${colors.background})` }}
                >
                  <div className="flex gap-1 mb-2">
                    {["primary", "secondary", "accent", "muted"].map((k) => (
                      <div
                        key={k}
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: `hsl(${colors[k] || "0 0% 50%"})` }}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-medium" style={{ color: `hsl(${colors.foreground})` }}>
                    {theme.name}
                  </p>
                  {theme.description && (
                    <p className="text-xs mt-0.5" style={{ color: `hsl(${colors["muted-foreground"]})` }}>
                      {theme.description}
                    </p>
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Check size={16} className="text-primary" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Account Info */}
        <section className="space-y-4 pb-10">
          <h2 className="text-xl font-semibold text-foreground">Informations du compte</h2>
          <div className="bg-secondary/30 rounded-lg p-5 border border-border/30 space-y-2">
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="text-foreground">{user?.email}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Profile;
