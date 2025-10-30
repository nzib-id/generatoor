"use client";
import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import {
  listCustomTokens,
  uploadCustomToken,
  updateCustomToken,
  deleteCustomToken,
} from "@/lib/api";

/* ---------- Helpers ---------- */
function clsx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}
type TabKey = "upload" | "custom";
type UpFile = { file: File; rel: string };

/* Fallback image untuk GIF / error */
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
  if (fallback) return <img src={src} alt={alt} className={className} />;
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

export default function UploadModal() {
  /* ---------- Modal + Tabs ---------- */
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TabKey>("upload");

  /* ---------- Upload (folders) ---------- */
  const [upFiles, setUpFiles] = useState<UpFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const API = process.env.NEXT_PUBLIC_API_URL as string;

  // Baca semua batch dari FileSystemDirectoryReader
  function readAllDirectoryEntries(reader: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const entries: any[] = [];
      const read = () => {
        reader.readEntries(
          (batch: any[]) => {
            if (!batch.length) return resolve(entries);
            entries.push(...batch);
            read();
          },
          (err: any) => reject(err)
        );
      };
      read();
    });
  }

  // Rekursif entry (dir & file) -> kembalikan UpFile[], JANGAN set property di File
  async function traverseEntry(entry: any, prefix = ""): Promise<UpFile[]> {
    if (entry.isFile) {
      return new Promise<UpFile[]>((resolve) => {
        entry.file((file: File) => {
          resolve([{ file, rel: prefix + entry.name }]);
        });
      });
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = await readAllDirectoryEntries(reader);
      const nested = await Promise.all(
        children.map((c: any) => traverseEntry(c, `${prefix}${entry.name}/`))
      );
      return nested.flat();
    }
    return [];
  }

  // Cegah browser open file saat drop di luar dropzone
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const addFiles = (news: UpFile[]) => {
    if (!news?.length) return;

    // dedupe by rel
    setUpFiles((prev) => {
      const map = new Map<string, UpFile>();
      const put = (u: UpFile) => map.set(u.rel, u);
      prev.forEach(put);
      news.forEach(put);
      return Array.from(map.values());
    });

    // update daftar folder root
    setFolders((prev) => {
      const set = new Set(prev);
      news.forEach((u) => {
        const root = u.rel.split("/")[0];
        if (root) set.add(root);
      });
      return Array.from(set);
    });
  };

  // File input (webkitdirectory aktif)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arr = Array.from(e.target.files || []).map((f) => ({
      file: f,
      // properti webkitRelativePath dibaca kalau ada, TIDAK di-set
      rel: ((f as any).webkitRelativePath as string) || f.name,
    }));
    addFiles(arr);
  };

  useEffect(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.setAttribute("webkitdirectory", "");
    fileInputRef.current.setAttribute("directory", "");
    fileInputRef.current.setAttribute("mozdirectory", "");
  }, [open]);

  /* ====== DnD handlers (stabil, pakai dragCounter) ====== */
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // @ts-ignore
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const dt = e.dataTransfer;
    if (!dt) return;

    const items = dt.items ? Array.from(dt.items) : [];
    // @ts-ignore
    const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);

    const enforceFolderOnly = true;

    if (entries.length) {
      if (enforceFolderOnly && entries.every((en: any) => en.isFile)) {
        toast.error("Drop FOLDER, not a file!");
        return;
      }

      // pastikan cuma 1 root folder
      const dirRoots = entries
        .filter((en: any) => en.isDirectory)
        .map((en: any) => en.name);
      const uniq = Array.from(new Set(dirRoots));
      if (uniq.length > 1) {
        toast.error("Choose only 1 project folder");
        return;
      }

      const nested = await Promise.all(
        entries.map((en: any) => traverseEntry(en))
      );
      const collected = nested.flat().filter(Boolean) as UpFile[];
      addFiles(collected);
    } else {
      if (enforceFolderOnly) {
        toast.error(
          "This browser doesn't support drag and drop folder, click area to upload!"
        );
        return;
      }
      const arr = Array.from(dt.files || []).map((f) => ({
        file: f,
        rel: f.name,
      }));
      addFiles(arr);
    }
  };

  const handleUpload = async () => {
    if (!upFiles.length) return toast.error("Choose folder/root!");

    // pastikan cuma 1 root (match backend rule)
    const roots = Array.from(
      new Set(upFiles.map((u) => u.rel.split("/")[0]).filter(Boolean))
    );
    if (roots.length !== 1) {
      toast.error("Upload only ONE root folder (1 project).");
      return;
    }
    const project = roots[0];

    // === Logger: tampilkan sample rel ===
    console.log("[upload] total files:", upFiles.length, "root:", project);
    console.log(
      "[upload] sample rel:",
      upFiles.slice(0, 10).map((x) => x.rel)
    );

    // === Preflight: simulasi target server ===
    const layersRootName = "layers"; // backend akan cari segmen 'layers'
    const normalizeToServerTarget = (rel: string) => {
      const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
      const i = parts.findIndex((p) => p.toLowerCase() === layersRootName);
      const after =
        i >= 0 && i < parts.length - 1 ? parts.slice(i + 1) : parts.slice(1); // buang project
      return after.join("/"); // contoh: "Skin/Male/Noir.png"
    };

    // cek illegal/dupe
    const dupes = new Map<string, string[]>();
    const bads: string[] = [];
    for (const u of upFiles) {
      const rel = u.rel.replace(/\\/g, "/").trim();
      if (!rel) {
        bads.push("(empty rel)");
        continue;
      }

      const seg = rel.split("/").filter(Boolean);
      if (seg.length < 3) {
        // minimal Project/Layer/file
        bads.push(rel);
        continue;
      }
      if (seg.some((s) => s === "." || s === "..")) {
        bads.push(rel + " (traversal)");
        continue;
      }
      const dst = normalizeToServerTarget(rel);
      if (!/\.png$/i.test(dst)) continue; // server juga skip non-png

      const arr = dupes.get(dst) || [];
      arr.push(rel);
      dupes.set(dst, arr);
    }

    if (bads.length) {
      console.error(
        "[upload] invalid rel:",
        bads.slice(0, 10),
        bads.length > 10 ? `(+${bads.length - 10} more)` : ""
      );
      toast.error("Ada path invalid. Cek console.");
      return;
    }

    const collided = [...dupes.entries()].filter(([_, arr]) => arr.length > 1);
    if (collided.length) {
      console.error("[upload] duplicate target detected (server perspective):");
      collided
        .slice(0, 10)
        .forEach(([dst, arr]) => console.error(" ->", dst, "from", arr));
      toast.error("Ada file nabrak target yang sama. Cek console log.");
      return;
    }

    setIsUploading(true);
    setProgress(0);

    // ---- helper hashing aman (optional, skip kalau nggak ada WebCrypto)
    async function sha1File(file: File): Promise<string | null> {
      const subtle = (globalThis as any)?.crypto?.subtle;
      if (!subtle) return null; // fallback: skip hashing on unsupported env
      const buf = await file.arrayBuffer();
      const hash = await subtle.digest("SHA-1", buf);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    // ...tepat sebelum: const formData = new FormData();
    const preHashes: Record<string, string> = {};
    const canHash = !!(globalThis as any)?.crypto?.subtle;

    if (canHash) {
      for (const u of upFiles) {
        const h = await sha1File(u.file);
        if (h) preHashes[u.rel] = h;
      }
      if (Object.keys(preHashes).length) console.table(preHashes);
    } else {
      console.warn("[upload] WebCrypto tidak tersedia; skip pre-hash");
    }

    console.table(preHashes); // <== lihat "Skin/Male/Noir.png" vs "Skin/Female/Noir.png"

    const formData = new FormData();
    upFiles.forEach((u, idx) => {
      // Wajib: pakai fieldname "files:<rel>" persis seperti backend baca
      formData.append(`files:${u.rel}`, u.file);
      if ((idx + 1) % 50 === 0)
        console.log(`[upload] appended ${idx + 1}/${upFiles.length}`);
      setProgress(Math.round(((idx + 1) / upFiles.length) * 60));
    });

    try {
      const res = await fetch(`${API}/api/upload-traits`, {
        method: "POST",
        body: formData,
      });
      const text = await res.text();
      if (!res.ok) {
        console.error("upload-traits failed:", res.status, text);
        toast.error(`Upload failed (${res.status}). ${text || ""}`);
        return;
      }

      // coba parse debug backend
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}
      if (json?.debug) {
        console.log("[server debug] written:", json.debug.slice(0, 20));
        if (json.debug.length > 20)
          console.log(`[server debug] (+${json.debug.length - 20} more)`);
      } else {
        console.log("[server response]", text);
      }

      setProgress(100);
      toast.success("Uploaded");
      setUpFiles([]);
      setFolders([]);
    } catch (e: any) {
      console.error(e);
      toast.error("Upload failed (network/server). Cek console & server log.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  /* ---------- Custom 1/1 ---------- */
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  const [items, setItems] = useState<any[]>([]);
  const [oneFile, setOneFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attrs, setAttrs] = useState<
    Array<{ trait_type: string; value: string }>
  >([]);
  const [include, setInclude] = useState(true);

  const reloadCustom = async () => setItems(await listCustomTokens());

  useEffect(() => {
    if (open && active === "custom") {
      reloadCustom().catch(() => {});
    }
  }, [open, active]);

  const onUploadOne = async () => {
    if (!oneFile) return toast.error("Choose PNG/GIF file!");
    if (!name) return toast.error("Fill name");
    const p = toast.loading("Uploading 1/1...");
    try {
      await uploadCustomToken({
        file: oneFile,
        name,
        include,
        description: description || undefined,
        attributes: attrs.length ? attrs : undefined,
      });
      toast.success("Uploaded");
      setOneFile(null);
      setName("");
      setDescription("");
      setAttrs([]);
      setInclude(true);
      await reloadCustom();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      toast.dismiss(p);
    }
  };

  const toggleInclude = async (id: string, val: boolean) => {
    await updateCustomToken(id, { include: val });
    await reloadCustom();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this 1/1?")) return;
    await deleteCustomToken(id);
    await reloadCustom();
  };

  /* ---------- Tabs ---------- */
  const UploadTab = (
    <div className="px-6 pt-4 pb-6 overflow-y-auto flex-1">
      <div
        className={clsx(
          "border-4 rounded-lg p-6 transition",
          isDragging ? "border-[#FFDF0F]" : "border-white/20"
        )}
      >
        <div className="text-xl font-semibold mb-3">Upload Folders</div>

        <div
          className="border-4 border-dashed rounded-lg p-8 text-center cursor-pointer select-none"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          title="Drag & drop folder/file di sini atau klik untuk pilih"
        >
          <div className="text-2xl mb-2">Drop folder here</div>
          <div className="opacity-70">or click this area choose</div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleChange}
          accept="image/png,image/gif,image/jpeg"
          className="hidden"
        />

        {folders.length > 0 && (
          <div className="mt-4">
            <div className="text-sm opacity-80 mb-2">Folder:</div>
            <div className="flex flex-wrap gap-2">
              {folders.map((f, i) => (
                <span
                  key={i}
                  className="bg-[#FFDF0F] text-[#262626] rounded px-2 py-1 text-sm"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button
            onClick={handleUpload}
            disabled={isUploading || upFiles.length === 0}
            className={clsx(
              "bg-[#FFDF0F] text-[#262626] text-xl px-4 py-1 active:translate-y-1",
              isUploading || upFiles.length === 0
                ? "opacity-60 cursor-not-allowed"
                : ""
            )}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
          <button
            onClick={() => {
              setUpFiles([]);
              setFolders([]);
            }}
            disabled={
              isUploading || (upFiles.length === 0 && folders.length === 0)
            }
            className={clsx(
              "px-4 py-1 border-4 text-xl active:translate-y-1",
              isUploading || (upFiles.length === 0 && folders.length === 0)
                ? "opacity-50 cursor-not-allowed"
                : ""
            )}
          >
            Reset
          </button>

          {(isUploading || progress > 0) && (
            <div className="flex-1 min-w-[200px] h-3 bg-white/10 rounded ml-2 overflow-hidden">
              <div
                className="h-full bg-[#FFDF0F] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const CustomTab = (
    <div className="px-6 pt-4 pb-6 overflow-y-auto flex-1">
      <div className="border-4 border-white/20 rounded-lg p-4 mb-6">
        <div className="text-2xl font-bold mb-4">Custom Token (1/1)</div>

        <div className="mb-4 grid gap-3 text-base md:text-lg">
          <input
            type="file"
            className="w-full md:w-1/2 file:border file:mr-4 file:px-4 hover:cursor-pointer file:cursor-pointer hover:file:bg-white hover:file:text-black"
            accept="image/png,image/gif"
            onChange={(e) => setOneFile(e.target.files?.[0] || null)}
          />
          <input
            className="border-2 border-white/20 bg-transparent p-2"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="border-2 border-white/20 bg-transparent p-2"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Attributes (optional) */}
          <div className="border-4 border-white/20 rounded p-3">
            <div className="font-semibold mb-2">Attributes (optional)</div>
            {attrs.map((row, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  className="border-2 border-white/20 bg-transparent p-2 flex-1"
                  placeholder="trait_type"
                  value={row.trait_type}
                  onChange={(e) => {
                    const next = [...attrs];
                    next[i] = { ...next[i], trait_type: e.target.value };
                    setAttrs(next);
                  }}
                />
                <input
                  className="border-2 border-white/20 bg-transparent p-2 flex-1"
                  placeholder="value"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...attrs];
                    next[i] = { ...next[i], value: e.target.value };
                    setAttrs(next);
                  }}
                />
                <button
                  className="px-3 py-2 border-4 active:translate-y-1"
                  onClick={() => setAttrs(attrs.filter((_, idx) => idx !== i))}
                  type="button"
                >
                  Hapus
                </button>
              </div>
            ))}
            <button
              className="px-3 py-2 border-4 active:translate-y-1"
              onClick={() =>
                setAttrs([...attrs, { trait_type: "", value: "" }])
              }
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

          <div>
            <button
              className="px-4 py-2 bg-[#FFDF0F] text-[#262626] active:translate-y-1"
              onClick={onUploadOne}
            >
              Upload 1/1
            </button>
          </div>
        </div>
      </div>

      <div className="border-4 border-white/20 rounded-lg p-4">
        <div className="text-xl font-semibold mb-3">Daftar 1/1</div>
        <ul className="grid gap-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="border-4 border-white/15 p-3 rounded flex gap-3 items-center"
            >
              <DynamicImage
                src={(baseUrl || "") + it.file}
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
                className="px-3 py-1 border-4 active:translate-y-1"
                onClick={() => onDelete(it.id)}
              >
                Delete
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="opacity-60">Nothing here.</li>}
        </ul>
      </div>
    </div>
  );

  const tabs = useMemo(
    () =>
      [
        { key: "upload", label: "Upload", body: UploadTab },
        { key: "custom", label: "Custom 1/1", body: CustomTab },
      ] as { key: TabKey; label: string; body: ReactNode }[],
    [UploadTab, CustomTab]
  );

  /* ---------- Render ---------- */
  return (
    <>
      {/* Button di Navbar */}
      <button
        onClick={() => setOpen(true)}
        className="flex active:translate-y-1 border-2 px-2 py-1 cursor-pointer items-center gap-2 hover:bg-white/10"
      >
        <div className="relative w-8 h-8 flex">
          <Image
            src={"./ui/upload.svg"}
            fill
            alt="upload"
            className="object-contain"
          />
        </div>
        Upload
      </button>

      {open && (
        <div
          className="fixed z-50 inset-0 bg-black/50 flex items-center justify-center overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#262626] rounded-lg w-[min(1200px,96vw)] h-[90vh] drop-shadow-2xl border-4 flex flex-col">
            {/* Header sticky */}
            <div className="sticky top-0 z-10 bg-[#262626] border-b-4 px-6 py-4 flex items-center justify-between">
              <h2 className="text-3xl font-bold">Upload & Custom</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-white cursor-pointer"
                aria-label="Close modal"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  className="stroke-4 stroke-white active:translate-y-1"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <line x1="4" y1="4" x2="20" y2="20" />
                  <line x1="20" y1="4" x2="4" y2="20" />
                </svg>
              </button>
            </div>

            {/* Tabs header */}
            <div className="px-6 pt-4">
              <div className="flex gap-2 flex-wrap">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActive(t.key as TabKey)}
                    className={clsx(
                      "px-4 py-1 border-2 text-xl active:translate-y-1",
                      active === t.key
                        ? "bg-[#FFF] text-[#262626]"
                        : "cursor-pointer hover:bg-white/10"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            {tabs.find((t) => t.key === active)?.body}
          </div>
        </div>
      )}
    </>
  );
}
