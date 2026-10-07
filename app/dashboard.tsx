"use client";
import { useState, useEffect } from "react";
export default function AdminDashboard() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/admin/members/state", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => setError(String(e)));
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading membership overview…</p>;
  return (
    <>
      <h2>Membership overview · {data.mode}</h2>
      <div className="grid dashboard-grid">
        {[
          ["Members", data.report.total],
          ["Paid membership", data.report.active],
          ["Overdue dues", data.report.overdue],
          ["Inactive members", data.report.inactive],
          [
            "Dues collected",
            "₦" + Number(data.report.collections).toLocaleString("en-NG"),
          ],
          [
            "Outstanding dues",
            "₦" + Number(data.report.outstanding).toLocaleString("en-NG"),
          ],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p>{data.report.outstandingNote}</p>
    </>
  );
}
