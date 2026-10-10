import test from "node:test";
import assert from "node:assert/strict";
import { publishGraphPost, validateFacebookImage } from "../src/services/facebook-graph";

test("image download rejects fake MIME, empty files and unsupported types", async () => {
  const original = globalThis.fetch;
  try {
    for (const [body, type] of [["<html>not a photo</html>", "image/jpeg"], ["", "image/png"], ["webp", "image/webp"]]) {
      globalThis.fetch = async () => new Response(body, { headers: { "content-type": type } });
      await assert.rejects(validateFacebookImage("https://images.example.test/photo"), /FACEBOOK_IMAGE_INVALID/);
    }
  } finally { globalThis.fetch = original; }
});

test("Facebook receives verified photo bytes as multipart source, not an external URL", async () => {
  const original = globalThis.fetch;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  process.env.META_PAGE_ACCESS_TOKEN = "test-token";
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  let writes = 0;
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://images.example.test")) return new Response(bytes, { headers: { "content-type": "image/png" } });
      if (init?.method === "POST") {
        writes++;
        assert.match(String(url), /\/photos$/);
        assert.ok(init.body instanceof FormData);
        assert.equal(init.body.has("url"), false);
        assert.equal(init.body.get("caption"), "اختبار الصورة");
        const file = init.body.get("source") as File;
        assert.equal(file.type, "image/png"); assert.equal(file.size, bytes.length);
        return Response.json({ post_id: "qa-post" });
      }
      return Response.json({ access_token: "test-page-token" });
    };
    assert.equal((await publishGraphPost({ pageId: "qa-page", content: "اختبار الصورة", imageUrl: "https://images.example.test/photo" }, false)).id, "qa-post");
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = original;
    if (token === undefined) delete process.env.META_PAGE_ACCESS_TOKEN; else process.env.META_PAGE_ACCESS_TOKEN = token;
  }
});

test("image download validates bytes and fetches actual content without redirects", async () => {
  const original = globalThis.fetch;
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
      return new Response(bytes, { headers: { "content-type": "image/png" } });
    };
    const image = await validateFacebookImage("https://images.example.test/photo");
    assert.equal(image.type, "image/png"); assert.equal(image.size, bytes.length);
    for (const url of ["http://images.example.test/photo", "https://127.0.0.1/photo", "https://localhost/photo"]) {
      await assert.rejects(validateFacebookImage(url), /FACEBOOK_IMAGE_INVALID/);
    }
  } finally { globalThis.fetch = original; }
});
