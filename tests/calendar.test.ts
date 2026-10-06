import { test } from "node:test";
import assert from "node:assert/strict";
import {
  today,
  renewalPeriod,
  periodEnd,
  membershipStatus,
} from "../server/calendar";
test("calendar dues use Lagos date, month ends, quarter ends and December with leap years", () => {
  assert.equal(today(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
  assert.equal(periodEnd("2028-02-05", "monthly"), "2028-02-29");
  assert.equal(periodEnd("2026-04-15", "quarterly"), "2026-06-30");
  assert.equal(periodEnd("2026-04-15", "annually"), "2026-12-31");
  assert.deepEqual(renewalPeriod("2026-10-31", "monthly", "2026-10-06"), {
    start: "2026-11-01",
    end: "2026-11-30",
  });
  assert.deepEqual(renewalPeriod("2026-12-31", "annually", "2026-10-06"), {
    start: "2027-01-01",
    end: "2027-12-31",
  });
  assert.deepEqual(renewalPeriod("2026-09-30", "monthly", "2026-10-06"), {
    start: "2026-10-06",
    end: "2026-10-31",
  });
});
test("membership transitions active to overdue to inactive and respects disabled access", () => {
  assert.equal(
    membershipStatus("2026-10-31", "2026-01-01", 1, 30, "2026-10-31"),
    "active",
  );
  assert.equal(
    membershipStatus("2026-10-31", "2026-01-01", 1, 30, "2026-11-01"),
    "overdue",
  );
  assert.equal(
    membershipStatus("2026-10-31", "2026-01-01", 1, 30, "2026-12-02"),
    "inactive",
  );
  assert.equal(
    membershipStatus("2027-10-31", "2026-01-01", 0, 30, "2026-10-31"),
    "inactive",
  );
});
