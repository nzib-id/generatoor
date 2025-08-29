export type Attribute = {
  trait_type: string;
  value: string | number | boolean | null;
};

export type TokenDetail = {
  token_id: number;
  name: string | null;
  image: string;
  attributes: Attribute[];
  hasMetadata?: boolean;
};

const API = process.env.NEXT_PUBLIC_API_URL!;

export async function fetchPage(
  page: number,
  size = 250
): Promise<TokenDetail[]> {
  const r = await fetch(`${API}/api/preview-index?page=${page}&size=${size}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Failed /api/preview-index p=${page}`);
  const data = await r.json();
  return (data.items || []) as TokenDetail[];
}

export async function loadAllGuess(
  totalGuess = 1500,
  size = 250
): Promise<TokenDetail[]> {
  const pages = Math.ceil(totalGuess / size);
  const all: TokenDetail[] = [];
  for (let p = 1; p <= pages; p++) {
    const items = await fetchPage(p, size);
    if (!items.length) break; // stop kalau page kosong
    all.push(...items);
  }
  all.sort((a, b) => a.token_id - b.token_id);
  return all;
}
