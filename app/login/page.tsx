"use client";
import { useState, useEffect } from "react";
import PublicHeader from "../public-header";
export default function LoginPage() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [kind, setKind] = useState("danger"),
    [reset, setReset] = useState(false);
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) location.replace(d.redirect);
      })
      .catch(() => {});
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const f = new FormData(e.currentTarget),
        r = await fetch(
          reset ? "/api/member/account/request" : "/api/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: f.get("email"),
              ...(!reset ? { password: f.get("password") } : {}),
            }),
          },
        ),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Unable to sign in");
      if (reset) {
        setKind("success");
        setMessage(d.message);
      } else location.assign(d.redirect);
    } catch (e) {
      setKind("danger");
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PublicHeader />
      <main className="wrap public-main">
        <section className="card login-card">
          <span className="eyebrow">FEDMOGA PORTAL</span>
          <h1>{reset ? "Activate / reset member account" : "Sign In"}</h1>
          <p>
            {reset
              ? "Use the email from your registration. We will email an account activation or password reset link if eligible."
              : "Members, admins and super admins use this same sign-in page. Your account opens the appropriate dashboard."}
          </p>
          {message && (
            <div className={"alert alert-" + kind} role="alert">
              {message}
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </label>
            {!reset && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                />
              </label>
            )}
            <button disabled={busy}>
              {busy ? "Please wait…" : reset ? "Email account link" : "Sign In"}
            </button>
          </form>
          <button
            className="secondary"
            onClick={() => {
              setReset(!reset);
              setMessage("");
            }}
          >
            {reset ? "Back to Sign In" : "Activate / reset member account"}
          </button>
          {reset && (
            <p>Admins: contact your Super Admin for a password reset.</p>
          )}
        </section>
      </main>
    </>
  );
}
