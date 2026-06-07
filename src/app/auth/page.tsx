"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function AuthPage() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetFeedback = () => {
    setStatus("Ready");
    setError("");
  };

  const handleSignup = async () => {
    if (loading) return;

    resetFeedback();

    if (!companyName.trim()) {
      setError("Please enter company name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter email.");
      return;
    }

    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Creating account...");

      const userCred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const user = userCred.user;

      setStatus("Saving company workspace...");

      await setDoc(doc(db, "companies", user.uid), {
        name: companyName.trim(),
        ownerId: user.uid,
        ownerEmail: user.email || email.trim(),
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "companies", user.uid, "users", user.uid), {
        uid: user.uid,
        email: user.email || email.trim(),
        role: "owner",
        companyId: user.uid,
        createdAt: serverTimestamp(),
      });

      setStatus("Done. Redirecting...");
      window.location.href = "/";
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Something went wrong.");
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (loading) return;

    resetFeedback();

    if (!email.trim()) {
      setError("Please enter email.");
      return;
    }

    if (!password.trim()) {
      setError("Please enter password.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Logging in...");

      await signInWithEmailAndPassword(auth, email.trim(), password);

      setStatus("Success. Redirecting...");
      window.location.href = "/";
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Login failed.");
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-pro-page">
      <section className="auth-pro-shell">
        <div className="auth-pro-left">
          <div className="auth-brand-pill">SiteDiary Dashboard</div>

          <h1>
            Control site diaries, progress, materials, and delays from one
            professional dashboard.
          </h1>

          <p>
            Built for construction and mining teams that need clean daily records,
            supervisor tracking, weekly progress visibility, and reliable reporting.
          </p>

          <div className="auth-feature-grid">
            <div>
              <strong>Daily Diaries</strong>
              <span>Track submissions by date, area, WBS, and supervisor.</span>
            </div>

            <div>
              <strong>Progress View</strong>
              <span>See weekly activity and task counts clearly.</span>
            </div>

            <div>
              <strong>Issue Control</strong>
              <span>Review delays and blockers before they get lost.</span>
            </div>

            <div>
              <strong>Materials Register</strong>
              <span>Analyse materials captured from site diaries.</span>
            </div>
          </div>
        </div>

        <div className="auth-pro-card">
          <div className="auth-card-header">
            <div>
              <p className="auth-kicker">
                {mode === "signup" ? "Create Workspace" : "Welcome Back"}
              </p>

              <h2>
                {mode === "signup" ? "Create Company Account" : "Login"}
              </h2>

              <span>
                {mode === "signup"
                  ? "Start by creating your company dashboard workspace."
                  : "Access your company dashboard and continue working."}
              </span>
            </div>
          </div>

          <div className="auth-mode-tabs">
            <button
              type="button"
              onClick={() => {
                if (loading) return;
                setMode("signup");
                resetFeedback();
              }}
              className={mode === "signup" ? "active" : ""}
            >
              Sign up
            </button>

            <button
              type="button"
              onClick={() => {
                if (loading) return;
                setMode("login");
                resetFeedback();
              }}
              className={mode === "login" ? "active" : ""}
            >
              Login
            </button>
          </div>

          <div className="auth-form">
            {mode === "signup" && (
              <div className="auth-field">
                <label>Company Name</label>
                <input
                  placeholder="e.g. Mudfix Pty Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            <div className="auth-field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                placeholder={
                  mode === "signup"
                    ? "Create password, minimum 6 characters"
                    : "Enter your password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="auth-status-row">
              <div className={status === "Error" ? "auth-status error" : "auth-status"}>
                <span></span>
                {status}
              </div>
            </div>

            {error ? <div className="auth-error">{error}</div> : null}

            <button
              type="button"
              onClick={mode === "signup" ? handleSignup : handleLogin}
              disabled={loading}
              className="auth-submit"
            >
              {loading
                ? mode === "signup"
                  ? "Creating account..."
                  : "Logging in..."
                : mode === "signup"
                ? "Create Company Account"
                : "Login to Dashboard"}
            </button>

            <p className="auth-footer-note">
              {mode === "signup"
                ? "After signup, you can configure areas, WBS, materials, shift times, and app access codes."
                : "Use the email and password linked to your company dashboard."}
            </p>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .auth-pro-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 28px;
          background:
            radial-gradient(circle at top left, rgba(199, 137, 42, 0.16), transparent 28%),
            radial-gradient(circle at bottom right, rgba(31, 42, 36, 0.16), transparent 30%),
            linear-gradient(180deg, #f8f8f4 0%, #edf1eb 100%);
        }

        .auth-pro-shell {
          width: 100%;
          max-width: 1180px;
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) 460px;
          gap: 22px;
          align-items: stretch;
        }

        .auth-pro-left {
          position: relative;
          overflow: hidden;
          min-height: 620px;
          padding: 36px;
          border-radius: 28px;
          color: #ffffff;
          background:
            radial-gradient(circle at top right, rgba(199, 137, 42, 0.34), transparent 32%),
            linear-gradient(135deg, #1f2a24 0%, #2d3a32 58%, #3a321f 100%);
          box-shadow: 0 24px 70px rgba(18, 26, 22, 0.18);
        }

        .auth-pro-left::after {
          content: "";
          position: absolute;
          right: -110px;
          bottom: -110px;
          width: 320px;
          height: 320px;
          border-radius: 999px;
          border: 48px solid rgba(255, 255, 255, 0.055);
        }

        .auth-brand-pill {
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 0 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.11);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #f3d59d;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .auth-pro-left h1 {
          max-width: 720px;
          margin: 28px 0 0;
          font-size: 46px;
          line-height: 0.98;
          letter-spacing: -0.06em;
          font-weight: 950;
        }

        .auth-pro-left p {
          max-width: 650px;
          margin: 18px 0 0;
          color: rgba(255, 255, 255, 0.76);
          font-size: 15px;
          line-height: 1.75;
        }

        .auth-feature-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 34px;
        }

        .auth-feature-grid div {
          min-height: 118px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.13);
          backdrop-filter: blur(10px);
        }

        .auth-feature-grid strong {
          display: block;
          color: #ffffff;
          font-size: 15px;
          font-weight: 950;
        }

        .auth-feature-grid span {
          display: block;
          margin-top: 8px;
          color: rgba(255, 255, 255, 0.68);
          font-size: 12.5px;
          line-height: 1.55;
        }

        .auth-pro-card {
          padding: 24px;
          border-radius: 28px;
          background: #ffffff;
          border: 1px solid #dfe4dc;
          box-shadow: 0 24px 70px rgba(18, 26, 22, 0.12);
        }

        .auth-card-header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
        }

        .auth-kicker {
          margin: 0 0 6px;
          color: #80520f;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .auth-card-header h2 {
          margin: 0;
          color: #0f1713;
          font-size: 30px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .auth-card-header span {
          display: block;
          margin-top: 8px;
          color: #66726a;
          font-size: 13px;
          line-height: 1.55;
        }

        .auth-mode-tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 22px;
          padding: 6px;
          border-radius: 16px;
          background: #eef1ec;
        }

        .auth-mode-tabs button {
          min-height: 40px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: #66726a;
          font-size: 13px;
          font-weight: 950;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .auth-mode-tabs button.active {
          background: #1f2a24;
          color: #ffffff;
          box-shadow: 0 10px 22px rgba(31, 42, 36, 0.16);
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 20px;
        }

        .auth-field label {
          display: block;
          margin-bottom: 7px;
          color: #66726a;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        .auth-field input {
          width: 100%;
          height: 44px;
          border-radius: 13px;
          border: 1px solid #cbd3c9;
          background: #ffffff;
          padding: 0 13px;
          color: #0f1713;
          font-size: 14px;
          outline: none;
          transition: 0.18s ease;
        }

        .auth-field input:focus {
          border-color: rgba(199, 137, 42, 0.86);
          box-shadow: 0 0 0 4px rgba(199, 137, 42, 0.14);
        }

        .auth-field input:disabled {
          background: #f3f5f1;
          cursor: not-allowed;
        }

        .auth-status-row {
          display: flex;
        }

        .auth-status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          padding: 0 12px;
          border-radius: 999px;
          background: #eef1ec;
          color: #405047;
          font-size: 12px;
          font-weight: 900;
        }

        .auth-status span {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #256b45;
          box-shadow: 0 0 0 4px rgba(37, 107, 69, 0.12);
        }

        .auth-status.error {
          background: #fff1ef;
          color: #b42318;
        }

        .auth-status.error span {
          background: #b42318;
          box-shadow: 0 0 0 4px rgba(180, 35, 24, 0.12);
        }

        .auth-error {
          padding: 12px;
          border-radius: 13px;
          border: 1px solid #f4c7c3;
          background: #fff1ef;
          color: #b42318;
          font-size: 12.5px;
          line-height: 1.5;
          font-weight: 850;
        }

        .auth-submit {
          width: 100%;
          min-height: 46px;
          border: 0;
          border-radius: 14px;
          background: #1f2a24;
          color: #ffffff;
          font-size: 14px;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 12px 26px rgba(31, 42, 36, 0.18);
          transition: 0.18s ease;
        }

        .auth-submit:hover {
          transform: translateY(-1px);
          background: #2d3a32;
        }

        .auth-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .auth-footer-note {
          margin: 0;
          padding: 13px;
          border-radius: 14px;
          background: #fff4df;
          color: #80520f;
          border: 1px solid #ead5aa;
          font-size: 12.5px;
          line-height: 1.55;
          font-weight: 800;
        }

        @media (max-width: 980px) {
          .auth-pro-shell {
            grid-template-columns: 1fr;
          }

          .auth-pro-left {
            min-height: auto;
          }

          .auth-pro-left h1 {
            font-size: 34px;
          }
        }

        @media (max-width: 640px) {
          .auth-pro-page {
            padding: 14px;
          }

          .auth-pro-left,
          .auth-pro-card {
            border-radius: 22px;
            padding: 20px;
          }

          .auth-feature-grid {
            grid-template-columns: 1fr;
          }

          .auth-pro-left h1 {
            font-size: 30px;
          }
        }
      `}</style>
    </main>
  );
}