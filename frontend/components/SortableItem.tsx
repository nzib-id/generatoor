"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

type Props = {
  id: string;
  src: string;
};

export default function SortableItem({ id, src }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex rounded-3xl items-center gap-3 mb-2 border p-5 w-150"
    >
      <img src={src} alt={id} className="w-16 h-16 border object-contain" />
      <p className="font-mono text-sm capitalize">{id}</p>
    </div>
  );
}
