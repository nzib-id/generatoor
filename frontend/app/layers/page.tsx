"use client";

import { useEffect, useState } from "react";
import { useTraitStore } from "@/lib/useTraitStore";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableItem from "@/components/ui/SortableItem";
import toast from "react-hot-toast";

const baseUrl = process.env.NEXT_PUBLIC_API_URL;

export default function LayersPage() {
  const BASE_W = 36;
  const BASE_H = 36;
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

  function snapToBase(n: number, base = 36) {
    const k = Math.max(1, Math.round(n / base));
    return k * base;
  }

  useEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth;
      const raw = vw < 640 ? 256 : vw < 1024 ? 384 : 512;
      setCanvasSize(snapToBase(raw, BASE_W));
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // 4. DRAW preview NFT (replace seluruh effect ini)
  useEffect(() => {
    const canvas = document.getElementById(
      "preview-canvas"
    ) as HTMLCanvasElement;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !traits.length) return;

    // Visible canvas: pastikan smoothing OFF
    (ctx as any).imageSmoothingEnabled = false;
    (ctx as any).mozImageSmoothingEnabled = false;
    (ctx as any).webkitImageSmoothingEnabled = false;

    // Offscreen canvas buat komposit di resolusi pixel-aset (36x36)
    const off = document.createElement("canvas");
    off.width = BASE_W;
    off.height = BASE_H;
    const octx = off.getContext("2d")!;
    (octx as any).imageSmoothingEnabled = false;
    (octx as any).mozImageSmoothingEnabled = false;
    (octx as any).webkitImageSmoothingEnabled = false;

    // bersihkan keduanya
    octx.clearRect(0, 0, BASE_W, BASE_H);
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    (async () => {
      // Render layer ke offscreen pada ukuran base (36x36)
      for (const type of [...layerOrder].reverse()) {
        const trait = traits.find((t) => t.type === type);
        if (!trait) continue;

        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = `${baseUrl}${trait.image}`;

        await new Promise<void>((res) => {
          img.onload = () => {
            // gambar ke offscreen di ukuran base (no smoothing)
            octx.drawImage(img, 0, 0, BASE_W, BASE_H);
            res();
          };
        });
      }

      // Terakhir, scale up 36x36 -> canvasSize pakai nearest-neighbor
      ctx.drawImage(off, 0, 0, canvasSize, canvasSize);
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
            className="[image-rendering:pixelated]"
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
