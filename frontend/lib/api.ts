const baseUrl = process.env.NEXT_PUBLIC_API_URL;
console.log("API endpoint =>", baseUrl);

export type TraitType = {
  type: string;
  value: string;
  image: string;
  context?: string;
};

export async function fetchTraits(): Promise<TraitType[]> {
  const res = await fetch(`${baseUrl}/api/traits`);
  const data = await res.json();
  return data;
}

export async function fetchTraitImages(trait: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/layers/${trait}`);
  const data: { files: string[] } = await res.json();
  console.log(data.files);
  return data.files;
}

export async function fetchRules() {
  const res = await fetch(`${baseUrl}/api/rules`);
  return await res.json();
}

export async function saveRules(data: any) {
  const res = await fetch(`${baseUrl}/api/save-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return await res.json();
}

/** List custom tokens */
export async function listCustomTokens() {
  const res = await fetch(`${baseUrl}/api/custom-tokens`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("listCustomTokens failed");
  return res.json();
}

/** Upload custom token (image + name + trait_type) */
export async function uploadCustomToken({
  file,
  name,
  include = true,
  trait_type, // ← optional
  description, // ← optional
  attributes, // ← optional
}: {
  file: File;
  name: string;
  include?: boolean;
  trait_type?: string; // ← jadikan optional
  description?: string; // ← optional
  attributes?: Array<{ trait_type: string; value: string }>; // ← optional
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

/** Toggle include / edit name/trait_type */
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

/** Delete item */
export async function deleteCustomToken(id: string) {
  const res = await fetch(`${baseUrl}/api/custom-tokens/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("deleteCustomToken failed");
  return res.json();
}
