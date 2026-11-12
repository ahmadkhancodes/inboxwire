"use client";
import { hardNavigate } from "./api";
import { List, SignOut, X } from "@phosphor-icons/react";
import { Wordmark } from "@/components/brand/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { authClient } from "@/lib/auth/client";
import { OrgSwitcher } from "./org-switcher";

interface NavItem { href: string; label: string }
interface NavGroup { label: string; items: NavItem[] }

/** Text-only index, grouped by job (docs/design-brief.md §7). No icon per item. */
const GROUPS: NavGroup[] = [
  { label: "Mail", items: [
    { href: "/app", label: "Overview" },
    { href: "/app/lines", label: "Lines" },
    { href: "/app/ticker", label: "Ticker" },
    { href: "/app/deliveries", label: "Deliveries" },
    { href: "/app/outbox", label: "Outbox" },
  ] },
  { label: "Developers", items: [
    { href: "/app/keys", label: "Keys" },
    { href: "/app/settings/webhooks", label: "Webhooks" },
    { href: "/app/oauth-clients", label: "OAuth clients" },
  ] },
  { label: "Account", items: [
    { href: "/app/billing", label: "Billing" },
    { href: "/app/settings/members", label: "Members" },
    { href: "/app/settings/security", label: "Security" },
    { href: "/app/settings/profile", label: "Profile" },
    { href: "/app/settings/audit", label: "Audit log" },
  ] },
];

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = item.href === "/app" ? pathname === "/app" : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center px-4 body-5 transition-colors duration-300 focus-visible:focus-ring",
        active
          ? "bg-surface text-text before:absolute before:inset-y-2 before:left-0 before:w-1 before:bg-text"
          : "text-text-subtle hover:bg-surface hover:text-text",
      )}
    >
      {item.label}
    </Link>
  );
}

function NavIndex({ isAdmin, pathname, onNavigate }: { isAdmin: boolean; pathname: string; onNavigate?: () => void }) {
  const groups = isAdmin ? [...GROUPS, { label: "Founder", items: [{ href: "/admin", label: "Admin" }] }] : GROUPS;
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col">
          <p className="px-4 pb-1 font-mono caption-5 text-text-muted">{g.label}</p>
          {g.items.map((i) => <NavLink key={i.href} item={i} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      ))}
    </nav>
  );
}

function SignOutButton({ className }: { className?: string }) {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <button
      type="button"
      disabled={signingOut}
      onClick={async () => {
        setSigningOut(true);
        await authClient.signOut();
        hardNavigate("/");
      }}
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-sm px-3 body-5 text-text-subtle transition-colors duration-300 hover:bg-surface-sunken hover:text-text focus-visible:focus-ring disabled:opacity-50", className)}
    >
      <SignOut size={16} weight="regular" aria-hidden />
      {signingOut ? "Signing out" : "Sign out"}
    </button>
  );
}

export function AppShell({ org, user, isAdmin, productName, banners, children }: {
  org: { id: string; name: string };
  user: { name: string; email: string };
  isAdmin: boolean;
  productName: string;
  banners?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/app" className="inline-flex min-h-11 shrink-0 items-center focus-visible:focus-ring" aria-label={`${productName} by BufferSol, overview`}><Wordmark /></Link>
            <span aria-hidden className="hidden h-6 w-px bg-border lg:block" />
            <div className="hidden w-[256px] lg:block"><OrgSwitcher activeId={org.id} activeName={org.name} /></div>
          </div>
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span className="truncate font-mono caption-5 text-text-subtle" title={user.email}>{user.name || user.email}</span>
            <SignOutButton />
          </div>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-sm text-text transition-colors duration-300 hover:bg-surface-sunken focus-visible:focus-ring lg:hidden"
          >
            <List size={24} weight="regular" aria-hidden />
          </button>
        </div>
      </header>

      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
        className="fixed inset-0 z-40 flex flex-col gap-6 overflow-y-auto bg-surface-sunken pb-6 lg:hidden"
      >
        <div className="flex h-16 items-center justify-between border-b border-border bg-surface px-4">
          <Wordmark />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="inline-flex size-11 items-center justify-center rounded-sm text-text transition-colors duration-300 hover:bg-surface-sunken focus-visible:focus-ring"
          >
            <X size={24} weight="regular" aria-hidden />
          </button>
        </div>
        {open ? (
          <>
            <div className="px-4"><OrgSwitcher activeId={org.id} activeName={org.name} /></div>
            <NavIndex isAdmin={isAdmin} pathname={pathname} onNavigate={() => setOpen(false)} />
            <div className="flex flex-col gap-1 border-t border-border px-4 pt-4">
              <p className="truncate font-mono caption-5 text-text-subtle">{user.email}</p>
              <SignOutButton className="-ml-3 w-fit" />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[224px] shrink-0 overflow-y-auto border-r border-border bg-surface-sunken py-6 lg:block">
          <NavIndex isAdmin={isAdmin} pathname={pathname} />
        </aside>
        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            {banners}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
