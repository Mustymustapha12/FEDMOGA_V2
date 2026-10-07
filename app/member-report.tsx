"use client";
import { useState } from "react";
import {
  emptyFilters,
  filteredRows,
  reportAnswers,
  downloadReport,
  type ReportRow,
} from "./report-data";
export default function MemberReport({
  rows,
  title = "Member report",
  onView,
}: {
  rows: ReportRow[];
  title?: string;
  onView?: (r: ReportRow) => void;
}) {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const visible = filteredRows(rows, filters),
    membership = rows.some((r) => r.status);
  const seq = (i: number) =>
    filters.direction === "desc" ? visible.length - i : i + 1;
  const headers = [
    "No.",
    "Registration number",
    "Name",
    "Email",
    "Phone",
    "Membership status",
    "Payment plan",
    "Paid through",
    "Registration date",
    "Mode",
    "Graduation year",
    "Country",
    "Profession",
  ];
  const values = (r: ReportRow, i: number) => {
    const a = reportAnswers(r);
    return [
      seq(i),
      r.number,
      r.name,
      r.email,
      r.phone,
      r.status || "Registered",
      r.preferredPlan || "",
      r.paidUntil || "",
      r.date?.slice(0, 10) || "",
      r.mode,
      a.year,
      a.country,
      a.profession,
    ];
  };
  const field = (key: keyof typeof filters, label: string, type = "text") => (
    <label key={key}>
      {label}
      <input
        type={type}
        value={filters[key]}
        onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="card report-card">
      <div className="toolbar">
        <h2>{title}</h2>
        <button
          className="secondary"
          onClick={() =>
            downloadReport("fedmoga-member-report.csv", [
              headers,
              ...visible.map(values),
            ])
          }
        >
          Export filtered CSV
        </button>
      </div>
      <div className="report-filters">
        {field("search", "Search name, email, phone or form answers")}
        {membership && (
          <>
            <label>
              Membership status
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                {["all", "active", "overdue", "inactive"].map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "All statuses" : v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment plan
              <select
                value={filters.plan}
                onChange={(e) =>
                  setFilters({ ...filters, plan: e.target.value })
                }
              >
                {["all", "monthly", "quarterly", "annually"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          Payment mode
          <select
            value={filters.mode}
            onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
          >
            {["all", "live", "test"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {field("year", "Graduation year")}
        {field("country", "Country")}
        {field("profession", "Profession")}
        {field("from", "Registered from", "date")}
        {field("to", "Registered to", "date")}
        <label>
          Sort by
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="date">Registration date</option>
            <option value="number">Registration number</option>
            <option value="name">Member name</option>
          </select>
        </label>
        <label>
          Order / numbering
          <select
            value={filters.direction}
            onChange={(e) =>
              setFilters({ ...filters, direction: e.target.value })
            }
          >
            <option value="asc">Ascending (1 → last)</option>
            <option value="desc">Descending (last → 1)</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => setFilters({ ...emptyFilters })}
        >
          Clear filters
        </button>
      </div>
      <p>
        <strong>{visible.length}</strong> matching members of {rows.length}.
        Export follows these filters and this order.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "No.",
                "Member",
                "Contact",
                "Status",
                "Plan / paid through",
                "Registered",
                "Details",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.id}>
                <td>{seq(i)}</td>
                <td>
                  {r.name}
                  <br />
                  <small>{r.number}</small>
                </td>
                <td>
                  {r.email}
                  <br />
                  {r.phone}
                </td>
                <td>{r.status || "Registered"}</td>
                <td>
                  {r.preferredPlan || "—"}
                  <br />
                  {r.paidUntil || "—"}
                </td>
                <td>{r.date?.slice(0, 10)}</td>
                <td>
                  {String(reportAnswers(r).year || "—")} ·{" "}
                  {String(reportAnswers(r).country || "—")}
                  {onView && (
                    <button className="secondary" onClick={() => onView(r)}>
                      View entry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p>No members match these filters.</p>}
      </div>
    </section>
  );
}
