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
// 超出常见 PID 范围：process.kill 会 ESRCH。
const DEAD_PID = 4194304;

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

test("a lock written by a dead process is reclaimed even when it looks fresh", async () => {
  const f = fixture();
  try {
    // 崩溃往往就发生在刚刚：只靠 mtime 超龄不够，必须能认出"写者已不在"。
    plant(f.lock, DEAD_PID, FRESH);
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
    // 进程还活着，但锁已经 45 分钟没人续命：占用者只可能是被复用的 PID。
    plant(f.lock, process.ppid, STALE);
    assert.equal(await f.maintenance.locked(async () => "ran"), "ran");
  } finally {
    f.close();
  }
});

test("a stale lock carrying this very PID is reclaimed", async () => {
  const f = fixture();
  try {
    // 崩溃后重启，Windows 可能把同一个 PID 交给新进程：不能因为"就是我自己"
    // 就永久拒绝，否则 #87 的卡死会原样复现。
    plant(f.lock, process.pid, STALE);
    assert.equal(await f.maintenance.locked(async () => "ran"), "ran");
  } finally {
    f.close();
  }
});

test("this process re-entering its own fresh lock is still refused", async () => {
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

test("an unreadable fresh lock is not stolen", async () => {
  const f = fixture();
  try {
    // locked() 先 open 再写内容：这里模拟"刚创建还没写完"的窗口，
    // 读不懂内容 + 锁很新，不能当成遗留锁抢走。
    plant(f.lock, "not-a-pid", FRESH);
    await assert.rejects(
      () => f.maintenance.locked(async () => "ran"),
      /已有维护操作或遗留锁/,
    );
    assert.equal(fs.existsSync(f.lock), true);
  } finally {
    f.close();
  }
});

test("an unreadable stale lock is reclaimed", async () => {
  const f = fixture();
  try {
    plant(f.lock, "not-a-pid", STALE);
    assert.equal(await f.maintenance.locked(async () => "ran"), "ran");
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

test("a lock rewritten by someone else survives our release", async () => {
  const f = fixture();
  try {
    // 我们持锁期间锁被别人（回收者）换掉了：finally 不能无条件 unlink，
    // 否则会把别人的锁删掉，第三个写入者就能进来。
    await f.maintenance.locked(async () => {
      fs.writeFileSync(f.lock, "999999:someone-else");
    });
    assert.equal(fs.existsSync(f.lock), true, "别人的锁不能被我们释放掉");
    assert.equal(fs.readFileSync(f.lock, "utf8"), "999999:someone-else");
  } finally {
    f.close();
  }
});

test("the lock is actually held while the body runs", async () => {
  const f = fixture();
  try {
    // 只断言"跑过 + 事后删掉"会漏掉"回收了却没有重建锁"：必须在体内证明锁在。
    await f.maintenance.locked(async () => {
      const held = fs.readFileSync(f.lock, "utf8").trim();
      assert.match(held, /^[^:]+:\d+:[0-9a-f]{16}$/, "持锁期间必须是 host:pid:nonce");
      assert.throws(() => fs.writeFileSync(f.lock, "x", { flag: "wx" }), /EEXIST/);
    });
  } finally {
    f.close();
  }
});

test("a lock written on another host is not trusted on PID alone", async () => {
  const f = fixture();
  try {
    // WSL 与 Windows 可能共用同一个 .dsh：那边的 PID 在这边查不到，
    // 不能据此判定"写者已不在"，只能按 mtime 判断是否超龄。
    plant(f.lock, `${os.hostname()}-elsewhere:${process.ppid}:${"0".repeat(16)}`, FRESH);
    await assert.rejects(
      () => f.maintenance.locked(async () => "ran", { maxAgeMs: 60 * 1000 }),
      /已有维护操作或遗留锁/,
    );
    assert.equal(fs.existsSync(f.lock), true, "跨机的锁不能凭 PID 抢走");
  } finally {
    f.close();
  }
});

test("the heartbeat keeps a held lock fresh past the age limit", async () => {
  const f = fixture();
  const opts = { maxAgeMs: 150, heartbeatMs: 20 };
  try {
    await f.maintenance.locked(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      // 没有心跳的话，此刻 mtime 已经超过 maxAgeMs，第二个写入者会判定遗留并抢走。
      await assert.rejects(
        () => f.maintenance.locked(async () => "stolen", opts),
        /已有维护操作或遗留锁/,
      );
    }, opts);
  } finally {
    f.close();
  }
});

test("a synchronous body keeps the lock fresh by calling beat()", async () => {
  const f = fixture();
  const opts = { maxAgeMs: 150, heartbeatMs: 20 };
  try {
    // 快照与哈希是纯同步递归，事件循环被占死，定时器进不来：
    // 那种阶段只能靠循环里自己调 beat() 续命。
    await f.maintenance.locked(async () => {
      const until = Date.now() + 400;
      while (Date.now() < until) f.maintenance.beat();
      await assert.rejects(
        () => f.maintenance.locked(async () => "stolen", opts),
        /已有维护操作或遗留锁/,
      );
    }, opts);
  } finally {
    f.close();
  }
});
