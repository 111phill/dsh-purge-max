// #87: a maintenance.lock left behind by a killed process must not block every
// later backup / install / rollback. Windows reuses PIDs, so "the PID is alive"
// alone is not proof that a maintenance run is still going.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Maintenance } from "../lib/community.js";
import { removeTreeNoFollowSync } from "../lib/remove-tree.js";

// locked() 的判定阈值是 30 分钟；给它留足余量，避免测试机器时钟抖动。
const STALE = new Date(Date.now() - 45 * 60 * 1000);
const FRESH = new Date();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purge-stale-lock-"));
  const profile = path.join(root, "profiles", "desktop");
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "package.json"), "{}");
  const maintenance = new Maintenance({ home: root, aiBase: "", profile });
  fs.mkdirSync(maintenance.base, { recursive: true });
  return {
    maintenance,
    lock: path.join(maintenance.base, "maintenance.lock"),
    close: () => removeTreeNoFollowSync(root),
  };
}

function plant(lock, contents, when) {
  fs.writeFileSync(lock, String(contents));
  fs.utimesSync(lock, when, when);
}

test("a lock written by a dead process is reclaimed", async () => {
  const f = fixture();
  try {
    // 4194304 超出常见 PID 范围：process.kill 会 ESRCH。
    plant(f.lock, 4194304, STALE);
    assert.equal(await f.maintenance.locked(async () => "ran"), "ran");
    assert.equal(fs.existsSync(f.lock), false, "用完后锁必须删除");
  } finally {
    f.close();
  }
});

test("a live writer with a fresh lock still blocks", async () => {
  const f = fixture();
  try {
    plant(f.lock, process.ppid, FRESH);
    await assert.rejects(
      () => f.maintenance.locked(async () => "ran"),
      /已有维护操作或遗留锁/,
    );
    assert.equal(fs.existsSync(f.lock), true, "真并发时不能删别人的锁");
  } finally {
    f.close();
  }
});

test("a reused PID cannot keep a stale lock alive forever", async () => {
  const f = fixture();
  try {
    // 进程还活着，但锁已经放了 45 分钟：占用者只可能是被复用的 PID。
    plant(f.lock, process.ppid, STALE);
    assert.equal(await f.maintenance.locked(async () => "ran"), "ran");
  } finally {
    f.close();
  }
});

test("an unreadable PID in the lock is treated as stale", async () => {
  const f = fixture();
  try {
    plant(f.lock, "not-a-pid", FRESH);
    assert.equal(await f.maintenance.locked(async () => "ran"), "ran");
  } finally {
    f.close();
  }
});

test("the same process re-entering its own lock is still refused", async () => {
  const f = fixture();
  try {
    plant(f.lock, process.pid, FRESH);
    await assert.rejects(
      () => f.maintenance.locked(async () => "ran"),
      /已有维护操作或遗留锁/,
    );
  } finally {
    f.close();
  }
});

test("locked() removes the lock even when the body throws", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      () => f.maintenance.locked(async () => { throw Error("boom"); }),
      /boom/,
    );
    assert.equal(fs.existsSync(f.lock), false);
  } finally {
    f.close();
  }
});
