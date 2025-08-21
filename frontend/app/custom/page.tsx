"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Image from "next/image";

function DynamicImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  if (!src) return null;
  const isGif = src.toLowerCase().endsWith(".gif");
  const [fallback, setFallback] = useState(isGif);

  if (fallback) {
    return <img src={src} alt={alt} className={className} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      className={className}
      onError={() => setFallback(true)}
    />
  );
}

import {
  listCustomTokens,
  uploadCustomToken,
  updateCustomToken,
  deleteCustomToken,
} from "@/lib/api";

export default function CustomPage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const [items, setItems] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [traitType, setTraitType] = useState(""); // optional sekarang
  const [description, setDescription] = useState("");
  const [attrs, setAttrs] = useState<
    Array<{ trait_type: string; value: string }>
  >([]);
  const [include, setInclude] = useState(true);
  const reload = async () => setItems(await listCustomTokens());

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  const onUpload = async () => {
    if (!file) return toast.error("Choose PNG/GIF file!");
    if (!name) return toast.error("Fill name");
    const p = toast.loading("Uploading 1/1...");
    try {
      await uploadCustomToken({
        file,
        name,
        include,
        trait_type: traitType || undefined, // optional
        description: description || undefined, // optional
        attributes: attrs.length ? attrs : undefined, // optional
      });
      toast.success("Uploaded");
      setFile(null);
      setName("");
      setTraitType("");
      setDescription("");
      setAttrs([]);
      setInclude(true);
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      toast.dismiss(p);
    }
  };

  const toggleInclude = async (id: string, val: boolean) => {
    await updateCustomToken(id, { include: val });
    await reload();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this 1/1?")) return;
    await deleteCustomToken(id);
    await reload();
  };

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-7xl font-bold mb-4">Custom Token (1/1)</h1>

      <div className="mb-6 grid gap-3 text-2xl">
        <input
          type="file"
          className="w-1/2 file:border file:mr-4 file:px-4 hover:cursor-pointer file:cursor-pointer hover:file:bg-white hover:file:text-black"
          accept="image/png,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <input
          className="border p-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="border p-2"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {/* Attributes (optional) */}
        <div className="border rounded p-3">
          <div className="font-medium mb-2">Attributes (optional)</div>
          {attrs.map((row, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                className="border p-2 flex-1"
                placeholder="trait_type"
                value={row.trait_type}
                onChange={(e) => {
                  const next = [...attrs];
                  next[i] = { ...next[i], trait_type: e.target.value };
                  setAttrs(next);
                }}
              />
              <input
                className="border p-2 flex-1"
                placeholder="value"
                value={row.value}
                onChange={(e) => {
                  const next = [...attrs];
                  next[i] = { ...next[i], value: e.target.value };
                  setAttrs(next);
                }}
              />
              <button
                className="px-3 py-2 border rounded"
                onClick={() => setAttrs(attrs.filter((_, idx) => idx !== i))}
                type="button"
              >
                Hapus
              </button>
            </div>
          ))}
          <button
            className="px-3 py-2 border rounded"
            onClick={() => setAttrs([...attrs, { trait_type: "", value: "" }])}
            type="button"
          >
            + Tambah Attribute
          </button>
        </div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => setInclude(e.target.checked)}
          />
          Include in next generate
        </label>
        <button
          className="px-4 py-2 rounded bg-black text-white"
          onClick={onUpload}
        >
          Upload 1/1
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-2">Daftar 1/1</h2>
      <ul className="grid gap-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="border p-3 rounded flex gap-3 items-center"
          >
            <DynamicImage
              src={baseUrl + it.file}
              alt={it.name}
              className="w-16 h-16 object-contain"
            />
            <div className="flex-1">
              <div className="font-medium">{it.name}</div>
            </div>
            <label className="flex items-center gap-2 mr-3">
              <input
                type="checkbox"
                checked={!!it.include}
                onChange={(e) => toggleInclude(it.id, e.target.checked)}
              />
              include
            </label>
            <button
              className="px-3 py-1 border rounded"
              onClick={() => onDelete(it.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
