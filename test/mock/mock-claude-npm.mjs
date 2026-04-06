#!/usr/bin/env node
console.log("MOCK_CLAUDE_CALLED");
console.log("ARGS:", process.argv.slice(2).join(" "));
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith("CLAUDE_") || k.startsWith("MY_")) {
    console.log(`ENV: ${k}=${v}`);
  }
}
