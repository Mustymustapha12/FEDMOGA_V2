export type ReportRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  number: string;
  date?: string;
  mode?: string;
  status?: string;
  preferredPlan?: string;
  paidUntil?: string | null;
  emailVerified?: boolean;
  answers?: string;
  [key: string]: unknown;
};
export type ReportFilters = {
  search: string;
  status: string;
  mode: string;
  plan: string;
  year: string;
  country: string;
  profession: string;
  from: string;
  to: string;
  sort: string;
  direction: string;
};
export const emptyFilters: ReportFilters = {
  search: "",
  status: "all",
  mode: "all",
  plan: "all",
  year: "",
  country: "",
  profession: "",
  from: "",
  to: "",
  sort: "date",
  direction: "asc",
};
export function reportAnswers(row: ReportRow): Record<string, unknown> {
  try {
    return JSON.parse(row.answers || "{}");
  } catch {
    return {};
  }
}
export function filteredRows(rows: ReportRow[], f: ReportFilters) {
  return rows
    .filter((r) => {
      const a = reportAnswers(r),
        date = (r.date || "").slice(0, 10);
      return (
        (!f.search ||
          [r.name, r.email, r.phone, r.number, ...Object.values(a)]
            .join(" ")
            .toLowerCase()
            .includes(f.search.toLowerCase())) &&
        (f.status === "all" || r.status === f.status) &&
        (f.mode === "all" || r.mode === f.mode) &&
        (f.plan === "all" || r.preferredPlan === f.plan) &&
        (!f.year || String(a.year || "") === f.year) &&
        (!f.country ||
          String(a.country || "")
            .toLowerCase()
            .includes(f.country.toLowerCase())) &&
        (!f.profession ||
          String(a.profession || "")
            .toLowerCase()
            .includes(f.profession.toLowerCase())) &&
        (!f.from || date >= f.from) &&
        (!f.to || date <= f.to)
      );
    })
    .sort((a, b) => {
      const k = f.sort,
        compare =
          String(a[k] || "").localeCompare(String(b[k] || ""), "en", {
            numeric: true,
          }) || a.id.localeCompare(b.id);
      return f.direction === "desc" ? -compare : compare;
    });
}
export function csvText(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function downloadReport(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportSequence(
  index: number,
  total: number,
  direction: string,
) {
  return direction === "desc" ? total - index : index + 1;
}
export function memberExportRows(
  visible: ReportRow[],
  direction: string,
): unknown[][] {
  return [
    [
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
    ],
    ...visible.map((r, i) => {
      const a = reportAnswers(r);
      return [
        reportSequence(i, visible.length, direction),
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
    }),
  ];
}
