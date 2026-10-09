import { useEffect, useState } from "react";
import {
  ShieldCheck,
  User,
  HardHat,
  ArrowRight,
  LockKeyhole,
  Mail,
  ArrowLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// Public demo accounts for evaluators (test data only)
const DEMO_ACCOUNTS = {
  employee: {
    email: "demo.employee@gmail.com",
    password: "OilDemo@2026"
  },
  officer: {
    email: "demo.officer@gmail.com",
    password: "OilDemo@2026"
  }
};

function Login() {
  const [role, setRole] = useState("employee");
  // Opened from a password-reset email? (our own ?reset=1 marker survives
  // Supabase's URL clean-up; the hash check covers older links)
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const isRecoveryLink =
      params.get("reset") === "1" ||
      window.location.hash.includes("type=recovery");
    return isRecoveryLink ? "reset" : "login";
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  /*
   * If Supabase restores an existing session,
   * send the user directly to the correct dashboard.
   */
  useEffect(() => {
    // Never auto-redirect while the user is setting a new password
    if (authLoading || !user || !profile || view === "reset") return;

    if (profile.role === "safety_officer") {
      navigate("/officer", { replace: true });
    } else {
      navigate("/employee", { replace: true });
    }
  }, [user, profile, authLoading, navigate, view]);

  /*
   * Supabase password recovery.
   *
   * When the user clicks the email recovery link,
   * Supabase creates a recovery session.
   */
  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset");
        setError("");
        setMessage("");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const clearMessages = () => {
    setError("");
    setMessage("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: username.trim(),
          password
        });

      if (loginError) {
        throw loginError;
      }

      if (!data.user) {
        throw new Error("Login failed. Please try again.");
      }

      /*
       * AuthContext loads the user's profile after login.
       * Give it a moment to obtain the role.
       */
      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

      if (profileError) {
        await supabase.auth.signOut();
        throw new Error(
          "Your account profile could not be loaded."
        );
      }

      /*
       * Verify that the selected login role matches
       * the actual role stored in Supabase.
       */
      if (
        role === "officer" &&
        profileData.role !== "safety_officer"
      ) {
        await supabase.auth.signOut();

        throw new Error(
          "This account is not registered as a Safety Officer."
        );
      }

      if (
        role === "employee" &&
        profileData.role !== "employee"
      ) {
        await supabase.auth.signOut();

        throw new Error(
          "This account is registered as a Safety Officer. Select Safety Officer to continue."
        );
      }

      if (profileData.role === "safety_officer") {
        navigate("/officer", { replace: true });
      } else {
        navigate("/employee", { replace: true });
      }
    } catch (loginError) {
      console.error("Login error:", loginError);

      setError(
        loginError.message ||
          "Unable to sign in. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setError("Enter your registered email address.");
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const redirectUrl = `${window.location.origin}/login?reset=1`;

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: redirectUrl
          }
        );

      if (resetError) {
        throw resetError;
      }

      setMessage(
        "Password reset instructions have been sent to your email."
      );
    } catch (resetError) {
      console.error("Password reset error:", resetError);

      setError(
        resetError.message ||
          "Unable to send password reset instructions."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (event) => {
    event.preventDefault();

    if (
      !name.trim() ||
      !email.trim() ||
      !password.trim()
    ) {
      setError("Please complete all required fields.");
      return;
    }

    if (password.length < 6) {
      setError(
        "Password must contain at least 6 characters."
      );
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { data, error: signupError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              requested_role:
                role === "officer"
                  ? "safety_officer"
                  : "employee"
            }
          }
        });

      if (signupError) {
        throw signupError;
      }

      /*
       * Public signup is intentionally not allowed to
       * directly create a Safety Officer account.
       *
       * The database trigger creates the actual role
       * as "employee" and stores the requested role.
       */
      if (role === "officer") {
        setMessage(
          "Account request submitted. Safety Officer access requires administrator approval."
        );
      } else if (data.session) {
        setMessage(
          "Account created successfully. You can now sign in."
        );
      } else {
        setMessage(
          "Account created. Check your email to confirm your account, then sign in."
        );
      }

      setPassword("");

      setTimeout(() => {
        setView("login");
      }, 2500);
    } catch (signupError) {
      console.error("Signup error:", signupError);

      setError(
        signupError.message ||
          "Unable to create your account."
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (event) => {
    event.preventDefault();

    if (!password.trim()) {
      setError("Enter a new password.");
      return;
    }

    if (password.length < 6) {
      setError(
        "Password must contain at least 6 characters."
      );
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({
          password
        });

      if (updateError) {
        throw updateError;
      }

      setPassword("");

      setMessage(
        "Password updated successfully. You can now sign in."
      );

      await supabase.auth.signOut();

      // Remove the ?reset=1 marker so a page refresh shows the normal login
      window.history.replaceState({}, "", "/login");

      setTimeout(() => {
        setView("login");
        setMessage("");
      }, 1800);
    } catch (updateError) {
      console.error(
        "Password update error:",
        updateError
      );

      setError(
        updateError.message ||
          "Unable to update your password."
      );
    } finally {
      setLoading(false);
    }
  };

  const changeView = (newView) => {
    setView(newView);
    clearMessages();
  };

  // Animation variants
  const pageVariants = {
    initial: {
      opacity: 0,
      x: 20
    },
    animate: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut"
      }
    },
    exit: {
      opacity: 0,
      x: -20,
      transition: {
        duration: 0.2,
        ease: "easeIn"
      }
    }
  };

  return (
    <div className="login-page">
      <div className="login-background-glow" />

      <div className="login-container">
        <motion.div
          className="login-brand"
          initial={{
            opacity: 0,
            y: -20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5
          }}
        >
          <div className="login-brand-icon">
            <ShieldCheck size={34} />
          </div>

          <h1>OIL Guardian AI</h1>

          <p>
            INDUSTRIAL SAFETY INTELLIGENCE PLATFORM
          </p>
        </motion.div>

        <div className="login-card">
          <AnimatePresence mode="wait">

            {/* ================= LOGIN ================= */}
            {view === "login" && (
              <motion.div
                key="login"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="login-heading">
                  <span>SECURE ACCESS</span>

                  <h2>Welcome Back</h2>

                  <p>
                    Sign in to access the OIL Guardian
                    safety operations system.
                  </p>
                </div>

                <div className="role-selection">
                  <motion.button
                    type="button"
                    whileHover={{
                      scale: 1.03,
                      y: -2
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    className={
                      role === "employee"
                        ? "role-card active cursor-target"
                        : "role-card cursor-target"
                    }
                    onClick={() => {
                      setRole("employee");
                      clearMessages();
                    }}
                  >
                    <div className="role-icon">
                      <HardHat size={23} />
                    </div>

                    <div>
                      <strong>Employee</strong>
                      <span>
                        Field Operations Terminal
                      </span>
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{
                      scale: 1.03,
                      y: -2
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    className={
                      role === "officer"
                        ? "role-card active cursor-target"
                        : "role-card cursor-target"
                    }
                    onClick={() => {
                      setRole("officer");
                      clearMessages();
                    }}
                  >
                    <div className="role-icon">
                      <ShieldCheck size={23} />
                    </div>

                    <div>
                      <strong>
                        Safety Officer
                      </strong>

                      <span>
                        Safety Operations Command
                      </span>
                    </div>
                  </motion.button>
                </div>

                <form onSubmit={handleLogin}>
                  <div className="login-field">
                    <label>
                      <Mail size={14} />
                      EMAIL ADDRESS
                    </label>

                    <input
                      type="email"
                      placeholder="Enter registered email"
                      className="cursor-target"
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value)
                      }
                      autoComplete="email"
                    />
                  </div>

                  <div className="login-field">
                    <label>
                      <LockKeyhole size={14} />
                      PASSWORD
                    </label>

                    <input
                      type="password"
                      placeholder="Enter password"
                      className="cursor-target"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="current-password"
                    />
                  </div>

                  <div className="login-options">
                    <label className="remember-me cursor-target">
                      <input
                        type="checkbox"
                        className="cursor-target"
                      />

                      <span>
                        Remember me
                      </span>
                    </label>

                    <motion.button
                      type="button"
                      className="forgot-link cursor-target"
                      whileHover={{
                        scale: 1.05
                      }}
                      onClick={() =>
                        changeView("forgot")
                      }
                    >
                      Forgot Password?
                    </motion.button>
                  </div>

                  {error && (
                    <motion.div
                      initial={{
                        opacity: 0
                      }}
                      animate={{
                        opacity: 1
                      }}
                      className="login-error"
                    >
                      {error}
                    </motion.div>
                  )}

                  {message && (
                    <motion.div
                      initial={{
                        opacity: 0
                      }}
                      animate={{
                        opacity: 1
                      }}
                      className="login-success"
                    >
                      {message}
                    </motion.div>
                  )}

                  <motion.button
                    type="submit"
                    className="login-button cursor-target"
                    whileHover={{
                      scale: 1.02
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    disabled={loading}
                  >
                    <span>
                      {loading
                        ? "SIGNING IN..."
                        : `SIGN IN AS ${
                            role === "employee"
                              ? "EMPLOYEE"
                              : "SAFETY OFFICER"
                          }`}
                    </span>

                    <ArrowRight size={19} />
                  </motion.button>
                </form>

                {/* ===== Demo access for evaluators ===== */}
                <div
                  style={{
                    marginTop: "18px",
                    padding: "14px",
                    border: "1px dashed #3b82f6",
                    borderRadius: "12px",
                    background: "rgba(59,130,246,0.08)",
                    fontSize: "13px"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "8px" }}>
                    Evaluator demo access
                  </strong>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {["employee", "officer"].map((demoRole) => (
                      <button
                        key={demoRole}
                        type="button"
                        className="cursor-target"
                        onClick={() => {
                          setRole(demoRole);
                          setUsername(DEMO_ACCOUNTS[demoRole].email);
                          setPassword(DEMO_ACCOUNTS[demoRole].password);
                          clearMessages();
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #3b82f6",
                          background: "transparent",
                          color: "#3b82f6",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        {demoRole === "employee"
                          ? "Use Employee demo"
                          : "Use Safety Officer demo"}
                      </button>
                    ))}
                  </div>

                  <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
                    Click a button to fill the login, then press Sign In.
                    Demo accounts contain test data only.
                  </p>
                </div>

                <div className="create-account-row">
                  <span>
                    Don't have an account?
                  </span>

                  <motion.button
                    type="button"
                    className="cursor-target"
                    whileHover={{
                      scale: 1.05
                    }}
                    onClick={() =>
                      changeView("create")
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#3b82f6",
                      fontWeight: 600,
                      fontSize: "13px"
                    }}
                  >
                    Create Account
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ================= FORGOT PASSWORD ================= */}
            {view === "forgot" && (
              <motion.div
                key="forgot"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="login-heading">
                  <span>
                    ACCOUNT RECOVERY
                  </span>

                  <h2>
                    Forgot Password?
                  </h2>

                  <p>
                    Enter your registered email
                    address and we'll send
                    instructions to reset your
                    password.
                  </p>
                </div>

                <form
                  onSubmit={handleForgotPassword}
                >
                  <div className="login-field">
                    <label>
                      <Mail size={14} />
                      REGISTERED EMAIL
                    </label>

                    <input
                      type="email"
                      placeholder="Enter your email"
                      className="cursor-target"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      autoComplete="email"
                    />
                  </div>

                  {error && (
                    <div className="login-error">
                      {error}
                    </div>
                  )}

                  {message && (
                    <div className="login-success">
                      {message}
                    </div>
                  )}

                  <motion.button
                    type="submit"
                    className="login-button cursor-target"
                    whileHover={{
                      scale: 1.02
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    disabled={loading}
                  >
                    <span>
                      {loading
                        ? "SENDING..."
                        : "SEND RESET INSTRUCTIONS"}
                    </span>

                    <ArrowRight size={19} />
                  </motion.button>
                </form>

                <motion.button
                  type="button"
                  className="back-login cursor-target"
                  whileHover={{
                    x: -5
                  }}
                  onClick={() =>
                    changeView("login")
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    margin: "20px auto 0",
                    fontSize: "13px"
                  }}
                >
                  <ArrowLeft size={16} />
                  Back to Login
                </motion.button>
              </motion.div>
            )}

            {/* ================= CREATE ACCOUNT ================= */}
            {view === "create" && (
              <motion.div
                key="create"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="login-heading">
                  <span>
                    NEW USER REGISTRATION
                  </span>

                  <h2>
                    Create Account
                  </h2>

                  <p>
                    Create your OIL Guardian AI
                    account and select your
                    operational role.
                  </p>
                </div>

                <div className="role-selection">
                  <motion.button
                    type="button"
                    whileHover={{
                      scale: 1.03,
                      y: -2
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    className={
                      role === "employee"
                        ? "role-card active cursor-target"
                        : "role-card cursor-target"
                    }
                    onClick={() =>
                      setRole("employee")
                    }
                  >
                    <div className="role-icon">
                      <HardHat size={21} />
                    </div>

                    <div>
                      <strong>
                        Employee
                      </strong>

                      <span>
                        Field Operations
                      </span>
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{
                      scale: 1.03,
                      y: -2
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    className={
                      role === "officer"
                        ? "role-card active cursor-target"
                        : "role-card cursor-target"
                    }
                    onClick={() =>
                      setRole("officer")
                    }
                  >
                    <div className="role-icon">
                      <ShieldCheck size={21} />
                    </div>

                    <div>
                      <strong>
                        Safety Officer
                      </strong>

                      <span>
                        Safety Command
                      </span>
                    </div>
                  </motion.button>
                </div>

                <form
                  onSubmit={handleCreateAccount}
                >
                  <div className="login-field">
                    <label>
                      <User size={14} />
                      FULL NAME
                    </label>

                    <input
                      type="text"
                      placeholder="Enter full name"
                      className="cursor-target"
                      value={name}
                      onChange={(e) =>
                        setName(e.target.value)
                      }
                      autoComplete="name"
                    />
                  </div>

                  <div className="login-field">
                    <label>
                      <Mail size={14} />
                      EMAIL ADDRESS
                    </label>

                    <input
                      type="email"
                      placeholder="Enter email address"
                      className="cursor-target"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      autoComplete="email"
                    />
                  </div>

                  <div className="login-field">
                    <label>
                      <LockKeyhole size={14} />
                      CREATE PASSWORD
                    </label>

                    <input
                      type="password"
                      placeholder="Create password"
                      className="cursor-target"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </div>

                  {error && (
                    <motion.div
                      initial={{
                        opacity: 0
                      }}
                      animate={{
                        opacity: 1
                      }}
                      className="login-error"
                    >
                      {error}
                    </motion.div>
                  )}

                  {message && (
                    <motion.div
                      initial={{
                        opacity: 0
                      }}
                      animate={{
                        opacity: 1
                      }}
                      className="login-success"
                    >
                      {message}
                    </motion.div>
                  )}

                  <motion.button
                    type="submit"
                    className="login-button cursor-target"
                    whileHover={{
                      scale: 1.02
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    disabled={loading}
                  >
                    <span>
                      {loading
                        ? "CREATING..."
                        : "CREATE ACCOUNT"}
                    </span>

                    <ArrowRight size={19} />
                  </motion.button>
                </form>

                <motion.button
                  type="button"
                  className="back-login cursor-target"
                  whileHover={{
                    x: -5
                  }}
                  onClick={() =>
                    changeView("login")
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    margin: "20px auto 0",
                    fontSize: "13px"
                  }}
                >
                  <ArrowLeft size={16} />
                  Back to Login
                </motion.button>
              </motion.div>
            )}

            {/* ================= RESET PASSWORD ================= */}
            {view === "reset" && (
              <motion.div
                key="reset"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="login-heading">
                  <span>
                    PASSWORD RECOVERY
                  </span>

                  <h2>
                    Set New Password
                  </h2>

                  <p>
                    Enter a new password for your
                    OIL Guardian AI account.
                  </p>
                </div>

                <form
                  onSubmit={
                    handlePasswordUpdate
                  }
                >
                  <div className="login-field">
                    <label>
                      <LockKeyhole size={14} />
                      NEW PASSWORD
                    </label>

                    <input
                      type="password"
                      placeholder="Enter new password"
                      className="cursor-target"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </div>

                  {error && (
                    <div className="login-error">
                      {error}
                    </div>
                  )}

                  {message && (
                    <div className="login-success">
                      {message}
                    </div>
                  )}

                  <motion.button
                    type="submit"
                    className="login-button cursor-target"
                    whileHover={{
                      scale: 1.02
                    }}
                    whileTap={{
                      scale: 0.98
                    }}
                    disabled={loading}
                  >
                    <span>
                      {loading
                        ? "UPDATING..."
                        : "UPDATE PASSWORD"}
                    </span>

                    <ArrowRight size={19} />
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="login-security">
            <span className="login-status-dot" />
            SECURE OIL GUARDIAN ACCESS
          </div>
        </div>

        <motion.div
          className="login-footer"
          initial={{
            opacity: 0
          }}
          animate={{
            opacity: 1
          }}
          transition={{
            delay: 0.5,
            duration: 1
          }}
        >
          OIL GUARDIAN AI · INDUSTRIAL SAFETY INTELLIGENCE
        </motion.div>
      </div>
    </div>
  );
}

export default Login;