"use client";
import { useState } from "react";
export default function PublicHeader({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <div className="wrap top">
        <a className="brand" href="/">
          <img src="/logo.jpg" alt="FEDMOGA logo" />
          <span>
            <strong>FEDMOGA</strong>
            <small>Knowledge, Discipline and Unity</small>
          </span>
        </a>
        {!signedIn && (
          <>
            <button
              className="mobile-nav-toggle secondary"
              aria-expanded={open}
              aria-controls="public-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? "Close menu" : "Menu"}
            </button>
            <nav
              id="public-navigation"
              className={"public-navigation" + (open ? " open" : "")}
              aria-label="Main navigation"
            >
              <a href="/">Home / Registration</a>
              <a href="/login">Sign In</a>
            </nav>
          </>
        )}
      </div>
    </header>
  );
}
