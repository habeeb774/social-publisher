import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { deflateSync } from "node:zlib";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLogs, campaigns, facebookPages, mediaAssets, postMedia, posts } from "@/db/schema";
import { getPlanRange } from "@/content/ai-automation-90d";

export const runtime = "nodejs";
export const maxDuration = 60;

const CAMPAIGN_NAME = "AI Automation — 90 يوم";
const PAGE_FACEBOOK_ID = "1330947143441946";
const POSTS_PER_BATCH = 10;
const TOTAL_POSTS = 180;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function riyadhDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function scheduleAt(startDate: string, index: number) {
  const dayOffset = Math.floor(index / 2);
  const time = index % 2 === 0 ? "11:00:00" : "20:00:00";
  return new Date(addDays(startDate, dayOffset) + "T" + time + "+03:00");
}

function hashText(value: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type RGB = [number, number, number];

function clamp(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function createCanvas(width: number, height: number) {
  const pixels = new Uint8Array(width * height * 4);
  const blendPixel = (x: number, y: number, color: RGB, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return;
    const i = (y * width + x) * 4;
    const inv = 1 - alpha;
    pixels[i] = clamp(pixels[i] * inv + color[0] * alpha);
    pixels[i + 1] = clamp(pixels[i + 1] * inv + color[1] * alpha);
    pixels[i + 2] = clamp(pixels[i + 2] * inv + color[2] * alpha);
    pixels[i + 3] = 255;
  };
  const fillBackground = (top: RGB, bottom: RGB) => {
    for (let y = 0; y < height; y += 1) {
      const t = y / Math.max(1, height - 1);
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const edge = Math.abs(x / width - 0.5) * 2;
        pixels[i] = clamp(mix(top[0], bottom[0], t) - edge * 4);
        pixels[i + 1] = clamp(mix(top[1], bottom[1], t) - edge * 5);
        pixels[i + 2] = clamp(mix(top[2], bottom[2], t) - edge * 2);
        pixels[i + 3] = 255;
      }
    }
  };
  const circle = (cx: number, cy: number, radius: number, color: RGB, alpha: number) => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
          const fade = 1 - Math.sqrt(d2) / radius;
          blendPixel(x, y, color, alpha * fade * fade);
        }
      }
    }
  };
  const solidCircle = (cx: number, cy: number, radius: number, color: RGB, alpha: number) => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) blendPixel(x, y, color, alpha);
      }
    }
  };
  const rect = (x0: number, y0: number, w: number, h: number, color: RGB, alpha: number) => {
    const fromX = Math.max(0, Math.floor(x0));
    const toX = Math.min(width, Math.ceil(x0 + w));
    const fromY = Math.max(0, Math.floor(y0));
    const toY = Math.min(height, Math.ceil(y0 + h));
    for (let y = fromY; y < toY; y += 1) {
      for (let x = fromX; x < toX; x += 1) blendPixel(x, y, color, alpha);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, color: RGB, alpha: number, thickness = 2) => {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - x);
    const sx = x < tx ? 1 : -1;
    const dy = -Math.abs(ty - y);
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    while (true) {
      solidCircle(x, y, Math.max(1, thickness), color, alpha);
      if (x === tx && y === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  };
  return { pixels, fillBackground, circle, solidCircle, rect, line };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, pixels: Uint8Array) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 7 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function visualFor(seedText: string, variant: number) {
  const width = 720;
  const height = 900;
  const seed = hashText(seedText + ":" + variant);
  const random = rng(seed);
  const palettes: Array<{ accent: RGB; accent2: RGB }> = [
    { accent: [0, 212, 255], accent2: [55, 111, 255] },
    { accent: [34, 211, 238], accent2: [124, 58, 237] },
    { accent: [45, 212, 191], accent2: [37, 99, 235] },
    { accent: [96, 165, 250], accent2: [168, 85, 247] },
    { accent: [14, 165, 233], accent2: [20, 184, 166] },
  ];
  const palette = palettes[seed % palettes.length];
  const c = createCanvas(width, height);
  c.fillBackground([5, 14, 28], [9, 28, 52]);

  c.circle(120 + random() * 80, 120 + random() * 130, 210 + random() * 80, palette.accent, 0.34);
  c.circle(590 - random() * 60, 720 - random() * 80, 260 + random() * 100, palette.accent2, 0.26);
  c.circle(520, 170, 130, [255, 255, 255], 0.035);

  const panelCount = 3 + (seed % 3);
  for (let i = 0; i < panelCount; i += 1) {
    const x = 70 + random() * 390;
    const y = 180 + random() * 480;
    const w = 150 + random() * 240;
    const h = 65 + random() * 120;
    c.rect(x, y, w, h, [255, 255, 255], 0.035 + random() * 0.03);
    c.rect(x + 16, y + 18, w * (0.35 + random() * 0.4), 5, palette.accent, 0.42);
    c.rect(x + 16, y + 33, w * (0.2 + random() * 0.55), 3, [255, 255, 255], 0.13);
  }

  const nodes: Array<[number, number]> = [];
  const nodeCount = 9 + (seed % 5);
  for (let i = 0; i < nodeCount; i += 1) nodes.push([90 + random() * 540, 130 + random() * 620]);
  for (let i = 1; i < nodes.length; i += 1) {
    const parent = Math.floor(random() * i);
    c.line(nodes[parent][0], nodes[parent][1], nodes[i][0], nodes[i][1], i % 2 ? palette.accent : palette.accent2, 0.22, 1);
  }
  nodes.forEach((node, i) => {
    c.solidCircle(node[0], node[1], 7 + (i % 3), [9, 20, 35], 0.95);
    c.solidCircle(node[0], node[1], 4 + (i % 2), i % 2 ? palette.accent : palette.accent2, 0.95);
    c.circle(node[0], node[1], 22 + (i % 4) * 4, i % 2 ? palette.accent : palette.accent2, 0.18);
  });

  for (let i = 0; i < 7; i += 1) {
    const y = 735 + i * 13;
    c.rect(80, y, 90 + random() * 280, 2, i % 2 ? palette.accent : palette.accent2, 0.13);
  }

  return encodePng(width, height, c.pixels);
}

async function resolveCampaignStart() {
  const db = getDb();
  const [latest] = await db.select({ scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(and(isNotNull(posts.scheduledAt), isNull(posts.deletedAt)))
    .orderBy(desc(posts.scheduledAt))
    .limit(1);
  const today = riyadhDate(new Date());
  const latestDate = latest?.scheduledAt ? riyadhDate(latest.scheduledAt) : today;
  const base = latestDate > today ? latestDate : today;
  return addDays(base, 1);
}

export async function GET(request: NextRequest) {
  if (!process.env.CONTENT_SEED_TOKEN || request.nextUrl.searchParams.get("token") !== process.env.CONTENT_SEED_TOKEN) return unauthorized();
  const fast = request.nextUrl.searchParams.get("fast") === "1";
  if (!fast && !process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN missing" }, { status: 503 });

  const all = request.nextUrl.searchParams.get("all") === "1";
  const batch = Number(request.nextUrl.searchParams.get("batch") ?? "0");
  if (!all && (!Number.isInteger(batch) || batch < 0 || batch >= Math.ceil(TOTAL_POSTS / POSTS_PER_BATCH))) {
    return NextResponse.json({ error: "Invalid batch" }, { status: 400 });
  }

  const db = getDb();
  const activePages = await db.select().from(facebookPages).where(eq(facebookPages.isActive, true)).limit(20);
  const page = activePages.find((item) => item.facebookPageId === PAGE_FACEBOOK_ID) ?? activePages[0];
  if (!page) return NextResponse.json({ error: "No active Facebook page found" }, { status: 409 });

  let [campaign] = await db.select().from(campaigns).where(eq(campaigns.name, CAMPAIGN_NAME)).limit(1);
  if (!campaign) {
    const startDate = await resolveCampaignStart();
    const [created] = await db.insert(campaigns).values({
      name: CAMPAIGN_NAME,
      description: "حملة محتوى احترافية عن الأتمتة والذكاء الاصطناعي لمدة 90 يوم، منشوران يوميًا مع صور 4:5.",
      startDate,
      endDate: addDays(startDate, 89),
      status: "active",
    }).returning();
    campaign = created;
  }

  const startDate = campaign.startDate ?? await resolveCampaignStart();
  const existing = await db.select({ tags: posts.tags }).from(posts)
    .where(and(eq(posts.campaignId, campaign.id), isNull(posts.deletedAt)));
  const existingIndexes = new Set<number>();
  for (const row of existing) {
    for (const tag of row.tags) {
      if (tag.startsWith("plan-index-")) {
        const n = Number(tag.slice("plan-index-".length));
        if (Number.isInteger(n)) existingIndexes.add(n - 1);
      }
    }
  }

  const startIndex = all ? 0 : batch * POSTS_PER_BATCH;
  const plan = getPlanRange(startIndex, all ? TOTAL_POSTS : POSTS_PER_BATCH);
  const created: Array<{ index: number; postId: string; scheduledAt: string; imageUrl: string }> = [];
  const skipped: number[] = [];

  for (const item of plan) {
    if (existingIndexes.has(item.index)) {
      skipped.push(item.index + 1);
      continue;
    }

    const scheduledAt = scheduleAt(startDate, item.index);
    let imageUrl = request.nextUrl.origin + "/api/campaign-image/" + String(item.index + 1);
    let storageKey: string | null = null;
    let imageSize: number | null = null;
    if (!fast) {
      const png = visualFor(item.category + ":" + item.title, item.index);
      const blob = await put(
        "campaigns/ai-automation-90d/post-" + String(item.index + 1).padStart(3, "0") + ".png",
        png,
        { access: "public", contentType: "image/png", addRandomSuffix: true }
      );
      imageUrl = blob.url;
      storageKey = blob.pathname;
      imageSize = png.length;
    }

    const [post] = await db.insert(posts).values({
      pageId: page.id,
      content: item.content,
      scheduledAt,
      timezone: "Asia/Riyadh",
      status: "scheduled",
      campaignId: campaign.id,
      category: item.category,
      tags: item.tags,
      inQueue: false,
    }).returning();

    await db.insert(postMedia).values({
      postId: post.id,
      type: "image",
      url: imageUrl,
      storageKey,
      mimeType: "image/png",
      size: imageSize,
    });

    await db.insert(mediaAssets).values({
      name: "AI Automation " + String(item.index + 1).padStart(3, "0") + ".png",
      url: imageUrl,
      storageKey,
      mimeType: "image/png",
      size: imageSize,
      source: "campaign-generator",
    }).onConflictDoNothing();

    created.push({
      index: item.index + 1,
      postId: post.id,
      scheduledAt: scheduledAt.toISOString(),
      imageUrl,
    });
  }

  await db.insert(activityLogs).values({
    action: "campaign.seed_batch",
    entityType: "campaign",
    entityId: campaign.id,
    metadata: {
      campaign: CAMPAIGN_NAME,
      batch,
      created: created.length,
      skipped: skipped.length,
      range: [startIndex + 1, all ? TOTAL_POSTS : Math.min(startIndex + POSTS_PER_BATCH, TOTAL_POSTS)],
    },
  });

  const totalNow = new Set([...existingIndexes, ...created.map((item) => item.index - 1)]).size;
  return NextResponse.json({
    ok: true,
    campaign: { id: campaign.id, name: campaign.name, startDate, endDate: campaign.endDate },
    batch,
    created,
    skipped,
    totalScheduledForCampaign: totalNow,
    remaining: Math.max(0, TOTAL_POSTS - totalNow),
    publishingEnabled: process.env.PUBLISHING_ENABLED === "true",
  });
}
