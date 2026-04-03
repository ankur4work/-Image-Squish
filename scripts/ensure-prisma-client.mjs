import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const schemaPath = path.join(rootDir, "prisma", "schema.prisma");
const clientDir = path.join(rootDir, "node_modules", ".prisma", "client");
const clientEntryPath = path.join(clientDir, "index.js");

function removeStaleTmpFiles() {
  if (!fs.existsSync(clientDir)) return;

  for (const entry of fs.readdirSync(clientDir)) {
    if (entry.includes(".tmp")) {
      try {
        fs.rmSync(path.join(clientDir, entry), { force: true });
      } catch (error) {
        console.warn(`Could not remove stale Prisma temp file: ${entry}`, error);
      }
    }
  }
}

function shouldGenerate() {
  if (!fs.existsSync(clientEntryPath)) {
    return true;
  }

  const schemaStat = fs.statSync(schemaPath);
  const clientStat = fs.statSync(clientEntryPath);

  return schemaStat.mtimeMs > clientStat.mtimeMs;
}

removeStaleTmpFiles();

if (!shouldGenerate()) {
  console.log("Prisma client is up to date.");
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "generate"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
