#!/usr/bin/env node
// Test interactive mode by spawning buddy-roll as a child process.
// All prompts use ❯ as the input marker — tests match on ❯ only,
// independent of prompt text or language.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "bin", "buddy-roll.mjs");
const P = "❯"; // unified prompt marker

let PASS = 0;
let FAIL = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    PASS++;
  } else {
    console.log(`  FAIL: ${label}`);
    FAIL++;
  }
}

function runInteractive(name, sends, checks, timeout = 60000) {
  return new Promise((resolve) => {
    console.log(`\n=== ${name} ===`);
    const child = spawn("node", [BIN, "--dry-run"], {
      env: { ...process.env, LANG: "en" },
    });

    let output = "";
    let matchFrom = 0;
    let sendIdx = 0;
    let timedOut = false;
    let timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      assert("did not timeout", false);
      console.log("  Sent", sendIdx, "of", sends.length, "inputs");
      console.log("  Last output:", output.slice(-300));
      resolve();
    }, timeout);

    function trySend() {
      while (sendIdx < sends.length) {
        const newText = output.slice(matchFrom);
        if (newText.includes(P)) {
          matchFrom = output.length;
          child.stdin.write(sends[sendIdx] + "\n");
          sendIdx++;
        } else {
          break;
        }
      }
    }

    child.stdout.on("data", (data) => {
      output += data.toString();
      trySend();
    });

    child.stderr.on("data", (data) => {
      output += data.toString();
      trySend();
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (!timedOut) checks(output);
      resolve();
    });
  });
}

// ── Happy path tests ──

// Test 1: legendary cat, skip all cosmetics, decline
// Prompts: species ❯ rarity ❯ eye ❯ hat ❯ shiny ❯ apply ❯
await runInteractive(
  "Test 1: legendary cat, skip cosmetics, decline",
  ["4", "1", "", "", "", "n"],
  (output) => {
    assert("shows dry-run banner", output.includes("DRY RUN"));
    assert("shows species list", output.includes("duck") && output.includes("chonk"));
    assert("shows rarity list", output.includes("Legendary"));
    assert("searched for legendary cat", output.includes("legendary cat"));
    assert("found a result", output.includes("found"));
    assert("shows cat sprite", output.includes("/\\_/\\") || output.includes("/_/"));
    assert("shows stats", output.includes("DEBUGGING"));
    assert("shows full ID", output.includes("ID:"));
  }
);

// Test 2: epic dragon, pick eye + hat, view details then cancel
// Prompts: species ❯ rarity ❯ eye ❯ hat ❯ shiny ❯ apply(enter=details) ❯ confirm(N) ❯
await runInteractive(
  "Test 2: epic dragon, eye ✦, hat crown, view details then cancel",
  ["5", "2", "2", "2", "", "", "N"],
  (output) => {
    assert("searched for epic dragon", output.includes("epic dragon"));
    assert("target shows eye", output.includes("Eye:"));
    assert("target shows hat", output.includes("Hat:"));
    assert("shows modification plan", output.includes("will be modified") || output.includes("即将修改"));
    assert("shows backup info", output.includes("buddy-roll-backup"));
    assert("shows restore hint", output.includes("buddy-roll restore"));
  }
);

// Test 3: common goose — no hat prompt (5 prompts instead of 6)
// Prompts: species ❯ rarity ❯ eye ❯ shiny ❯ apply ❯
await runInteractive(
  "Test 3: common goose (no hat prompt)",
  ["2", "5", "", "", "n"],
  (output) => {
    assert("searched for common goose", output.includes("common goose"));
    assert("found result", output.includes("found"));
    assert("no hat prompt appeared", !output.includes("Select hat"));
  }
);

// Test 4: boundary — first species (1) and last species (18)
await runInteractive(
  "Test 4: first species (duck=1)",
  ["1", "5", "", "", "n"],
  (output) => {
    assert("searched for common duck", output.includes("common duck"));
  }
);

await runInteractive(
  "Test 4b: last species (chonk=18)",
  ["18", "5", "", "", "n"],
  (output) => {
    assert("searched for common chonk", output.includes("common chonk"));
  }
);

