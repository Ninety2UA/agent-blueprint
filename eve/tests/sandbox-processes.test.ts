// The straggler listing (ruling 59): the shapes ps printed on Vercel Sandbox and on Docker, fed to
// the parser as they came. The listing never counts itself; a real leftover is still found.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { LISTING, describeProcesses, listStragglers, listingCommand, maskArgs, stragglers } = await import("../agent/lib/sandbox-processes.ts");

const MARK = "ab-idle-0b6c2c8e-1f0e-4d4e-9a57-3c1d2e4f5a6b";
const rows = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("the listing command", () => {
  test("bash cannot exec ps in place: a command follows it, and the mark is on the shell", () => {
    const command = listingCommand(MARK);
    assert.equal(command, `bash -c ': ${MARK}; ${LISTING}; exit $?'`);
    assert.ok(command.indexOf(LISTING) < command.lastIndexOf("exit $?"), "ps is not the last command");
  });
});

describe("the straggler parser", () => {
  test("Vercel, old listing: bash exec'd ps in place, the row carries no mark (pid 1014); no straggler", () => {
    const vercel = rows("      1       0 /usr/local/bin/sandbox-init", `   1014       1 ${LISTING}`);
    assert.deepEqual(stragglers(vercel, MARK), []);
  });

  test("Vercel, new listing: the marked shell and its ps child; no straggler", () => {
    const vercel = rows("      1       0 /usr/local/bin/sandbox-init", `   1013       1 bash -c : ${MARK}; ${LISTING}; exit $?`, `   1014    1013 ${LISTING}`);
    assert.deepEqual(stragglers(vercel, MARK), []);
  });

  test("Docker: PID 1's keep-alive, the marked shell under docker exec, its ps; no straggler", () => {
    const docker = rows("      1       0 sleep 2147483647", `     57       0 bash -c : ${MARK}; ${LISTING}; exit $?`, `     63      57 ${LISTING}`);
    assert.deepEqual(stragglers(docker, MARK), []);
    const tini = rows("      1       0 /sbin/tini -- sleep 2147483647", "      7       1 sleep 2147483647", `     57       0 bash -c : ${MARK}; ${LISTING}`, `     63      57 ${LISTING}`);
    assert.deepEqual(stragglers(tini, MARK), [], "the old Docker shape too");
  });

  test("Daytona: the session shells, their keep-alives and Daytona's worker are the provider's; no straggler", () => {
    // As listed live on the Railway proof deploy, 2026-11-03: every command runs inside a Daytona
    // session (a bash under PID 1 with two bash children and tail -f /dev/null), and an earlier
    // session stays behind idle.
    const daytona = rows(
      "      1       0 /usr/local/bin/daytona sleep infinity",
      "     82       1 /usr/bin/bash",
      "     85       1 python3 /tmp/daytona_repl_worker.py",
      "    105      82 /usr/bin/bash",
      "    106      82 /usr/bin/bash",
      "    107      82 tail -f /dev/null",
      "    619       1 /usr/bin/bash",
      "    622     619 /usr/bin/bash",
      "    623     619 /usr/bin/bash",
      "    624     619 tail -f /dev/null",
      `    625     619 bash -c : ${MARK}; ${LISTING}; exit $?`,
      `    629     625 ${LISTING}`,
    );
    assert.deepEqual(stragglers(daytona, MARK), []);
  });

  test("Daytona: a real leftover inside or beside a session is still found", () => {
    const daytona = rows(
      "      1       0 /usr/local/bin/daytona sleep infinity",
      "     82       1 /usr/bin/bash",
      "    105      82 /usr/bin/bash",
      "    107      82 tail -f /dev/null",
      "    108      82 npm run dev",
      "    300       1 python -m http.server 8000",
      "    619       1 /usr/bin/bash",
      "    624     619 tail -f /dev/null",
      `    625     619 bash -c : ${MARK}; ${LISTING}; exit $?`,
      `    629     625 ${LISTING}`,
    );
    assert.deepEqual(stragglers(daytona, MARK).map((process) => process.pid).sort((a, b) => a - b), [82, 105, 107, 108, 300]);
  });

  test("a real leftover is still found, on either provider", () => {
    const vercel = rows("      1       0 /usr/local/bin/sandbox-init", "    880       1 python -m http.server 8000", `   1014       1 ${LISTING}`);
    assert.deepEqual(stragglers(vercel, MARK), [{ pid: 880, args: "python -m http.server 8000" }]);
    const docker = rows("      1       0 sleep 2147483647", "    412       1 node server.js", "    413     412 node worker.js", `     57       0 bash -c : ${MARK}; ${LISTING}; exit $?`, `     63      57 ${LISTING}`);
    assert.deepEqual(stragglers(docker, MARK).map((process) => process.pid), [412, 413]);
  });

  test("only the exact listing command is dropped: any other ps the run started still counts", () => {
    const listed = rows(
      "      1       0 sleep 2147483647",
      "    300       1 watch ps -eo pid,args",
      "    301     300 ps -eo pid,args",
      "    302       1 ps -eo pid=,ppid=,args= --forest",
      `    303       1 ${LISTING}`,
      `    304     303 sleep 60`,
    );
    // 303 has a child, so it is not a finished listing: it is the run's.
    assert.deepEqual(stragglers(listed, MARK).map((process) => process.pid), [300, 301, 302, 303, 304]);
  });

  test("descendants of the marked shell are its own whatever order ps prints them in", () => {
    const listed = rows("      1       0 sleep 2147483647", `     90      95 ${LISTING}`, `     95       0 bash -c : ${MARK}; ${LISTING}; exit $?`);
    assert.deepEqual(stragglers(listed, MARK), []);
  });
});

