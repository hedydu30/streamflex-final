import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { findReservedTerm, findReservedTermInEmail } from "@/lib/reserved-names";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Email requis", description: "Entrez votre email pour réinitialiser votre mot de passe.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email envoyé", description: "Vérifiez votre boîte de réception pour réinitialiser votre mot de passe." });
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: "Erreur de connexion", description: error.message, variant: "destructive" });
      } else {
        navigate("/");
      }
    } else {
      // Validate reserved terms in email
      const emailTerm = findReservedTermInEmail(email);
      if (emailTerm) {
        toast({ title: "Email interdit", description: `L'email contient un terme réservé : "${emailTerm}"`, variant: "destructive" });
        setLoading(false);
        return;
      }
      // Validate reserved terms in display name
      if (displayName) {
        const nameTerm = findReservedTerm(displayName);
        if (nameTerm) {
          toast({ title: "Nom interdit", description: `Le nom contient un terme réservé : "${nameTerm}"`, variant: "destructive" });
          setLoading(false);
          return;
        }
      }
      if (password.length < 6) {
        toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 6 caractères", variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast({ title: "Erreur d'inscription", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Inscription réussie", description: "Vérifiez votre email pour confirmer votre compte." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center">
      {/* Background image overlay */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1574375927938-d5a98e8d6f28?w=1920&q=80)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />

      {/* Logo */}
      <div className="absolute top-0 left-0 right-0 px-6 md:px-12 py-6 z-20">
        <h1 className="font-display text-4xl md:text-5xl text-primary tracking-wider cursor-pointer" onClick={() => navigate("/")}>
          STREAMFLIX
        </h1>
      </div>

      {/* Auth form */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-background/80 backdrop-blur-sm rounded-lg p-10 md:p-14 shadow-2xl border border-border/30">
          <h2 className="text-3xl font-bold text-foreground mb-8">
            {isLogin ? "S'identifier" : "S'inscrire"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div>
                <input
                  type="text"
                  placeholder="Nom d'affichage"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-secondary/80 text-foreground rounded px-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary border border-border/50 transition-all"
                />
              </div>
            )}

            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-secondary/80 text-foreground rounded px-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary border border-border/50 transition-all"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-secondary/80 text-foreground rounded px-4 py-3.5 text-base placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary border border-border/50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded text-base hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Chargement..." : isLogin ? "S'identifier" : "S'inscrire"}
            </button>

            {isLogin && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full text-muted-foreground text-sm hover:text-foreground hover:underline transition-colors mt-2"
              >
                Mot de passe oublié ?
              </button>
            )}
          </form>

          <div className="mt-10 text-muted-foreground text-sm">
            {isLogin ? (
              <p>
                Nouveau sur StreamFlix ?{" "}
                <button onClick={() => setIsLogin(false)} className="text-foreground hover:underline font-medium">
                  Inscrivez-vous maintenant.
                </button>
              </p>
            ) : (
              <p>
                Déjà un compte ?{" "}
                <button onClick={() => setIsLogin(true)} className="text-foreground hover:underline font-medium">
                  Identifiez-vous.
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
