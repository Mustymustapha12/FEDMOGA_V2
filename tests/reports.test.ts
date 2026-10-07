import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filteredRows,
  emptyFilters,
  csvText,
  memberExportRows,
  type ReportRow,
} from "../app/report-data";
test("member reports combine filters, include end dates and reverse natural number order", () => {
  const rows: ReportRow[] = [
    {
      id: "a",
      name: "Amina",
      email: "a@example.com",
      phone: "0801",
      number: "FED-2",
      status: "active",
      mode: "live",
      preferredPlan: "monthly",
      date: "2026-10-07T23:00:00Z",
      answers: JSON.stringify({
        year: "2008",
        country: "Nigeria",
        profession: "Teacher",
      }),
    },
    {
      id: "b",
      name: "Zara",
      email: "z@example.com",
      phone: "0802",
      number: "FED-10",
      status: "overdue",
      mode: "test",
      date: "2026-09-01",
    },
  ];
  assert.deepEqual(
    filteredRows(rows, { ...emptyFilters, sort: "number" }).map((r) => r.id),
    ["a", "b"],
  );
  assert.deepEqual(
    filteredRows(rows, {
      ...emptyFilters,
      sort: "number",
      direction: "desc",
    }).map((r) => r.id),
    ["b", "a"],
  );
  assert.equal(
    filteredRows(rows, {
      ...emptyFilters,
      status: "active",
      mode: "live",
      plan: "monthly",
      year: "2008",
      country: "nigeria",
      profession: "teach",
      search: "0801",
      from: "2026-10-07",
      to: "2026-10-07",
    }).length,
    1,
  );
  assert.equal(filteredRows(rows, { ...emptyFilters, year: "2009" }).length, 0);
  assert.match(csvText([[" =SUM(1,2)", 'A "quoted" name']]), /' =SUM/);
  assert.match(csvText([['A "quoted" name']]), /""quoted""/);
});

test("actual member CSV exports have separate ascending and descending serial numbers", () => {
  const rows: ReportRow[] = [
    {
      id: "a",
      name: "Amina",
      email: "a@example.com",
      phone: "0801",
      number: "FED-2",
    },
    {
      id: "b",
      name: "Zara",
      email: "z@example.com",
      phone: "0802",
      number: "FED-10",
    },
  ];
  const asc = memberExportRows(
    filteredRows(rows, { ...emptyFilters, sort: "number" }),
    "asc",
  );
  const desc = memberExportRows(
    filteredRows(rows, { ...emptyFilters, sort: "number", direction: "desc" }),
    "desc",
  );
  assert.equal(asc[0][0], "No.");
  assert.deepEqual(
    asc.slice(1).map((r) => r[0]),
    [1, 2],
  );
  assert.deepEqual(
    desc.slice(1).map((r) => r[0]),
    [2, 1],
  );
  assert.equal(desc[1][1], "FED-10");
  assert.match(csvText(desc), /"2","FED-10","Zara"/);
  const one = memberExportRows(
    filteredRows(rows, { ...emptyFilters, search: "Amina" }),
    "desc",
  );
  assert.equal(one.length, 2);
  assert.equal(one[1][0], 1);
});
