import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "..", "AI-TFES");
const target = join(root, "content", "ai-tfes");

if (!existsSync(source)) {
  console.warn("AI-TFES source not found, skipping sync:", source);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("Synced AI-TFES ->", target);
