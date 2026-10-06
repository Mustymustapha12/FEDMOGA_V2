"use client";
import { useState } from "react";
type Entry = {
  name: string;
  email: string;
  phone: string;
  amount: string;
  paidDate: string;
  externalReference: string;
};
type Approved = Entry & {
  id: string;
  reference: string;
  registrationUrl: string;
};
async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Request failed");
  return result;
}
export default function ManualPayments({
  superAdmin,
  defaultMode,
  onNotice,
  onRefresh,
}: {
  superAdmin: boolean;
  defaultMode: string;
  onNotice: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState(defaultMode === "test" ? "test" : "live"),
    [busy, setBusy] = useState(false),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<Entry[]>([]),
    [approved, setApproved] = useState<Approved[]>([]),
    [confirmed, setConfirmed] = useState(false);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const element = e.currentTarget,
      f = new FormData(element);
    setBusy(true);
    try {
      const entry = {
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone"),
        amount: f.get("amount"),
        paidDate: f.get("paidDate"),
        externalReference: f.get("externalReference"),
      };
      const result = await post("/api/admin/payments/manual", {
        action: "single",
        entry,
        mode,
        confirmed: f.get("confirmed") === "on",
      });
      setApproved(result.payments);
      element.reset();
      await onRefresh();
      onNotice(
        "Payment approved. Share the private registration link below. No new payment is required.",
      );
    } catch (error) {
      onNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setPreview([]);
    setConfirmed(false);
    try {
      const result = await post("/api/admin/payments/manual", {
        action: "preview",
        csv,
      });
      setPreview(result.entries);
      onNotice(
        "Import validated. Review every entry and confirm the payments before approving.",
      );
    } catch (error) {
      onNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function approveBulk() {
    if (
      !window.confirm(
        `Approve ${preview.length} ${mode === "test" ? "TEST" : "LIVE"} manual payments and create registration links?`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await post("/api/admin/payments/manual", {
        action: "bulk",
        entries: preview,
        mode,
        confirmed,
      });
      setApproved(result.payments);
      setPreview([]);
      setCsv("");
      setConfirmed(false);
      await onRefresh();
      onNotice("Manual payments approved. Registration links are ready below.");
    } catch (error) {
      onNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Already paid / Manual payment</h2>
      <p>
        Check the association’s bank or Paystack records before approving.
        Approval creates registration access; it does not charge the member or
        move money.
      </p>
      <label>
        Record type
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => {
            setMode(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="live">Live — real payments already received</option>
          <option value="test">Test — practice records only</option>
        </select>
      </label>
      {mode === "test" && (
        <p className="notice">
          Test records and their registrations can be permanently removed with
          Clear test data.
        </p>
      )}
      <form className="card" onSubmit={create}>
        <h3>Add one paid member</h3>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
        >
          <label>
            Full name
            <input name="name" required minLength={2} maxLength={160} />
          </label>
          <label>
            Email
            <input name="email" type="email" required maxLength={255} />
          </label>
          <label>
            Phone
            <input
              name="phone"
              type="tel"
              required
              minLength={7}
              maxLength={30}
            />
          </label>
          <label>
            Amount actually paid (₦)
            <input
              name="amount"
              type="number"
              required
              min={1}
              max={10000000}
              step={1}
            />
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
            Original bank / payment reference
            <input
              name="externalReference"
              required
              minLength={3}
              maxLength={100}
            />
          </label>
        </div>
        <label>
          <input type="checkbox" name="confirmed" required /> I checked the bank
          or Paystack records and confirm this payment was received.
        </label>
        <button disabled={busy}>
          {busy
            ? "Please wait…"
            : "Approve payment and create registration link"}
        </button>
      </form>
      {superAdmin && (
        <section className="card" style={{ marginTop: 20 }}>
          <h3>Import paid members from CSV</h3>
          <p>
            Up to 100 entries and 60 KB per file. Required columns:
            name,email,phone,amount,paid_date,reference. Use YYYY-MM-DD dates
            and whole naira amounts. Keep phone and reference columns as text in
            spreadsheets.
          </p>
          <a
            download="fedmoga-manual-payments-template.csv"
            href={
              "data:text/csv;charset=utf-8," +
              encodeURIComponent(
                "name,email,phone,amount,paid_date,reference\nExample Member,member@example.com,08012345678,5000,2026-01-01,BANK-EXAMPLE-001\n",
              )
            }
          >
            Download CSV template
          </a>
          <label>
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                setPreview([]);
                setConfirmed(false);
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 60000) {
                  onNotice("Error: CSV must be smaller than 60 KB");
                  return;
                }
                setCsv(await file.text());
              }}
            />
          </label>
          <label>
            Or paste CSV
            <textarea
              rows={5}
              value={csv}
              disabled={busy}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview([]);
                setConfirmed(false);
              }}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || !csv.trim()}
            onClick={review}
          >
            Validate and preview
          </button>
          {preview.length > 0 && (
            <>
              <h3>
                Review {preview.length} entries ·{" "}
                {mode === "test" ? "TEST" : "LIVE"}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Paid (₦)</th>
                      <th>Date</th>
                      <th>Original reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((entry) => (
                      <tr key={entry.externalReference}>
                        <td>{entry.name}</td>
                        <td>{entry.email}</td>
                        <td>{entry.phone}</td>
                        <td>{Number(entry.amount).toLocaleString()}</td>
                        <td>{entry.paidDate}</td>
                        <td>{entry.externalReference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                I reviewed all entries against the bank or Paystack records and
                confirm these payments were received.
              </label>
              <button disabled={busy || !confirmed} onClick={approveBulk}>
                Approve import and create links
              </button>
            </>
          )}
        </section>
      )}
      {approved.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <h3>Registration links ready</h3>
          <p>
            Private, single-use links expire after 30 days. Share each link only
            with its member. You can retrieve or email links later under Paid
            but incomplete.
          </p>
          {approved.map((payment) => (
            <div key={payment.id} style={{ marginBottom: 18 }}>
              <strong>
                {payment.name} · {payment.email}
              </strong>
              <p>Original reference: {payment.externalReference}</p>
              <input
                aria-label={`Registration link for ${payment.name}`}
                value={payment.registrationUrl}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      payment.registrationUrl,
                    );
                    onNotice("Registration link copied");
                  } catch {
                    onNotice(
                      "Error: Copy was unavailable. Select and copy the link above.",
                    );
                  }
                }}
              >
                Copy link
              </button>{" "}
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await post("/api/admin/payments/resend", {
                      id: payment.id,
                    });
                    onNotice("Registration link emailed");
                  } catch (error) {
                    onNotice(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Email link
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
