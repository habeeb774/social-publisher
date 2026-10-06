import { GET } from "../src/app/api/campaign-image/[index]/route";
const bad: string[] = [];
for (let i = 1; i <= 180; i++) {
  try {
    const res = await GET(new Request("http://x/"), { params: Promise.resolve({ index: String(i) }) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) bad.push(`${i}: ${buf.length}B`);
  } catch (e) { bad.push(`${i}: ${(e as Error).message.slice(0, 120)}`); }
}
console.log(JSON.stringify({ bad: bad.length, list: bad }, null, 1));
