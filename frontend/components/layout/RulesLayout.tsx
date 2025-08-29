"use client";

import { ReactNode } from "react";

type TabKey = "specific" | "showto" | "tags";

export function RulesLayout({
  active,
  onChange,
  children,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  children: ReactNode;
}) {
  const items: { key: TabKey; label: string }[] = [
    {
      key: "specific",
      label: "Specific",
    },
    { key: "showto", label: "Show To" },
    { key: "tags", label: "Tags" },
  ];

  return (
    <div className="grid grid-cols-12 gap-12">
      {/* Side Nav */}
      <aside className="col-span-12 md:col-span-3 xl:col-span-2 ">
        <nav className="flex md:flex-col gap-5 select-none">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className={` text-left px-3 py-2 hover:border-white hover:bg-white/5 transition
                ${
                  active === it.key
                    ? "border-white bg-white/5 "
                    : "border-white/20 cursor-pointer"
                }`}
            >
              <div className="text-xl font-semibold">{it.label}</div>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="col-span-12 md:col-span-9 xl:col-span-10">
        {children}
      </main>
    </div>
  );
}
