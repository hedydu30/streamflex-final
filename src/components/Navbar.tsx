import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Menu, X, LogOut, LogIn, Shield, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePreviewSound } from "@/contexts/PreviewSoundContext";
import NotificationsDropdown from "./NotificationsDropdown";
import PremiumBadge from "./PremiumBadge";
import ActivateKeyModal from "./ActivateKeyModal";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const PUBLIC_NAV_ITEMS = [
  { label: "Accueil", path: "/" },
  { label: "Vidéos", path: "/videos" },
  { label: "Modèles", path: "/models" },
  { label: "Playlists", path: "/playlists" },
  { label: "Ma Liste", path: "/my-list" },
];

const Navbar = ({ onSearch }: { onSearch: (query: string) => void }) => {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { previewSoundEnabled, togglePreviewSound } = usePreviewSound();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsPremium(false);
      return;
    }
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => setIsAdmin(!!data));
    fetchPremiumStatus();
  }, [user]);

  const fetchPremiumStatus = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("is_premium, premium_until")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      const isActive = data.is_premium && (!data.premium_until || new Date(data.premium_until) > new Date());
      setIsPremium(!!isActive);
    }
  };

  const { general: siteGeneral, cms: siteCms } = useSiteSettings();
  const siteName = siteGeneral?.site_name || "STREAMFLIX";
  const logoUrl = siteGeneral?.logo_url || "";
  const navbarBlur = siteCms?.navbar_blur !== false;

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch(value);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? navbarBlur
              ? "bg-background/95 backdrop-blur-md shadow-lg"
              : "bg-background/95 shadow-lg"
            : "bg-gradient-to-b from-background/80 to-transparent"
        }`}
      >
        <div className="flex items-center justify-between px-3 md:px-12 py-3">
          <div className="gap-4 md:gap-8 flex items-center justify-start text-primary-foreground">
            <h1
              onClick={() => navigate("/")}
              className="font-display text-xl md:text-4xl tracking-wider cursor-pointer font-mono text-cyan-500"
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={siteName}
                  className="h-8 md:h-10 object-contain max-w-[160px]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                siteName
              )}
            </h1>

            <div className="hidden md:flex items-center gap-6">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`text-sm transition-colors duration-200 ${
                    location.pathname === item.path
                      ? "text-foreground font-semibold"
                      : "text-secondary-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => navigate("/import")}
                  className={`text-sm transition-colors duration-200 ${
                    location.pathname === "/import"
                      ? "text-foreground font-semibold"
                      : "text-secondary-foreground hover:text-foreground"
                  }`}
                >
                  Importer
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => navigate("/admin")}
                  className={`text-sm flex items-center gap-1 transition-colors duration-200 ${
                    location.pathname === "/admin"
                      ? "text-primary font-semibold"
                      : "text-secondary-foreground hover:text-foreground"
                  }`}
                >
                  <Shield size={14} />
                  Admin
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3">
            <div
              className={`flex items-center transition-all duration-300 ${searchOpen ? "bg-secondary border border-border" : ""} rounded`}
            >
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 text-foreground hover:text-primary transition-colors"
              >
                <Search size={20} />
              </button>
              {searchOpen && (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Titres, genres..."
                  className="bg-transparent text-foreground text-sm py-1 pr-3 w-40 md:w-56 outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              )}
            </div>

            <button
              onClick={togglePreviewSound}
              className={`p-2 rounded transition-colors ${previewSoundEnabled ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title={previewSoundEnabled ? "Désactiver le son des previews" : "Activer le son des previews"}
            >
              {previewSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            {user && (
              <>
                <NotificationsDropdown />
                {!isPremium && (
                  <button
                    onClick={() => setShowActivate(true)}
                    className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Sparkles size={14} />
                    Activer Premium
                  </button>
                )}
              </>
            )}

            {user ? (
              <div className="hidden md:flex items-center gap-3">
                <button
                  onClick={() => navigate("/profile")}
                  className="relative w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
                  title="Mon profil"
                >
                  {user.email?.[0]?.toUpperCase() || "U"}
                  {isPremium && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full border-2 border-background flex items-center justify-center">
                      <Sparkles size={8} className="text-primary-foreground" />
                    </span>
                  )}
                </button>
                <button
                  onClick={signOut}
                  className="p-2 text-foreground hover:text-primary transition-colors"
                  title="Déconnexion"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate("/auth")}
                className="hidden md:flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <LogIn size={16} />
                Connexion
              </button>
            )}

            <button className="md:hidden p-2 text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-background/95 backdrop-blur-md border-t border-border animate-fade-in max-h-[70vh] overflow-y-auto">
            <div className="flex flex-col px-4 py-4 gap-3">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`text-left py-1 transition-colors ${
                    location.pathname === item.path
                      ? "text-foreground font-semibold"
                      : "text-secondary-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => {
                    navigate("/import");
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-1 text-secondary-foreground hover:text-foreground"
                >
                  Importer
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    navigate("/admin");
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-1 text-secondary-foreground hover:text-foreground flex items-center gap-2"
                >
                  <Shield size={14} />
                  Admin
                </button>
              )}
              {user && !isPremium && (
                <button
                  onClick={() => {
                    setShowActivate(true);
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-1 text-primary flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  Activer Premium
                </button>
              )}
              {user && (
                <button
                  onClick={() => {
                    navigate("/profile");
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-1 text-secondary-foreground hover:text-foreground"
                >
                  Mon Profil
                </button>
              )}
              {user ? (
                <button
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-1 text-destructive flex items-center gap-2"
                >
                  <LogOut size={14} />
                  Déconnexion
                </button>
              ) : (
                <button
                  onClick={() => {
                    navigate("/auth");
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-1 text-primary flex items-center gap-2"
                >
                  <LogIn size={14} />
                  Connexion
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {showActivate && <ActivateKeyModal onClose={() => setShowActivate(false)} onActivated={fetchPremiumStatus} />}
    </>
  );
};

export default Navbar;
