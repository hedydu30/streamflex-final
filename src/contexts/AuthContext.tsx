import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isBanned: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Check ban status on auth change
      if (session?.user) {
        supabase.rpc("is_user_banned", { _user_id: session.user.id }).then(({ data }) => {
          setIsBanned(!!data);
          if (data) {
            supabase.auth.signOut();
          }
        });

        // Register session
        supabase.from("sessions").insert({
          user_id: session.user.id,
          source: "web",
          device_info: navigator.userAgent.substring(0, 200),
        });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // Check ban before sign in
    const { data: { user: authUser }, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return { error: signInError };

    if (authUser) {
      const { data: banned } = await supabase.rpc("is_user_banned", { _user_id: authUser.id });
      if (banned) {
        await supabase.auth.signOut();
        return { error: { message: "Votre compte a été suspendu. Contactez le support." } };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    // Deactivate current session
    if (user) {
      await supabase
        .from("sessions")
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_active", true);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isBanned, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
