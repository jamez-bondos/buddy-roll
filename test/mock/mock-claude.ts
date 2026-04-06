const args = Bun.argv.slice(2).join(" ");
console.log("MOCK_CLAUDE_CALLED");
console.log(`ARGS: ${args}`);
for (const [k, v] of Object.entries(Bun.env)) {
  if (k.startsWith("CLAUDE_") || k.startsWith("MY_")) {
    console.log(`ENV: ${k}=${v}`);
  }
}
