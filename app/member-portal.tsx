"use client";
import { useEffect, useState } from "react";
import { renewalPeriod, Plan } from "../server/calendar";
const money = (value: number) => "₦" + Number(value).toLocaleString("en-NG");
async function api(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
export default function MemberPortal() {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [kind, setKind] = useState("info"),
    [screen, setScreen] = useState("login"),
    [token, setToken] = useState(""),
    [plan, setPlan] = useState("monthly");
  function notice(value: string, type = "success") {
    setMessage(value);
    setKind(type);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function refresh() {
    try {
      const state = await api("/api/member/state");
      setData(state);
      setPlan(state.member.preferredPlan);
      return state;
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("account");
    if (t) {
      setToken(t);
      setScreen("activate");
      history.replaceState(null, "", location.pathname);
    }
    if (p.get("dues")) {
      notice(
        p.get("dues") === "success"
          ? "Your dues payment has been verified. Sign in to view your updated membership."
          : "Payment verification is pending. Sign in and use Verify on your payment. Do not pay again.",
        p.get("dues") === "success" ? "success" : "warning",
      );
      history.replaceState(null, "", location.pathname);
    }
    refresh();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    setBusy(true);
    try {
      if (screen === "login") {
        await api("/api/member/login", {
          email: values.get("email"),
          password: values.get("password"),
        });
        await refresh();
        notice("Welcome back to your FEDMOGA account");
      } else if (screen === "activate") {
        if (values.get("password") !== values.get("confirm"))
          throw new Error("Passwords do not match");
        const r = await api("/api/member/account/complete", {
          token,
          password: values.get("password"),
        });
        setToken("");
        setScreen("login");
        notice(r.message);
      } else {
        const r = await api("/api/member/account/request", {
          email: values.get("email"),
        });
        notice(r.message);
      }
    } catch (error) {
      notice((error as Error).message, "danger");
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    setBusy(true);
    try {
      const r = await api("/api/dues/initialize", { plan });
      location.assign(r.authorizationUrl);
    } catch (error) {
      notice((error as Error).message, "danger");
      setBusy(false);
    }
  }
  return (
    <>
      <header className="header">
        <div className="wrap top">
          <a className="brand" href="/">
            <img src="/logo.jpg" alt="FEDMOGA" />
            <span>
              <strong>FEDMOGA</strong>
              <small>Member account</small>
            </span>
          </a>
          <nav>
            <a href="/">Home</a>
            {data && (
              <button
                onClick={async () => {
                  await api("/api/member/logout", {});
                  setData(null);
                  setScreen("login");
                }}
              >
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="wrap">
        {message && (
          <div
            className={`alert alert-${kind}`}
            role={kind === "danger" ? "alert" : "status"}
          >
            <span className="alert-icon" aria-hidden="true">
              {kind === "danger" ? "!" : "✓"}
            </span>
            <div>
              <strong>
                {kind === "danger" ? "Please check" : "Member update"}
              </strong>
              <p>{message}</p>
            </div>
            <button
              className="alert-close"
              aria-label="Dismiss message"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}
        {loading ? (
          <div className="card">Loading your account…</div>
        ) : !data ? (
          <div className="card" style={{ maxWidth: 520, margin: "auto" }}>
            <h1>
              {screen === "activate"
                ? "Activate your account / reset password"
                : screen === "reset"
                  ? "Activate or reset your account"
                  : "Member sign in"}
            </h1>
            <p>Access your membership, pay dues and track your receipts.</p>
            <form onSubmit={submit}>
              {screen !== "activate" && (
                <label>
                  Registration email
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
              )}
              {screen !== "reset" && (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={screen === "activate" ? 12 : 1}
                    maxLength={128}
                    autoComplete={
                      screen === "activate"
                        ? "new-password"
                        : "current-password"
                    }
                  />
                </label>
              )}
              {screen === "activate" && (
                <>
                  <label>
                    Confirm password
                    <input
                      name="confirm"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <p>
                    Setting a password verifies ownership of the email receiving
                    this link.
                  </p>
                </>
              )}
              <button disabled={busy}>
                {busy
                  ? "Please wait…"
                  : screen === "activate"
                    ? "Save password and verify email"
                    : screen === "reset"
                      ? "Send private account link"
                      : "Sign in"}
              </button>
            </form>
            <button
              className="secondary"
              style={{ marginTop: 18 }}
              onClick={() => {
                setScreen(screen === "reset" ? "login" : "reset");
                setToken("");
              }}
            >
              {screen === "reset"
                ? "Back to sign in"
                : "Activate / reset account"}
            </button>
            <p>
              Already registered in V1? Use your original registration email.
              You do not need to register or pay the registration fee again.
            </p>
          </div>
        ) : (
          <>
            <div className="member-hero">
              <div>
                <p>YOUR FEDMOGA MEMBERSHIP</p>
                <h1>Hello, {data.member.name}</h1>
                <p>
                  {data.registration?.number} · {data.member.email}
                </p>
              </div>
              <span className={`membership-status ${data.member.status}`}>
                {data.member.status}
              </span>
            </div>
            {data.member.mode === "test" && (
              <p className="notice">
                Test account: payments use Paystack test checkout and do not
                collect real money.
              </p>
            )}
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
              }}
            >
              <div className="card">
                <small>Paid through</small>
                <h2>{data.member.paidUntil || "Dues not paid yet"}</h2>
                <p>
                  Registration is a one-time fee. Membership dues are separate.
                </p>
              </div>
              <div className="card">
                <small>Payment schedule</small>
                <h2>{data.member.preferredPlan}</h2>
                <p>
                  Monthly: month-end. Quarterly: calendar quarter-end. Annually:
                  December-end.
                </p>
              </div>
              <div className="card">
                <small>Verified dues paid</small>
                <h2>
                  {money(
                    data.payments
                      .filter((p: any) => p.status === "SUCCESS")
                      .reduce(
                        (s: number, p: any) => s + Number(p.amount_kobo) / 100,
                        0,
                      ),
                  )}
                </h2>
                <p>All receipts are listed below.</p>
              </div>
            </div>
            <section className="card" style={{ marginTop: 24 }}>
              <h2>Pay dues / renew membership</h2>
              <label>
                Choose a payment period
                <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {["monthly", "quarterly", "annually"].map((p) => (
                    <option key={p} value={p} disabled={!data.config.prices[p]}>
                      {p} · {money(data.config.prices[p])}
                      {!data.config.prices[p] ? " (not available)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Early payments extend your current paid-through date. After
                expiry, payment covers the current calendar period. No automatic
                deductions.
              </p>
              <p>
                <strong>Coverage for this payment:</strong>{" "}
                {
                  renewalPeriod(data.member.paidUntil, plan as Plan, data.today)
                    .start
                }{" "}
                to{" "}
                {
                  renewalPeriod(data.member.paidUntil, plan as Plan, data.today)
                    .end
                }
              </p>
              <button
                disabled={busy || !data.config.prices[plan]}
                onClick={checkout}
              >
                {busy
                  ? "Starting checkout…"
                  : "Pay " + money(data.config.prices[plan])}
              </button>
            </section>
            <section className="card" style={{ marginTop: 24 }}>
              <h2>Dues payment history</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Plan</th>
                      <th>Paid (₦)</th>
                      <th>Coverage</th>
                      <th>Source</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          {p.reference}
                          {p.external_reference && (
                            <small>
                              <br />
                              {p.external_reference}
                            </small>
                          )}
                        </td>
                        <td>{p.plan}</td>
                        <td>
                          {money(Number(p.charged_kobo || p.amount_kobo) / 100)}
                        </td>
                        <td>
                          {p.period_start
                            ? p.period_start + " to " + p.period_end
                            : "Awaiting payment"}
                        </td>
                        <td>{p.source}</td>
                        <td>
                          <span className="pill">{p.status}</span>
                          {p.status === "PENDING" &&
                            p.source === "Paystack" && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await api("/api/dues/verify", {
                                      reference: p.reference,
                                    });
                                    await refresh();
                                    notice(
                                      "Dues payment verified. Your membership has been updated.",
                                    );
                                  } catch (error) {
                                    notice((error as Error).message, "danger");
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Verify payment
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.payments.length && <p>No dues payments yet.</p>}
              </div>
            </section>
          </>
        )}
      </main>
      <footer>FEDMOGA · Knowledge, Discipline and Unity</footer>
    </>
  );
}
