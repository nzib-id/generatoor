// === /app/preview/page.tsx ===
"use client";

import { useEffect, useState } from "react";
import { fetchTraits, fetchTraitImages } from "@/lib/api";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableItem from "@/components/SortableItem";
const API = process.env.NEXT_PUBLIC_API_URL;

const CANVAS_SIZE = 512;

export default function PreviewPage() {
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [layerImages, setLayerImages] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadDefault = async () => {
      const traits = await fetchTraits();
      setLayerOrder(traits);

      const images: Record<string, string> = {};
      for (const trait of traits) {
        const files = await fetchTraitImages(trait);
        if (files.length > 0) {
          images[trait] = `${API}/layers/${trait}/${files[0]}`;
        }
      }
      setLayerImages(images);
    };

    loadDefault();
  }, []);

  useEffect(() => {
    const canvas = document.getElementById(
      "preview-canvas"
    ) as HTMLCanvasElement;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    (async () => {
      for (const trait of [...layerOrder].reverse()) {
        const src = layerImages[trait];
        if (!src) continue;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        await new Promise(
          (res) =>
            (img.onload = () => {
              ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
              res(null);
            })
        );
      }
    })();
  }, [layerOrder, layerImages]);

  const handleSaveOrder = async () => {
    try {
      const res = await fetch(`${API}/api/layer-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: layerOrder }),
      });

      if (!res.ok) throw new Error("Failed to save layer order");

      alert("Layer order saved to backend!");
    } catch (err) {
      console.error(err);
      alert("Failed to save layer order.");
    }
  };

  return (
    <main className="">
      <h1 className="text-2xl font-bold mb-4">Layering</h1>
      <div className="grid grid-cols-2">
        <div>
          <canvas
            id="preview-canvas"
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="rounded-3xl"
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
              {layerOrder.map((trait) => (
                <SortableItem
                  key={trait}
                  id={trait}
                  src={layerImages[trait] || ""}
                />
              ))}
              <button
                onClick={handleSaveOrder}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save Layer Order
              </button>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </main>
  );
}