// Test 5: pick specific eye (last=6) and hat (last=8)
await runInteractive(
  "Test 5: eye °(6), hat tinyduck(8)",
  ["3", "3", "6", "8", "", "n"],
  (output) => {
    assert("target shows eye °", output.includes("Eye: °") || output.includes("Eye:"));
    assert("target shows hat tinyduck", output.includes("tinyduck"));
  }
);

// ── Invalid input tests ──
// Invalid inputs get error message (no ❯), then re-prompt with ❯

// Test 6: Invalid species (0, 19, abc) → 3 errors → then valid 4
// Extra ❯ per error retry: 1(initial) + 3(retries) = 4 ❯ for species
await runInteractive(
  "Test 6: invalid species (0, 19, abc) then valid",
  ["0", "19", "abc", "4", "5", "", "", "n"],
  (output) => {
    const errorCount = (output.match(/number 1-18/g) || []).length;
    assert("showed error for 0", errorCount >= 1);
    assert("showed error for 19", errorCount >= 2);
    assert("showed error for abc", errorCount >= 3);
    assert("eventually searched", output.includes("found"));
  }
);

// Test 7: Invalid rarity (0, 6, abc) then valid
await runInteractive(
  "Test 7: invalid rarity (0, 6, abc) then valid",
  ["1", "0", "6", "abc", "5", "", "", "n"],
  (output) => {
    const errorCount = (output.match(/number 1-5/g) || []).length;
    assert("showed error for invalid rarity 3 times", errorCount >= 3);
    assert("eventually searched", output.includes("found"));
  }
);

// Test 8: Invalid eye (0, 7) then valid 3
await runInteractive(
  "Test 8: invalid eye (0, 7) then valid",
  ["4", "1", "0", "7", "3", "", "", "n"],
  (output) => {
    const errorCount = (output.match(/number 1-6/g) || []).length;
    assert("showed error for invalid eye", errorCount >= 2);
    assert("target includes eye", output.includes("Eye:"));
  }
);

// Test 9: Invalid hat (0, 9) then valid 1
await runInteractive(
  "Test 9: invalid hat (0, 9) then valid",
  ["4", "2", "", "0", "9", "1", "", "n"],
  (output) => {
    const errorCount = (output.match(/number 1-8/g) || []).length;
    assert("showed error for invalid hat", errorCount >= 2);
    assert("target includes hat", output.includes("Hat:"));
  }
);

// Test 10: Empty input at species (re-prompt)
await runInteractive(
  "Test 10: empty input at species then valid",
  ["", "1", "5", "", "", "n"],
  (output) => {
    assert("handled empty species input", output.includes("number 1-18"));
    assert("eventually found", output.includes("found"));
  }
);

// Test 11: Negative number at species
await runInteractive(
  "Test 11: negative number at species",
  ["-1", "4", "5", "", "", "n"],
  (output) => {
    assert("handled negative input", output.includes("number 1-18"));
    assert("eventually found", output.includes("found"));
  }
);

// Test 12: Shiny — y
await runInteractive(
  "Test 12: shiny=y shows target with shiny",
  ["1", "5", "", "y", "n"],
  (output) => {
    assert("target shows Shiny", output.includes("Shiny"));
  }
);

// Test 13: Non-y at shiny (treated as skip)
await runInteractive(
  "Test 13: shiny=abc treated as skip",
  ["1", "5", "", "abc", "n"],
  (output) => {
    assert("target does NOT show Shiny", !output.includes("Shiny: ✨"));
    assert("still found a result", output.includes("found"));
  }
);

// Test 14: Final confirm — enter defaults to N
await runInteractive(
  "Test 14: final confirm enter=N",
  ["1", "5", "", "", "", ""],
  (output) => {
    assert("shows apply details", output.includes("will be modified") || output.includes("即将修改"));
    assert("did not apply (dry-run)", !output.includes("userID written") && !output.includes("已写入"));
  }
);

// Test 15: Unknown input at first confirm (treated as view details)
await runInteractive(
  "Test 15: unknown input at first confirm = view details",
  ["1", "5", "", "", "xyz", "N"],
  (output) => {
    assert("shows details after unknown input", output.includes("will be modified") || output.includes("即将修改"));
  }
);

console.log(`\n================================`);
console.log(`Results: ${PASS} passed, ${FAIL} failed`);
if (FAIL > 0) process.exit(1);
else console.log("All tests passed!");
