import { useNavigate } from "react-router-dom";
import { LogOut, User } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function AccountControls() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [showProfile, setShowProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
  };

  return (
    <div className="account-controls">

      <button
        type="button"
        className="account-profile-button cursor-target"
        onClick={() =>
          setShowProfile((previous) => !previous)
        }
        title="Profile"
      >
        <div className="account-avatar">
          <User size={17} />
        </div>

        <div className="account-info">
          <span className="account-name">
            {profile?.full_name ||
              user?.email ||
              "User"}
          </span>

          <span className="account-role">
            {profile?.role === "safety_officer"
              ? "Safety Officer"
              : "Employee"}
          </span>
        </div>
      </button>


      <button
        type="button"
        className="account-logout-button cursor-target"
        onClick={handleLogout}
        disabled={loggingOut}
        title="Logout"
      >
        <LogOut size={17} />

        <span>
          {loggingOut
            ? "Logging out..."
            : "Logout"}
        </span>
      </button>


      {showProfile && (
        <div className="profile-popup">

          <div className="profile-popup-header">

            <User size={18} />

            <span>
              Profile
            </span>

          </div>


          <div className="profile-popup-content">

            <div>
              <small>
                Name
              </small>

              <strong>
                {profile?.full_name ||
                  "Not available"}
              </strong>
            </div>


            <div>
              <small>
                Email
              </small>

              <strong>
                {user?.email ||
                  "Not available"}
              </strong>
            </div>


            <div>
              <small>
                Role
              </small>

              <strong>
                {profile?.role ===
                "safety_officer"
                  ? "Safety Officer"
                  : "Employee"}
              </strong>
            </div>


            {profile?.employee_id && (
              <div>
                <small>
                  Employee ID
                </small>

                <strong>
                  {profile.employee_id}
                </strong>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}