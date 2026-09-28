import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId) => {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error(
        "Failed to load profile:",
        error
      );

      setProfile(null);
      return null;
    }

    setProfile(data);
    return data;
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(session);

      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
      }

      if (mounted) {
        setLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        setSession(session);

        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!session?.user) {
      setProfile(null);
      return null;
    }

    return await loadProfile(session.user.id);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error(
        "Logout failed:",
        error
      );

      throw error;
    }

    setSession(null);
    setProfile(null);
  };

  const value = {
    session,
    user: session?.user || null,
    profile,
    loading,
    refreshProfile,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}