"use client";
import { useState } from "react";
export const adminGroups = [
  {
    title: "Registrations",
    items: {
      registrations: "Paid Registrations",
      abandoned: "Pending Payment",
      incomplete: "Paid — Finish Registration",
      payments: "Payment History",
      manual: "Approve Previous Payment",
      registrationReports: "Reports & Export",
      builder: "Registration Form",
    },
  },
  {
    title: "Memberships",
    items: {
      memberships: "All Members & Dues",
      membershipSettings: "Settings",
      reports: "Reports & Export",
    },
  },
  {
    title: "Administration",
    items: {
      settings: "Registration / Paystack Settings",
      account: "My Account",
      users: "Admin Users",
    },
  },
];
export default function AdminNavigation({
  tab,
  superAdmin,
  onSelect,
  onSignOut,
}: {
  tab: string;
  superAdmin: boolean;
  onSelect: (key: string) => void;
  onSignOut: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  return (
    <aside
      className={"sidebar grouped-sidebar" + (mobile ? " menu-open" : "")}
      aria-label="Admin menu"
    >
      <button
        className="dashboard-menu"
        onClick={() => {
          onSelect("dashboard");
          setMobile(false);
        }}
        aria-current={tab === "dashboard" ? "page" : undefined}
      >
        Dashboard
      </button>
      <button
        className="sidebar-toggle"
        aria-expanded={mobile}
        onClick={() => setMobile(!mobile)}
      >
        {mobile ? "Close menu" : "Open menu"}
      </button>
      <nav className="sidebar-groups">
        {adminGroups.map((g) => (
          <details key={g.title} open={Object.keys(g.items).includes(tab)}>
            <summary>{g.title}</summary>
            <div className="submenu">
              {Object.entries(g.items)
                .filter(([key]) => key !== "users" || superAdmin)
                .map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? "active" : ""}
                    aria-current={tab === key ? "page" : undefined}
                    onClick={() => {
                      onSelect(key);
                      setMobile(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
            </div>
          </details>
        ))}
        <button onClick={onSignOut}>Sign Out</button>
      </nav>
    </aside>
  );
}