describe("what the person and the log see", () => {
  test("the reason lists at most three processes and counts the rest", () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ pid: 100 + n, args: `sleep ${n}` }));
    assert.equal(describeProcesses(many), "101 sleep 1; 102 sleep 2; 103 sleep 3; and 2 more");
    assert.equal(describeProcesses(many.slice(0, 1)), "101 sleep 1");
  });

  test("key-shaped values are masked", () => {
    const token = ["ghs", "_", "A1b2C3d4E5f6G7h8"].join("");
    const masked = maskArgs(`curl -H 'Authorization: Bearer ${token}' https://x-access-token:${token}@github.com/a/b token=${token}`);
    assert.ok(!masked.includes(token), masked);
  });

  test("a straggler logs the whole listing, masked and with the mark replaced; none logs nothing", async () => {
    const logged: unknown[][] = [];
    const info = console.info;
    console.info = (...args: unknown[]) => void logged.push(args);
    try {
      const output = (command: string) => {
        const mark = /: (ab-idle-[0-9a-f-]+);/.exec(command)?.[1] ?? "";
        return rows("      1       0 /usr/local/bin/sandbox-init", "    880       1 python -m http.server 8000", `   1013       1 bash -c : ${mark}; ${LISTING}; exit $?`, `   1014    1013 ${LISTING}`);
      };
      const found = await listStragglers(async (command) => ({ stdout: output(command) }), "test");
      assert.deepEqual(found.map((process) => process.pid), [880]);
      assert.equal(logged.length, 1);
      const [label, data] = logged[0] as [string, { stragglers: number[]; listing: string[] }];
      assert.equal(label, "[test] stragglers");
      assert.deepEqual(data.stragglers, [880]);
      assert.equal(data.listing.length, 4);
      assert.ok(data.listing.every((line) => !/ab-idle-[0-9a-f]/.test(line)), "the mark is not logged");

      logged.length = 0;
      const quiet = (command: string) => {
        const mark = /: (ab-idle-[0-9a-f-]+);/.exec(command)?.[1] ?? "";
        return rows("      1       0 sleep 2147483647", `     57       0 bash -c : ${mark}; ${LISTING}; exit $?`, `     63      57 ${LISTING}`);
      };
      assert.deepEqual(await listStragglers(async (command) => ({ stdout: quiet(command) }), "test"), []);
      assert.equal(logged.length, 0);
    } finally {
      console.info = info;
    }
  });
});
