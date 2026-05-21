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

      setStatus("Saving company...");

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
    <div className="main-content">
      <div className="max-w-lg mx-auto">
        <div className="software-card-strong p-8">
          <div className="mb-6">
            <h1 className="software-title">
              {mode === "signup" ? "Create Company Account" : "Login"}
            </h1>
            <p className="software-subtitle">
              {mode === "signup"
                ? "Create your company account to manage diaries, materials, issues, and reporting."
                : "Login to access your dashboard."}
            </p>
          </div>

          <div className="flex gap-3 mb-6">
            <button
              type="button"
              onClick={() => {
                if (loading) return;
                setMode("signup");
                resetFeedback();
              }}
              className={`soft-button ${
                mode === "signup"
                  ? "soft-button-primary"
                  : "soft-button-secondary"
              }`}
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
              className={`soft-button ${
                mode === "login"
                  ? "soft-button-primary"
                  : "soft-button-secondary"
              }`}
            >
              Login
            </button>
          </div>

          <div className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Company Name
                </label>
                <input
                  className="soft-input"
                  placeholder="Enter company name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Email
              </label>
              <input
                className="soft-input"
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>
              <input
                className="soft-input"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div
              className="badge badge-neutral"
              style={{
                padding: "10px 14px",
                borderRadius: "14px",
                display: "block",
                lineHeight: 1.5,
              }}
            >
              {status}
            </div>

            {error ? (
              <div
                className="badge badge-danger"
                style={{
                  padding: "10px 14px",
                  borderRadius: "14px",
                  display: "block",
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={mode === "signup" ? handleSignup : handleLogin}
              disabled={loading}
              className="soft-button soft-button-primary"
              style={{ width: "100%" }}
            >
              {loading
                ? mode === "signup"
                  ? "Creating account..."
                  : "Logging in..."
                : mode === "signup"
                ? "Create Account"
                : "Login"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}