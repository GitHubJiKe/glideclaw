const target = process.argv[2];
if (!target) {
  console.error("Usage: bun run scripts/add-shebang.ts <file>");
  process.exit(1);
}

const file = Bun.file(target);
const text = await file.text();
const shebang = "#!/usr/bin/env bun\n";

if (text.startsWith("#!")) process.exit(0);
await Bun.write(file, shebang + text);

