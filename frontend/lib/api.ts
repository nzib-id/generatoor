const baseUrl = process.env.NEXT_PUBLIC_API_URL;
console.log("API endpoint =>", baseUrl);

export type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string;
};

// === FETCH TRAITS ===
export async function fetchTraits(): Promise<TraitType[]> {
  const res = await fetch(`${baseUrl}/api/traits`);
  if (!res.ok) throw new Error("Failed to fetch traits");
  return res.json();
}

// === FETCH TRAIT IMAGES ===
export async function fetchTraitImages(trait: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/layers/${trait}`);
  if (!res.ok) throw new Error("Failed to fetch trait images");
  const data: { files: string[] } = await res.json();
  return data.files;
}

// === FETCH RULES (weights, showto, dll) ===
export async function fetchRules() {
  const res = await fetch(`${baseUrl}/api/rules`);
  if (!res.ok) throw new Error("Failed to fetch rules");
  return res.json();
}

// === SAVE RULES (BUENO STYLE) ===
// Kirim langsung raw weights tanpa konversi ke jumlah NFT.
export async function saveRules(data: {
  weights: Record<string, Record<string, number>>;
}) {
  const res = await fetch(`${baseUrl}/api/save-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("❌ saveRules failed:", errText);
    throw new Error("Failed to save rules");
  }

  return res.json();
}

/** === CUSTOM TOKENS API === */
export async function listCustomTokens() {
  const res = await fetch(`${baseUrl}/api/custom-tokens`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("listCustomTokens failed");
  return res.json();
}

export async function uploadCustomToken({
  file,
  name,
  include = true,
  trait_type,
  description,
  attributes,
}: {
  file: File;
  name: string;
  include?: boolean;
  trait_type?: string;
  description?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}) {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("name", name);
  fd.append("include", String(include));
  if (trait_type) fd.append("trait_type", trait_type);
  if (description) fd.append("description", description);
  if (attributes?.length) fd.append("attributes", JSON.stringify(attributes));

  const res = await fetch(`${baseUrl}/api/custom-tokens`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error("uploadCustomToken failed");
  return res.json();
}

export async function updateCustomToken(
  id: string,
  payload: Partial<{ include: boolean; name: string; trait_type: string }>
) {
  const res = await fetch(`${baseUrl}/api/custom-tokens/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("updateCustomToken failed");
  return res.json();
}

export async function deleteCustomToken(id: string) {
  const res = await fetch(`${baseUrl}/api/custom-tokens/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("deleteCustomToken failed");
  return res.json();
}
