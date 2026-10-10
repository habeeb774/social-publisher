import { mkdir, writeFile } from "node:fs/promises";
import { renderTechNewsCard } from "../src/services/tech-news-card";
const examples = [
  ["en", "AI coding agents generate more code, but not more software", "Ars Technica"],
  ["ar", "مايكروسوفت تطلق تحديثًا جديدًا لأدوات الإنتاجية وإدارة المهام", "البوابة العربية للأخبار التقنية"],
  ["mixed", "مايكروسوفت تطلق Microsoft 365 لتحسين أدوات العمل", "البوابة العربية للأخبار التقنية"],
];
await mkdir(".tmp/card-check",{recursive:true});
for (const [name,title,source] of examples) {
  const response = await renderTechNewsCard(title,source);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000 || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error("Invalid PNG");
  await writeFile(`.tmp/card-check/${name}.png`,bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}
