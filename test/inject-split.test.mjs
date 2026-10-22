// 注入正文的标题是 "CTF Core Contract"，常量是全大写。
// 只按整行、忽略大小写比较：既不能因大小写而失效，也不能误伤正文里的同名词。
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRedteamInject, withoutCtfContract } from "../lib/identity.js";

const REAL = "前言段落\n\nCTF Core Contract\n\nCTF Scope and Evidence\n\n竞赛沙箱约定\n";

test("the real mixed-case heading is split off", () => {
  const { common, ctfTail } = splitRedteamInject(REAL);
  assert.equal(common.trim(), "前言段落");
  assert.match(ctfTail, /竞赛沙箱约定/);
});

test("user prose mentioning the words inline is untouched", () => {
  const prose = "我们的文档标题是 CTF Core Contract 这一节，下面解释它。";
  assert.equal(splitRedteamInject(prose).ctfTail, "");
  assert.equal(withoutCtfContract(prose), prose);
});

test("a fenced example is not treated as a structural marker", () => {
  const fenced = "前言\n\n```\nCTF Core Contract\n```\n\n后续正文\n";
  assert.equal(splitRedteamInject(fenced).ctfTail, "");
});
