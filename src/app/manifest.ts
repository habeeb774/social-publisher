import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Social Publisher",
    short_name: "Publisher",
    description: "منصة جدولة ونشر المحتوى",
    start_url: "/dashboard",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#635bff",
    icons: [{ src: "/brand/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/brand/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
