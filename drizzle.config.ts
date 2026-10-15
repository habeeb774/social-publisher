import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: ["./src/db/schema.ts", "./src/db/movie-schema.ts", "./src/db/elon-news-schema.ts"], out: "./drizzle", dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL ?? "" } });
