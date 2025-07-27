const API = process.env.NEXT_PUBLIC_API_URL;
console.log("API endpoint =>", API);

export async function fetchTraits(): Promise<string[]> {
  const res = await fetch(`${API}/utils/layerorder.json`);
  const data = await res.json();
  return data;
}

export async function fetchTraitImages(trait: string): Promise<string[]> {
  const res = await fetch(`${API}/api/layers/${trait}`);
  const data: { files: string[] } = await res.json();
  console.log(data.files);
  return data.files;
}
