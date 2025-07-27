"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="p-10 text-center">
      <h1 className="text-4xl font-bold mb-10">🧠 Parodee NFT Generator</h1>

      <div className="flex flex-col gap-6 items-center">
        <Link
          href="/traits"
          className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          🔍 Lihat Semua Traits
        </Link>

        <Link
          href="/preview"
          className="px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 transition"
        >
          🧩 Preview & Urutkan Layer
        </Link>
      </div>
    </main>
  );
}
