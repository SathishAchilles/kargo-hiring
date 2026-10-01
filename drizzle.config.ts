import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["kargo_hiring"],
  // Locally the default bookkeeping table is fine. On a database shared with another app
  // (hosted Supabase), set MIGRATIONS_SCHEMA=kargo_hiring so this app's migrations are tracked in
  // their own table and never skipped because of another app's newer migration.
  ...(process.env.MIGRATIONS_SCHEMA
    ? { migrations: { schema: process.env.MIGRATIONS_SCHEMA, table: "__drizzle_migrations" } }
    : {}),
  dbCredentials: {
    // Migrations use the session pooler (:5432); the app uses the transaction pooler.
    url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? "",
  },
});
