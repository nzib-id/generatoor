// === /app/traits/page.tsx ===
"use client";

import { useEffect, useState } from "react";
import { fetchTraits, fetchTraitImages } from "@/lib/api";

export default function TraitsPage() {
  const [traits, setTraits] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const load = async () => {
      const traitList = await fetchTraits();
      setTraits(traitList);

      const imageMap: Record<string, string[]> = {};
      for (const trait of traitList) {
        const files = await fetchTraitImages(trait);
        imageMap[trait] = files;
      }
      setImages(imageMap);
    };

    load();
  }, []);

  return (
    <main className="">
      <h1 className="text-2xl font-bold mb-6">🎨 All Trait Layers</h1>

      {traits.map((trait) => (
        <div key={trait} className="mb-10">
          <h2 className="text-lg font-semibold capitalize mb-2">{trait}</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            {images[trait]?.map((file) => (
              <img
                key={file}
                src={`http://localhost:4000/layers/${trait}/${file}`}
                alt={file}
                className="border rounded"
              />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
