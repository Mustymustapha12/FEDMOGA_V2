"use client";
import { useEffect, useState } from "react";
import ManualPayments from "./manual-payments";
import MembershipAdmin from "./membership-admin";
type Field = { id: string; label: string; type: string; required: boolean };
type Section = { title: string; fields: Field[] };
type Payment = {
  source: string;
  externalReference?: string;
  approvedBy?: string;
  paidAt?: string;
  reference: string;
  mode: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  amount: number;
  status: string;
  date: string;
  completed: number;
};
type Registration = {
  mode: string;
  id: string;
  number: string;
  paymentId: string;
  answers: string;
  date: string;
  name: string;
  email: string;
  phone: string;
  amount: number;
};
type Admin = {
  id: string;
  email: string;
  role: "ADMIN" | "SUPER_ADMIN";
  active: number;
  createdAt: string;
};
type State = {
  admin: Admin;
  payments: Payment[];
  registrations: Registration[];
  admins: Admin[];
  fee: number;
  paystackTestPublicKey: string;
  paystackLivePublicKey: string;
  testSecretSaved: boolean;
  liveSecretSaved: boolean;
  paystackMode: string;
  liveAllowed: boolean;
  emailDelivery?: { configured: boolean; missing: string[] };
};
import { defaultSections as defaults } from "./form-config";
const money = (v: number) => "₦" + Number(v).toLocaleString("en-NG");
async function api(path: string, body?: unknown, method = "POST") {
  const res = await fetch(
    path,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result: any = await res.json();
  if (!res.ok) throw Error(result.error || "Request failed");
  return result;
}
export default function Portal() {
  const [view, setView] = useState("home"),
    [tab, setTab] = useState("registrations"),
    [fee, setFee] = useState(5000),
    [form, setForm] = useState<Section[]>(defaults),
    [payer, setPayer] = useState({ name: "", email: "", phone: "" }),
    [paymentId, setPaymentId] = useState(""),
    [registrationNumber, setRegistrationNumber] = useState(""),
    [state, setState] = useState<State | null>(null),
    [selected, setSelected] = useState<Registration | null>(null),
    [notice, updateNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState("test"),
    [checkoutReady, setCheckoutReady] = useState(false),
    [continuationToken, setContinuationToken] = useState(""),
    [loginState, setLoginState] = useState("");
  const [noticeKind, setNoticeKind] = useState<
    "danger" | "success" | "warning" | "info"
  >("info");
  function setNotice(message: string) {
    updateNotice(message);
    setNoticeKind(
      /verifying|loading/i.test(message)
        ? "info"
        : /pending|still processing|please wait|not confirmed/i.test(message)
          ? "warning"
          : /^Error:|failed|unavailable|expired|could not|cannot|not configured|missing/i.test(
                message,
              )
            ? "danger"
            : /try again|already been used/i.test(message)
              ? "warning"
              : "success",
    );
  }
  useEffect(() => {
    if (notice)
      document
        .getElementById("feedback-alert")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [notice]);
  useEffect(() => {
    api("/api/config")
      .then((v) => {
        setFee(v.fee);
        setMode(v.mode);
        setCheckoutReady(v.checkoutReady);
        if (v.form?.sections) setForm(v.form.sections as Section[]);
      })
      .catch(() => setNotice("Configuration is temporarily unavailable"));
    const params = new URLSearchParams(location.search);
    const token = params.get("continue");
    if (params.get("payment") === "unverified")
      setNotice(
        "Payment verification is pending. Enter your payment email and reference below to verify and continue.",
      );
    if (params.get("payment") === "complete")
      setNotice(
        "This payment has already been used to complete a registration.",
      );
    if (token) {
      openRegistration(token).catch(() =>
        setNotice("That payment link has expired or was used"),
      );
    } else if (
      params.get("payment") === "unverified" ||
      params.get("reference") ||
      params.get("trxref")
    ) {
      let stored: { email?: string; reference?: string } = {};
      try {
        stored = JSON.parse(sessionStorage.getItem("fedmogaCheckout") || "{}");
      } catch {}
      const reference =
        params.get("reference") || params.get("trxref") || stored.reference;
      if (stored.email && reference === stored.reference) {
        setBusy(true);
        setNotice("Verifying payment…");
        (async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await api("/api/paystack/recover", {
                email: stored.email,
                reference,
              });
              await openRegistration(result.token);
              return;
            } catch {
              if (attempt < 2)
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
          setNotice(
            "Automatic verification could not finish. Enter your payment email and reference below to try again. Do not pay again.",
          );
        })().finally(() => setBusy(false));
      }
    }
  }, []);
  async function openRegistration(token: string) {
    const p = await api("/api/paystack/continue", { token });
    setContinuationToken(token);
    setPaymentId(p.id);
    setPayer({ name: p.name, email: p.email, phone: p.phone });
    setNotice("");
    setView("register");
    sessionStorage.removeItem("fedmogaCheckout");
    history.replaceState(null, "", location.pathname);
  }
  async function openAdmin() {
    setView("admin");
    setNotice("");
    setLoginState("loading");
    try {
      const v = await api("/api/admin/state");
      setState(v as State);
      setFee(v.fee);
      setLoginState("ready");
    } catch (e) {
      setLoginState(String(e));
    }
  }
  async function begin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (!checkoutReady)
        throw Error("Checkout is not configured. Please contact FEDMOGA.");
      const result = await api("/api/paystack/initialize", payer);
      sessionStorage.setItem(
        "fedmogaCheckout",
        JSON.stringify({ email: payer.email, reference: result.reference }),
      );
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function submitRegistration(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    const fd = new FormData(e.currentTarget),
      answers: Record<string, string | boolean> = {};
    for (const section of form)
      for (const f of section.fields)
        answers[f.id] =
          f.type === "checkbox" ? fd.has(f.id) : String(fd.get(f.id) || "");
    try {
      const result = await api("/api/register", {
        paymentId,
        answers,
        token: continuationToken,
      });
      setRegistrationNumber(result.number);
      setView("complete");
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const result = await api("/api/admin/state");
    setState(result as State);
    setFee(result.fee);
    setMode(result.paystackMode);
    setCheckoutReady(
      result.paystackMode === "live"
        ? result.liveSecretSaved
        : result.testSecretSaved,
    );
  }
  async function saveSettings(kind: string, payload: object) {
    setNotice("");
    try {
      await api("/api/admin/settings", { kind, ...payload });
      await refresh();
      setNotice("Saved successfully");
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function createAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const element = e.currentTarget,
      f = new FormData(element);
    try {
      await api("/api/admin/users", {
        email: f.get("email"),
        role: f.get("role"),
        password: f.get("password"),
      });
      await refresh();
      element.reset();
      setNotice(
        "Admin created. Share the initial password securely; they can change it after signing in.",
      );
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const element = e.currentTarget,
      f = new FormData(element);
    setBusy(true);
    try {
      await api("/api/auth/login", {
        email: f.get("email"),
        password: f.get("password"),
      });
      element.reset();
      await openAdmin();
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("/api/auth/logout", {});
      setState(null);
      setLoginState("");
      setView("home");
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/auth/password", {
        currentPassword: f.get("currentPassword"),
        newPassword: f.get("newPassword"),
      });
      setState(null);
      setLoginState("");
      setNotice("Password changed. Please sign in again.");
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function resetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const element = e.currentTarget,
      f = new FormData(element),
      a = state?.admins.find((a) => a.id === f.get("id"));
    if (!a) return;
    try {
      await api(
        "/api/admin/users",
        {
          id: a.id,
          role: a.role,
          active: !!a.active,
          password: f.get("password"),
        },
        "PATCH",
      );
      element.reset();
      if (a.id === state?.admin.id) {
        setState(null);
        setLoginState("");
        setNotice("Password reset. Please sign in again.");
        return;
      }
      await refresh();
      setNotice("Password reset. Previous sessions have been revoked.");
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function recover(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice("Verifying payment…");
    try {
      const result = await api("/api/paystack/recover", {
        email: f.get("email"),
        reference: f.get("reference"),
      });
      await openRegistration(result.token);
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeAdmin(a: Admin, role: string, active: boolean) {
    try {
      await api("/api/admin/users", { id: a.id, role, active }, "PATCH");
      if (a.id === state?.admin.id) {
        setState(null);
        setLoginState("");
        setNotice("Account updated. Please sign in again.");
        return;
      }
      await refresh();
      setNotice("Admin updated");
    } catch (e) {
      setNotice(String(e));
    }
  }
  function setField(si: number, fi: number, patch: Partial<Field>) {
    setForm((prev) =>
      prev.map((s, i) =>
        i === si
          ? {
              ...s,
              fields: s.fields.map((f, j) =>
                j === fi ? { ...f, ...patch } : f,
              ),
            }
          : s,
      ),
    );
  }
  function removeField(si: number, fi: number) {
    setForm((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, fields: s.fields.filter((_, j) => j !== fi) } : s,
      ),
    );
  }
  function addField(si: number, type = "text") {
    setForm((prev) =>
      prev.map((s, i) =>
        i === si
          ? {
              ...s,
              fields: [
                ...s.fields,
                {
                  id: "custom" + Date.now(),
                  label: "New field",
                  type,
                  required: false,
                },
              ],
            }
          : s,
      ),
    );
  }
  return (
    <>
      <div className="banner">
        {mode === "test"
          ? "PAYSTACK TEST MODE · Test transactions only"
          : "FEDMOGA MEMBERSHIP REGISTRATION"}
      </div>
      <header className="header">
        <div className="wrap top">
          <button
            className="brand"
            onClick={() => setView("home")}
            style={{ border: 0, background: "none", textAlign: "left" }}
          >
            <img src="/logo.jpg" alt="FGGC Minjibir FEDMOGA logo" />
            <span>
              <strong>FEDMOGA</strong>
              <small>Knowledge, Discipline and Unity</small>
            </span>
          </button>
          <nav className="nav">
            <button
              className={view !== "admin" ? "active" : ""}
              onClick={() => setView("home")}
            >
              Register
            </button>
            <a href="/member" className="secondary">
              Member sign in
            </a>
            <button
              className={view === "admin" ? "active" : ""}
              onClick={openAdmin}
            >
              Admin
            </button>
          </nav>
        </div>
      </header>
      <main className="wrap">
        <div className="feedback-region" aria-live="polite" aria-atomic="true">
          {notice && (
            <div
              id="feedback-alert"
              className={`alert alert-${noticeKind}`}
              role={noticeKind === "danger" ? "alert" : "status"}
            >
              <span className="alert-icon" aria-hidden="true">
                {noticeKind === "danger"
                  ? "!"
                  : noticeKind === "success"
                    ? "✓"
                    : noticeKind === "warning"
                      ? "⚠"
                      : "i"}
              </span>
              <div>
                <strong>
                  {noticeKind === "danger"
                    ? "Action needed"
                    : noticeKind === "success"
                      ? "Success"
                      : noticeKind === "warning"
                        ? "Please check"
                        : "Please wait"}
                </strong>
                <p>{notice.replace(/^Error:\s*/, "")}</p>
              </div>
              <button
                type="button"
                className="alert-close"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
        </div>

        {view === "home" && (
          <div className="hero">
            <div className="intro">
              <span className="eyebrow">
                Federal Government Girls College Minjibir Old Girls Association
              </span>
              <h1>Stay connected to the women who shared your journey.</h1>
              <p>
                Join the FGGC Minjibir Alumni community to strengthen our
                membership database, stay in touch, and support the activities
                and development of the association.
              </p>
              <p>
                Please complete your details accurately. Payment is verified
                before the registration form becomes available.
              </p>
              <div className="feature">
                ✓ &nbsp; Payment → Registration → Confirmation
              </div>
            </div>
            <div className="card">
              <div className="steps">
                <b>1 Payment</b> → 2 Registration → 3 Complete
              </div>
              <h2>Membership registration</h2>
              <div className="fee">
                <small>
                  Registration fee {mode === "test" ? "(test mode)" : ""}
                </small>
                <strong>{money(fee)}</strong>
              </div>
              <form onSubmit={begin}>
                <label htmlFor="payer-name">Full name</label>
                <input
                  id="payer-name"
                  required
                  value={payer.name}
                  onChange={(e) => setPayer({ ...payer, name: e.target.value })}
                />
                <label htmlFor="payer-email">Email address</label>
                <input
                  id="payer-email"
                  required
                  type="email"
                  value={payer.email}
                  onChange={(e) =>
                    setPayer({ ...payer, email: e.target.value })
                  }
                />
                <label htmlFor="payer-phone">Phone number</label>
                <input
                  id="payer-phone"
                  required
                  type="tel"
                  value={payer.phone}
                  onChange={(e) =>
                    setPayer({ ...payer, phone: e.target.value })
                  }
                />
                <button
                  className="primary wide"
                  disabled={busy || !checkoutReady}
                >
                  {mode === "test"
                    ? "Pay with Paystack test"
                    : "Pay with Paystack"}
                </button>
              </form>
              <p className="notice">
                {!checkoutReady
                  ? "Checkout is not configured yet. Contact FEDMOGA."
                  : mode === "test"
                    ? "Paystack test checkout does not collect real money."
                    : "Payment is processed securely by Paystack."}
              </p>
              <details>
                <summary>
                  Already paid? Verify and continue registration
                </summary>
                <form onSubmit={recover}>
                  <label>Payment email</label>
                  <input name="email" type="email" required />
                  <label>Paystack reference</label>
                  <input name="reference" required placeholder="FEDMOGA-…" />
                  <button className="secondary" disabled={busy}>
                    {busy ? "Verifying…" : "Verify payment and register"}
                  </button>
                </form>
              </details>
            </div>
          </div>
        )}
        {view === "register" && (
          <div className="card" style={{ maxWidth: 760, margin: "auto" }}>
            <div className="steps">
              1 Payment → <b>2 Registration</b> → 3 Complete
            </div>
            <h1>Complete your registration</h1>
            <p className="success">Verified payment: {paymentId}</p>
            <form onSubmit={submitRegistration}>
              {form.map((s, si) => (
                <section className="section" key={si}>
                  <h2>{s.title}</h2>
                  {s.fields.map((f) => (
                    <div key={f.id}>
                      <label htmlFor={"f-" + f.id}>{f.label}</label>
                      {f.type === "textarea" ? (
                        <textarea
                          id={"f-" + f.id}
                          name={f.id}
                          required={f.required}
                        />
                      ) : (
                        <input
                          id={"f-" + f.id}
                          name={f.id}
                          type={f.type}
                          required={f.required}
                          readOnly={f.id === "email"}
                          defaultValue={
                            f.id === "fullName"
                              ? payer.name
                              : f.id === "email"
                                ? payer.email
                                : f.id === "phone"
                                  ? payer.phone
                                  : undefined
                          }
                        />
                      )}
                    </div>
                  ))}
                </section>
              ))}
              <button className="primary" disabled={busy}>
                Complete registration
              </button>
            </form>
          </div>
        )}
        {view === "complete" && (
          <div className="card" style={{ maxWidth: 680, margin: "auto" }}>
            <div className="steps">
              1 Payment → 2 Registration → <b>3 Complete</b>
            </div>
            <h1>Registration complete</h1>
            <p>
              Your member account is ready. Check your email to verify it and
              set your password, then <a href="/member">sign in</a> to pay dues.
              You can also request an activation link from the member sign-in
              page.
            </p>
            <p>
              Your registration number is <strong>{registrationNumber}</strong>.
            </p>
            <p className="notice">
              Please save your registration number. Your membership entry has
              been recorded.
            </p>
            <button className="primary" onClick={() => setView("home")}>
              Return to home
            </button>
          </div>
        )}
        {view === "admin" && (
          <>
            <span className="eyebrow">FEDMOGA · Administration</span>
            <h1>Membership overview</h1>
            {loginState !== "ready" ? (
              <div className="card" style={{ maxWidth: 630 }}>
                <h2>Admin sign in</h2>
                <p>Sign in with your FEDMOGA admin email and password.</p>
                <form onSubmit={signIn}>
                  <label htmlFor="login-email">Email</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    className="primary"
                    disabled={busy || loginState === "loading"}
                  >
                    Sign in
                  </button>
                </form>
              </div>
            ) : (
              state && (
                <>
                  <p className="notice">
                    Signed in as {state.admin.email} ({state.admin.role}).
                    Checkout mode: {state.paystackMode}.{" "}
                    <button className="secondary" onClick={signOut}>
                      Sign out
                    </button>
                  </p>
                  <div className="grid">
                    {[
                      ["Registrations", state.registrations.length],
                      ["Payments", state.payments.length],
                      [
                        "Paid but incomplete",
                        state.payments.filter(
                          (p) => p.status === "SUCCESS" && !p.completed,
                        ).length,
                      ],
                      [
                        "Verified revenue",
                        money(
                          state.payments
                            .filter((p) => p.status === "SUCCESS")
                            .reduce((sum, p) => sum + p.amount, 0),
                        ),
                      ],
                    ].map(([label, value]) => (
                      <div className="metric" key={label}>
                        <small>{label}</small>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="tabs">
                    {[
                      "registrations",
                      "incomplete",
                      "payments",
                      "manual",
                      "memberships",
                      "abandoned",
                      "builder",
                      "settings",
                      "account",
                      ...(state.admin.role === "SUPER_ADMIN" ? ["users"] : []),
                    ].map((t) => (
                      <button
                        key={t}
                        className={tab === t ? "active" : ""}
                        onClick={() => {
                          setTab(t);
                          setSelected(null);
                          setNotice("");
                        }}
                      >
                        {(
                          {
                            memberships: "Memberships & dues",
                            abandoned: "Payment not completed",
                            manual: "Already paid",
                            incomplete: "Paid but incomplete",
                            builder: "Form builder",
                            settings: "Settings",
                            users: "Admin users",
                          } as Record<string, string>
                        )[t] || t[0].toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  {tab === "registrations" && (
                    <>
                      <div className="toolbar">
                        <h2>Registrations</h2>
                        <span className="pill">
                          {state.registrations.length} records
                        </span>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Number</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Date</th>
                              <th>Entry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.registrations.map((r) => (
                              <tr key={r.id}>
                                <td>{r.number}</td>
                                <td>{r.name}</td>
                                <td>{r.email}</td>
                                <td>{new Date(r.date).toLocaleDateString()}</td>
                                <td>
                                  <button
                                    className="secondary"
                                    onClick={() =>
                                      setSelected(
                                        selected?.id === r.id ? null : r,
                                      )
                                    }
                                  >
                                    View entry
                                  </button>
                                  {state.admin.role === "SUPER_ADMIN" &&
                                    r.mode === "test" && (
                                      <button
                                        className="secondary"
                                        onClick={async () => {
                                          if (
                                            !window.confirm(
                                              "Permanently delete this test registration and its payment?",
                                            )
                                          )
                                            return;
                                          try {
                                            const result = await api(
                                              "/api/admin/test-data/clear",
                                              {
                                                confirmation:
                                                  "DELETE TEST DATA",
                                                registrationId: r.id,
                                              },
                                            );
                                            setSelected(null);
                                            await refresh();
                                            setNotice(result.message);
                                          } catch (e) {
                                            setNotice(
                                              "Error: " + (e as Error).message,
                                            );
                                          }
                                        }}
                                      >
                                        Delete test entry
                                      </button>
                                    )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selected && (
                        <div className="card" style={{ marginTop: 18 }}>
                          <div className="toolbar">
                            <h2>Registration {selected.number}</h2>
                            <button
                              className="secondary"
                              onClick={() => setSelected(null)}
                            >
                              Close
                            </button>
                          </div>
                          <p>
                            Payment reference: {selected.paymentId} · Amount:{" "}
                            {money(selected.amount)}
                          </p>
                          <dl className="detail">
                            {Object.entries(
                              JSON.parse(selected.answers) as Record<
                                string,
                                string | boolean
                              >,
                            ).map(([key, value]) => (
                              <div key={key} style={{ display: "contents" }}>
                                <dt>
                                  {form
                                    .flatMap((s) => s.fields)
                                    .find((f) => f.id === key)?.label || key}
                                </dt>
                                <dd>
                                  {typeof value === "boolean"
                                    ? value
                                      ? "Yes"
                                      : "No"
                                    : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </>
                  )}
                  {tab === "incomplete" && (
                    <>
                      <h2>Paid · registration incomplete</h2>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Reference</th>
                              <th>Amount</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.payments
                              .filter(
                                (p) => p.status === "SUCCESS" && !p.completed,
                              )
                              .map((p) => (
                                <tr key={p.id}>
                                  <td>{p.name}</td>
                                  <td>{p.email}</td>
                                  <td>{p.reference}</td>
                                  <td>{money(p.amount)}</td>
                                  <td>
                                    <button
                                      className="secondary"
                                      onClick={async () => {
                                        try {
                                          await api(
                                            "/api/admin/payments/resend",
                                            { id: p.id },
                                          );
                                          setNotice(
                                            "Registration link emailed",
                                          );
                                        } catch (e) {
                                          setNotice(String(e));
                                        }
                                      }}
                                    >
                                      Email registration link
                                    </button>
                                    <button
                                      className="secondary"
                                      onClick={async () => {
                                        try {
                                          const result = await api(
                                            "/api/admin/payments/link",
                                            { id: p.id },
                                          );
                                          await navigator.clipboard.writeText(
                                            result.registrationUrl,
                                          );
                                          setNotice("Registration link copied");
                                        } catch (error) {
                                          setNotice(String(error));
                                        }
                                      }}
                                    >
                                      Copy registration link
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {(tab === "memberships" || tab === "abandoned") && (
                    <MembershipAdmin
                      key={tab}
                      superAdmin={state.admin.role === "SUPER_ADMIN"}
                      pendingOnly={tab === "abandoned"}
                      onNotice={setNotice}
                    />
                  )}
                  {tab === "manual" && (
                    <ManualPayments
                      superAdmin={state.admin.role === "SUPER_ADMIN"}
                      defaultMode={state.paystackMode}
                      onNotice={setNotice}
                      onRefresh={refresh}
                    />
                  )}
                  {tab === "payments" && (
                    <>
                      <h2>Payments</h2>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Reference</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Phone</th>
                              <th>Source / original reference</th>
                              <th>Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.payments.map((p) => (
                              <tr key={p.id}>
                                <td>{p.reference}</td>
                                <td>{p.name}</td>
                                <td>{p.email}</td>
                                <td>{p.phone}</td>
                                <td>
                                  {p.source}
                                  {p.externalReference && (
                                    <>
                                      <br />
                                      {p.externalReference}
                                      <br />
                                      <small>
                                        Approved by {p.approvedBy} ·{" "}
                                        {p.paidAt?.slice(0, 10)}
                                      </small>
                                      {state.admin.role === "SUPER_ADMIN" && (
                                        <>
                                          <br />
                                          <button
                                            className="secondary"
                                            onClick={async () => {
                                              const confirmation =
                                                window.prompt(
                                                  `Only delete this if it was a practice entry. This permanently deletes ${p.name}'s manual payment and any registration. Its stored mode is ${p.mode.toUpperCase()}. Type DELETE MANUAL TEST ENTRY to confirm.`,
                                                );
                                              if (
                                                confirmation !==
                                                "DELETE MANUAL TEST ENTRY"
                                              )
                                                return;
                                              try {
                                                const result = await api(
                                                  "/api/admin/payments/delete-manual-test",
                                                  { id: p.id, confirmation },
                                                );
                                                setSelected(null);
                                                await refresh();
                                                setNotice(result.message);
                                              } catch (error) {
                                                setNotice(String(error));
                                              }
                                            }}
                                          >
                                            Delete manual test entry
                                          </button>
                                        </>
                                      )}
                                    </>
                                  )}
                                </td>
                                <td>{money(p.amount)}</td>
                                <td>
                                  <span className="pill">
                                    {p.status} ({p.mode})
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {tab === "settings" && (
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns:
                          "repeat(auto-fit,minmax(300px,1fr))",
                      }}
                    >
                      {state.admin.role === "SUPER_ADMIN" && (
                        <>
                          <div className="card">
                            <h2>Email delivery</h2>
                            <p>
                              {state.emailDelivery?.configured
                                ? "SMTP settings are present. Send a test email to verify them."
                                : "Missing environment variables: " +
                                  state.emailDelivery?.missing.join(", ")}
                            </p>
                            <p>
                              Configure SMTP_HOST, SMTP_PORT, SMTP_USER,
                              SMTP_PASSWORD and SMTP_FROM in Hostinger, then
                              redeploy. Use your email mailbox password.
                            </p>
                            <button
                              onClick={async (e) => {
                                const button = e.currentTarget;
                                button.disabled = true;
                                try {
                                  const result = await api(
                                    "/api/admin/email/test",
                                    {},
                                  );
                                  setNotice(result.message);
                                } catch (error) {
                                  setNotice(
                                    "Error: " + (error as Error).message,
                                  );
                                } finally {
                                  button.disabled = false;
                                }
                              }}
                            >
                              Send test email to my account
                            </button>
                          </div>
                          <form
                            className="card"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const values = new FormData(e.currentTarget);
                              if (
                                !window.confirm(
                                  "Permanently delete ALL test payments and registrations? This cannot be undone.",
                                )
                              )
                                return;
                              try {
                                const result = await api(
                                  "/api/admin/test-data/clear",
                                  { confirmation: values.get("confirmation") },
                                );
                                setSelected(null);
                                await refresh();
                                setNotice(result.message);
                              } catch (error) {
                                setNotice("Error: " + (error as Error).message);
                              }
                            }}
                          >
                            <h2>Clear test data</h2>
                            <p>
                              Permanently remove test-mode registrations and
                              payments, including unused registration links.
                              Live records, admin accounts, settings and audit
                              history are retained.
                            </p>
                            <label>
                              Type DELETE TEST DATA to confirm
                              <input
                                name="confirmation"
                                required
                                pattern="DELETE TEST DATA"
                                autoComplete="off"
                              />
                            </label>
                            <button>Delete all test data</button>
                          </form>
                        </>
                      )}
                      <form
                        className="card"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = new FormData(e.currentTarget);
                          saveSettings("fee", { fee: Number(v.get("fee")) });
                        }}
                      >
                        <h2>Membership fee</h2>
                        <label htmlFor="fee">Amount in naira</label>
                        <input
                          id="fee"
                          name="fee"
                          type="number"
                          min="1"
                          defaultValue={state.fee}
                        />
                        <button className="primary">Save fee</button>
                      </form>
                      {state.admin.role === "SUPER_ADMIN" && (
                        <div className="card">
                          <h2>Paystack credentials</h2>
                          <p>
                            Keys stay on the server. Test and live credentials
                            are stored separately. Enable live checkout only
                            after completing your payment tests.
                          </p>
                          {(["test", "live"] as const).map((m) => (
                            <form
                              key={m}
                              onSubmit={(e) => {
                                e.preventDefault();
                                const v = new FormData(e.currentTarget);
                                saveSettings("paystack", {
                                  mode: m,
                                  publicKey: v.get("publicKey"),
                                  secretKey: v.get("secretKey"),
                                  activate: v.get("activate") === "on",
                                });
                                (
                                  e.currentTarget.elements.namedItem(
                                    "secretKey",
                                  ) as HTMLInputElement
                                ).value = "";
                              }}
                            >
                              <h3>
                                {m === "test" ? "Test keys" : "Live keys"}
                              </h3>
                              <label htmlFor={m + "Public"}>Public key</label>
                              <input
                                id={m + "Public"}
                                name="publicKey"
                                autoComplete="off"
                                defaultValue={
                                  m === "test"
                                    ? state.paystackTestPublicKey
                                    : state.paystackLivePublicKey
                                }
                                placeholder={"pk_" + m + "_…"}
                              />
                              <label htmlFor={m + "Secret"}>
                                Secret key{" "}
                                {(
                                  m === "test"
                                    ? state.testSecretSaved
                                    : state.liveSecretSaved
                                )
                                  ? "(saved; enter to replace)"
                                  : ""}
                              </label>
                              <input
                                id={m + "Secret"}
                                name="secretKey"
                                type="password"
                                autoComplete="new-password"
                                placeholder={"sk_" + m + "_…"}
                              />
                              <label>
                                <input
                                  type="checkbox"
                                  name="activate"
                                  disabled={m === "live" && !state.liveAllowed}
                                />{" "}
                                Activate {m} checkout
                              </label>
                              <button className="primary">Save {m} keys</button>
                            </form>
                          ))}
                          <p className="notice">
                            Current checkout: {state.paystackMode}. Live
                            activation requires HTTPS, email configuration,
                            completed payment tests and ALLOW_LIVE_PAYMENTS=true
                            in Hostinger.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === "users" && state.admin.role === "SUPER_ADMIN" && (
                    <>
                      <div className="card">
                        <h2>Create admin</h2>
                        <form
                          onSubmit={createAdmin}
                          className="button-row"
                          style={{ alignItems: "end" }}
                        >
                          <div>
                            <label htmlFor="new-email">Email</label>
                            <input
                              id="new-email"
                              name="email"
                              type="email"
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor="new-password">
                              Initial password
                            </label>
                            <input
                              id="new-password"
                              name="password"
                              type="password"
                              autoComplete="new-password"
                              required
                              minLength={12}
                              maxLength={128}
                            />
                          </div>
                          <div>
                            <label htmlFor="new-role">Role</label>
                            <select id="new-role" name="role">
                              <option value="ADMIN">Admin</option>
                              <option value="SUPER_ADMIN">Super Admin</option>
                            </select>
                          </div>
                          <button className="primary">Create user</button>
                        </form>
                        <p className="notice">
                          Only Super Admins can create users. New users sign in
                          with the email and password you assign.
                        </p>
                      </div>
                      <form
                        className="card"
                        onSubmit={resetPassword}
                        style={{ marginTop: 20 }}
                      >
                        <h2>Reset admin password</h2>
                        <label>Admin</label>
                        <select name="id">
                          {state.admins.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.email}
                            </option>
                          ))}
                        </select>
                        <label>New password</label>
                        <input
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          minLength={12}
                          maxLength={128}
                          required
                        />
                        <button className="primary">Reset password</button>
                      </form>
                      <div className="table-wrap" style={{ marginTop: 20 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Status</th>
                              <th>Controls</th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.admins.map((a) => (
                              <tr key={a.id}>
                                <td>{a.email}</td>
                                <td>{a.role}</td>
                                <td>{a.active ? "Active" : "Inactive"}</td>
                                <td className="button-row">
                                  <button
                                    className="secondary"
                                    onClick={() =>
                                      changeAdmin(
                                        a,
                                        a.role === "ADMIN"
                                          ? "SUPER_ADMIN"
                                          : "ADMIN",
                                        !!a.active,
                                      )
                                    }
                                  >
                                    Change role
                                  </button>
                                  <button
                                    className="secondary"
                                    onClick={() =>
                                      changeAdmin(a, a.role, !a.active)
                                    }
                                  >
                                    {a.active ? "Deactivate" : "Activate"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {tab === "account" && (
                    <form className="card" onSubmit={changePassword}>
                      <h2>Change your password</h2>
                      <label>Current password</label>
                      <input
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                      <label>New password</label>
                      <input
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                      />
                      <button className="primary">Change password</button>
                    </form>
                  )}
                  {tab === "builder" && (
                    <div className="card">
                      <h2>Form builder</h2>
                      <p>
                        Edit labels, required fields, or add fields. Publish to
                        use changes for new registrations.
                      </p>
                      {form.map((s, si) => (
                        <section className="section" key={si}>
                          <label>Section name</label>
                          <input
                            value={s.title}
                            onChange={(e) =>
                              setForm(
                                form.map((section, i) =>
                                  i === si
                                    ? { ...section, title: e.target.value }
                                    : section,
                                ),
                              )
                            }
                          />
                          {s.fields.map((f, fi) => (
                            <div
                              className="field-editor"
                              key={f.id}
                              draggable
                              onDragStart={(e) =>
                                e.dataTransfer.setData(
                                  "text/plain",
                                  si + ":" + fi,
                                )
                              }
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const [fromS, fromF] = e.dataTransfer
                                  .getData("text/plain")
                                  .split(":")
                                  .map(Number);
                                if (!Number.isInteger(fromS)) return;
                                const next = structuredClone(form),
                                  [moving] = next[fromS].fields.splice(
                                    fromF,
                                    1,
                                  );
                                next[si].fields.splice(fi, 0, moving);
                                setForm(next);
                              }}
                            >
                              <span className="handle">☰</span>
                              <input
                                aria-label="Field label"
                                value={f.label}
                                onChange={(e) =>
                                  setField(si, fi, { label: e.target.value })
                                }
                              />
                              <label>
                                <input
                                  type="checkbox"
                                  checked={f.required}
                                  onChange={(e) =>
                                    setField(si, fi, {
                                      required: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Required
                              </label>
                              <button
                                className="secondary"
                                onClick={() => removeField(si, fi)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <div className="button-row">
                            <select id={"type" + si} defaultValue="text">
                              <option value="text">Short text</option>
                              <option value="textarea">Long text</option>
                              <option value="email">Email</option>
                              <option value="tel">Phone</option>
                              <option value="date">Date</option>
                              <option value="number">Number</option>
                              <option value="checkbox">Checkbox</option>
                            </select>
                            <button
                              className="secondary"
                              onClick={() =>
                                addField(
                                  si,
                                  (
                                    document.getElementById(
                                      "type" + si,
                                    ) as unknown as HTMLSelectElement
                                  ).value,
                                )
                              }
                            >
                              Add field
                            </button>
                          </div>
                        </section>
                      ))}
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={() =>
                            setForm([
                              ...form,
                              { title: "New section", fields: [] },
                            ])
                          }
                        >
                          Add section
                        </button>
                        <button
                          className="primary"
                          onClick={() =>
                            saveSettings("form", { form: { sections: form } })
                          }
                        >
                          Publish form
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            )}
          </>
        )}
      </main>
      <footer>
        FEDMOGA · Knowledge, Discipline and Unity · Membership portal
      </footer>
    </>
  );
}
