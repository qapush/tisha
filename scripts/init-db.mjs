// Applies db/schema.sql to the database in DATABASE_URL.
// Usage:  DATABASE_URL="postgres://..." npm run db:init
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put it in .env.local or pass it inline.");
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

// Split on semicolons at end of line — good enough for this schema, which has
// no functions or dollar-quoted bodies.
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("--"));

for (const stmt of statements) {
  const label = stmt.split("\n")[0].slice(0, 70);
  try {
    await sql.query(stmt);
    console.log("ok  ", label);
  } catch (err) {
    console.error("FAIL", label, "\n     ", err.message);
    process.exit(1);
  }
}

console.log(`\nDone — ${statements.length} statements applied.`);
