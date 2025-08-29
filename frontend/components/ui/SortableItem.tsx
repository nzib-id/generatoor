"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

type Props = {
  id: string;
  src?: string;
  label?: string; // optional, biar lebih human readable
};

export default function SortableItem({ id, src, label }: Props) {
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
      className="flex items-center gap-3 mb-5 border-4 py-9 px-5 h-15 cursor-pointer bg-[#232323] hover:bg-[#303030] transition ease-linear"
    >
      <div className="relative w-10 h-10 border bg-white rounded-lg overflow-hidden flex items-center justify-center">
        {src ? (
          <img
            src={src}
            alt={label || id}
            className="object-contain w-full h-full"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <span className="text-xs text-gray-400">No Image</span>
        )}
      </div>

      <p className="text-2xl capitalize font-bold">{label || id}</p>

      <div className="flex-1 flex justify-end items-center">
        {/* Hamburger drag icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-7 h-7 text-[#FFDF0F]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="white"
          strokeWidth="2.5"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </div>
    </div>
  );
}
