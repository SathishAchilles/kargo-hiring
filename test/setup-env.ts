import { existsSync } from "node:fs";

// DB-backed tests read the local Supabase connection from .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
