"use client";

import { useState, type ReactNode } from "react";

// App frame: a sidebar on desktop, and a top bar with a Menu button on phones.
// Tapping any link in the menu closes it on phones.
export default function SidebarShell({
  brand,
  nav,
  user,
  children,
}: {
  brand: ReactNode;
  nav: ReactNode;
  user: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <header className="mobile-bar">
        <div className="sidebar-brand">{brand}</div>
        <button type="button" className="menu-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close" : "Menu"}
        </button>
      </header>
      <aside
        className={`sidebar ${open ? "open" : ""}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className="sidebar-brand desktop-only">{brand}</div>
        <nav className="sidebar-nav">{nav}</nav>
        <div className="sidebar-user">{user}</div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
