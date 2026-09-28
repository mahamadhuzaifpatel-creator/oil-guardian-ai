import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

/**
 * Only renders the page for a signed-in user with the right role.
 * Not signed in → login page. Wrong role → that user's own page.
 */
function ProtectedRoute({ role, children }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#94a3b8" }}>
        Checking your session...
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (role && profile.role !== role) {
    const home = profile.role === "safety_officer" ? "/officer" : "/employee";
    return <Navigate to={home} replace />;
  }

  return children;
}

export default ProtectedRoute;
