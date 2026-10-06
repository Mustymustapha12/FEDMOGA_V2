"use client";
import { useEffect, useState } from "react";
const money = (n: number) => "₦" + Number(n).toLocaleString("en-NG");
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
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || "Request failed");
  return v;
}
function downloadCsv(name: string, rows: unknown[][]) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const blob = new Blob(
    [rows.map((row) => row.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function MembershipAdmin({
  superAdmin,
  pendingOnly = false,
  onNotice,
}: {
  superAdmin: boolean;
  pendingOnly?: boolean;
  onNotice: (m: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  async function refresh() {
    const d = await api("/api/admin/members/state");
    setData(d);
  }
  useEffect(() => {
    refresh().catch((e) => onNotice(String(e)));
  }, []);
  async function action(path: string, body: unknown) {
    setBusy(true);
    try {
      const r = await api(path, body);
      await refresh();
      onNotice(r.message || "Saved successfully");
    } catch (e) {
      onNotice(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p>Loading membership data…</p>;
  if (pendingOnly)
    return (
      <>
        <h2>Payment started · not completed</h2>
        <p>
          These people entered their name, email and phone but have no confirmed
          registration payment. Reminders use their original checkout link and
          verify payment first.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Reference</th>
                <th>Fee</th>
                <th>Started</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.pending.map((p: any) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.email}</td>
                  <td>{p.phone}</td>
                  <td>{p.reference}</td>
                  <td>{money(p.amount)}</td>
                  <td>{p.date.slice(0, 10)}</td>
                  <td>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        action("/api/admin/payments/remind", { id: p.id })
                      }
                    >
                      Send payment reminder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.pending.length && <p>No incomplete checkout payments.</p>}
        </div>
      </>
    );
  const visible = data.members.filter(
    (m: any) =>
      (filter === "all" || m.status === filter) &&
      (m.name + " " + m.email + " " + m.number)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <h2>Memberships & dues · {data.mode}</h2>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}
      >
        {[
          ["Members", data.report.total],
          ["Active", data.report.active],
          ["Overdue", data.report.overdue],
          ["Inactive", data.report.inactive],
          ["Dues collected", money(data.report.collections)],
          ["Outstanding renewals", money(data.report.outstanding)],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <small>{label}</small>
            <h2>{value}</h2>
          </div>
        ))}
      </div>
      <p>{data.report.outstandingNote}</p>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          marginTop: 24,
        }}
      >
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action("/api/admin/members/settings", Object.fromEntries(f));
          }}
        >
          <h3>Dues configuration</h3>
          {["monthly", "quarterly", "annually"].map((p) => (
            <label key={p}>
              {p} amount (₦)
              <input
                name={p}
                type="number"
                min={0}
                max={10000000}
                required
                defaultValue={data.config.prices[p]}
              />
            </label>
          ))}
          <label>
            Overdue grace days
            <input
              name="graceDays"
              type="number"
              min={0}
              max={90}
              required
              defaultValue={data.config.graceDays}
            />
          </label>
          <p>
            Zero disables a plan. After the grace period, an unpaid membership
            becomes inactive. Renewing restores active status.
          </p>
          <button disabled={busy}>Save dues settings</button>
        </form>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action("/api/admin/dues/manual", {
              ...Object.fromEntries(f),
              confirmed: f.get("confirmed") === "on",
            });
          }}
        >
          <h3>Approve bank-transfer dues</h3>
          <label>
            Member
            <select name="memberId" required>
              <option value="">Choose member</option>
              {data.members
                .filter((m: any) => m.enabled)
                .map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.email}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Plan
            <select name="plan">
              {["monthly", "quarterly", "annually"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Amount received (₦)
            <input name="amount" type="number" min={1} step="0.01" required />
          </label>
          <label>
            Payment date
            <input
              name="paidDate"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            Unique bank reference
            <input name="reference" required minLength={3} maxLength={100} />
          </label>
          <label>
            <input type="checkbox" name="confirmed" required /> I checked the
            bank records and confirm payment was received.
          </label>
          <button disabled={busy}>Approve dues and renew</button>
        </form>
        {superAdmin && (
          <div className="card">
            <h3>V1 accounts & email delivery</h3>
            <p>
              {data.unmigrated} registration records are not directly linked to
              an account. Accounts are matched by email and test/live mode;
              duplicate emails are flagged for review.
            </p>
            <button
              disabled={busy}
              onClick={() => action("/api/admin/members/migrate", {})}
            >
              Create accounts for existing registrations
            </button>
            <p>
              Run again for batches above 100. Members do not register or pay
              the registration fee again. Account activation emails are queued.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => action("/api/admin/email/process", {})}
            >
              Process next 5 queued emails
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                action("/api/admin/email/process", { retryFailed: true })
              }
            >
              Retry failed emails
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                action("/api/admin/email/process", { retryFailed: true })
              }
            >
              Retry failed emails
            </button>
            <p>
              {data.mail.map((m: any) => m.status + ": " + m.total).join(" · ")}
            </p>
            <p>
              Configure the scheduled email job in the deployment guide for
              automatic receipts and reminders.
            </p>
          </div>
        )}
      </div>
      <section className="card" style={{ marginTop: 24 }}>
        <div className="toolbar">
          <h3>Member report</h3>
          <button
            className="secondary"
            onClick={() =>
              downloadCsv("fedmoga-members.csv", [
                [
                  "Number",
                  "Name",
                  "Email",
                  "Phone",
                  "Status",
                  "Paid through",
                  "Next dues",
                ],
                ...visible.map((m: any) => [
                  m.number,
                  m.name,
                  m.email,
                  m.phone,
                  m.status,
                  m.paidUntil,
                  m.nextAmount,
                ]),
              ])
            }
          >
            Export report
          </button>
        </div>
        <input
          aria-label="Search members"
          placeholder="Search name, email or membership number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter membership status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["all", "active", "overdue", "inactive"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Paid through</th>
                <th>Account</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m: any) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    <br />
                    <small>{m.number}</small>
                  </td>
                  <td>
                    {m.email}
                    <br />
                    {m.phone}
                  </td>
                  <td>
                    <span className={`membership-status ${m.status}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>{m.paidUntil || "No dues paid"}</td>
                  <td>{m.emailVerified ? "Verified" : "Activation pending"}</td>
                  <td>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        action("/api/admin/members/action", {
                          id: m.id,
                          action: "reminder",
                        })
                      }
                    >
                      Dues reminder
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        action("/api/admin/members/action", {
                          id: m.id,
                          action: "activation",
                        })
                      }
                    >
                      {m.emailVerified
                        ? "Password reset email"
                        : "Activation email"}
                    </button>
                    {superAdmin && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Change this member's sign-in access?"))
                            action("/api/admin/members/action", {
                              id: m.id,
                              action: "enabled",
                              enabled: !m.enabled,
                            });
                        }}
                      >
                        {m.enabled ? "Disable access" : "Enable access"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card" style={{ marginTop: 24 }}>
        <div className="toolbar">
          <h3>Dues collections</h3>
          <button
            className="secondary"
            onClick={() =>
              downloadCsv("fedmoga-dues.csv", [
                [
                  "Reference",
                  "Name",
                  "Email",
                  "Plan",
                  "Amount",
                  "Source",
                  "Status",
                  "Start",
                  "End",
                  "Approved by",
                ],
                ...data.payments.map((p: any) => [
                  p.reference,
                  p.name,
                  p.email,
                  p.plan,
                  Number(p.amount_kobo) / 100,
                  p.source,
                  p.status,
                  p.period_start,
                  p.period_end,
                  p.approved_by,
                ]),
              ])
            }
          >
            Export payments
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Reference</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Coverage</th>
                <th>Status / source</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <br />
                    {p.email}
                  </td>
                  <td>
                    {p.reference}
                    <br />
                    <small>{p.external_reference}</small>
                  </td>
                  <td>{p.plan}</td>
                  <td>{money(Number(p.amount_kobo) / 100)}</td>
                  <td>
                    {p.period_start
                      ? p.period_start + " to " + p.period_end
                      : "Pending"}
                  </td>
                  <td>
                    {p.status} · {p.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
