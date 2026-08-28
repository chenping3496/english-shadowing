"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "今日", icon: Today },
  { href: "/practice", label: "跟读", icon: Mic },
  { href: "/snap", label: "拍照", icon: Camera },
  { href: "/progress", label: "进度", icon: Chart },
  { href: "/backup", label: "备份", icon: Backup },
] as const;

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col pb-20">
      <div className="flex-1">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-booth-700 bg-booth-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                  active ? "text-signal" : "text-ink-400 hover:text-ink-200"
                }`}
              >
                <Icon active={active} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Today({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="5"
        width="16"
        height="15"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 3v4M16 3v4M4 10h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {active && <circle cx="12" cy="15.5" r="1.8" fill="currentColor" />}
    </svg>
  );
}

function Mic({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="3"
        width="6"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {active && <circle cx="12" cy="18.5" r="1.6" fill="currentColor" />}
    </svg>
  );
}

function Camera({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.4-2h5.8l1.4 2h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      {active && <circle cx="12" cy="12.5" r="1.2" fill="currentColor" />}
    </svg>
  );
}

function Backup({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Chart({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20V4M4 20h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="7.5" y="11" width="3" height="5" rx="1" fill="currentColor" />
      <rect x="13" y="7" width="3" height="9" rx="1" fill="currentColor" />
      <rect x="18.5" y="13" width="3" height="3" rx="1" fill="currentColor" />
      {active && (
        <circle cx="13" cy="7" r="1.2" fill="var(--color-signal)" />
      )}
    </svg>
  );
}
