"use client";

import { useEffect, useState } from "react";
import { useTraitStore } from "@/lib/useTraitStore";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableItem from "@/components/SortableItem";
import toast from "react-hot-toast";

const baseUrl = process.env.NEXT_PUBLIC_API_URL;

export default function LayersPage() {
  // 1. Ambil global traits
  const traits = useTraitStore((s) => s.traits);

  // 2. Ambil semua type unik sebagai layer
  const defaultOrder = Array.from(new Set(traits.map((t) => t.type)));
  const [layerOrder, setLayerOrder] = useState<string[]>(defaultOrder);

  // 3. Canvas size responsive
  const [canvasSize, setCanvasSize] = useState(512);

  useEffect(() => {
    // Update default order dari data global saat traits ready
    setLayerOrder(Array.from(new Set(traits.map((t) => t.type))));
  }, [traits]);

  useEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth;
      if (vw < 640) setCanvasSize(256);
      else if (vw < 1024) setCanvasSize(384);
      else setCanvasSize(512);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // 4. DRAW preview NFT
  useEffect(() => {
    const canvas = document.getElementById(
      "preview-canvas"
    ) as HTMLCanvasElement;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !traits.length) return;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    (async () => {
      // Render per-layer berdasarkan order
      for (const type of [...layerOrder].reverse()) {
        // Cari 1 item yang type-nya cocok (boleh filter context/value kalau mau)
        const trait = traits.find((t) => t.type === type);
        if (!trait) continue;

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = `${baseUrl}${trait.image}`;
        await new Promise(
          (res) =>
            (img.onload = () => {
              ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
              res(null);
            })
        );
      }
    })();
  }, [traits, layerOrder, canvasSize]);

  // 5. Save order ke backend
  const handleSaveOrder = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/layer-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: layerOrder }),
      });

      if (!res.ok) throw new Error("Failed to save layer order");

      toast.success("Layer order saved!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save!");
    }
  };

  return (
    <main>
      <h1 className="text-8xl mb-8">Layers</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="flex justify-center">
          <canvas
            id="preview-canvas"
            width={canvasSize}
            height={canvasSize}
            className=""
          />
        </div>
        <div>
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              const oldIndex = layerOrder.indexOf(active.id as string);
              const newIndex = layerOrder.indexOf(over.id as string);
              setLayerOrder(arrayMove(layerOrder, oldIndex, newIndex));
            }}
          >
            <SortableContext
              items={layerOrder}
              strategy={verticalListSortingStrategy}
            >
              {layerOrder.map((type) => {
                // Show 1 image preview per type (ambil random atau pertama)
                const item = traits.find((t) => t.type === type);
                return (
                  <SortableItem
                    key={type}
                    id={type}
                    src={item ? `${baseUrl}${item.image}` : ""}
                    label={type}
                  />
                );
              })}
            </SortableContext>
            <button
              onClick={handleSaveOrder}
              className="mt-4 px-4 py-1 bg-[#FFDF0F] text-[#262626] text-2xl hover:-translate-y-1 active:translate-y-1 cursor-pointer"
            >
              Save
            </button>
          </DndContext>
        </div>
      </div>
    </main>
  );
}
