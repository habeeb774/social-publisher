import { getDb } from "./index";
import { facebookPages, settings } from "./schema";

async function seed() {
  const db = getDb();
  await db.insert(facebookPages).values({ name: "Habeb Test Page", facebookPageId: "test-page-id" }).onConflictDoNothing();
  await db.insert(settings).values([{ key: "default_timezone", value: "Asia/Riyadh" }, { key: "publishing_enabled", value: "false" }]).onConflictDoNothing();
  console.log("Seed complete");
}
seed().catch((error) => { console.error(error); process.exit(1); });
