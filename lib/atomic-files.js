/** Atomic replacement with ordinary POSIX permissions retained (issue #20). */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { hostFs } from "./extract-asar.js";

export function atomicFiles(fs = hostFs) {
  const fsp = fs.promises;
  const modeOf = (file, allowMissing = false) => {
    try { return fs.statSync(file).mode & 0o777; }
    catch (error) {
      if (allowMissing && error.code === "ENOENT") return undefined;
      throw error;
    }
  };
  const temporary = file => `${file}.${process.pid}.${randomUUID()}.tmp`;
  function atomicWriteSync(file, content, encoding = "utf8") {
    const mode = modeOf(file, true), tmp = temporary(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fs.writeFileSync(tmp, content, { encoding, mode, flag: "wx" });
      // writeFile's mode is masked by umask. Apply the exact previous rwx bits
      // before publication, preserving private configs as well as executables.
      if (mode !== undefined) fs.chmodSync(tmp, mode);
      fs.renameSync(tmp, file);
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch {}
      throw error;
    }
  }
  async function atomicWriteFile(file, content, encoding = "utf8") {
    const mode = modeOf(file, true), tmp = temporary(file);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    try {
      await fsp.writeFile(tmp, content, { encoding, mode, flag: "wx" });
      if (mode !== undefined) fs.chmodSync(tmp, mode);
      await fsp.rename(tmp, file);
    } catch (error) {
      try { await fsp.unlink(tmp); } catch {}
      throw error;
    }
  }
  function atomicCopyFileSync(src, dest) {
    const mode = modeOf(src), tmp = temporary(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.copyFileSync(src, tmp, constants.COPYFILE_EXCL);
      fs.chmodSync(tmp, mode);
      fs.renameSync(tmp, dest);
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch {}
      throw error;
    }
  }
  async function atomicCopyFile(src, dest) {
    const mode = modeOf(src), tmp = temporary(dest);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.copyFile(src, tmp, constants.COPYFILE_EXCL);
      fs.chmodSync(tmp, mode);
      await fsp.rename(tmp, dest);
    } catch (error) {
      try { await fsp.unlink(tmp); } catch {}
      throw error;
    }
  }
  return { atomicWriteSync, atomicWriteFile, atomicCopyFileSync, atomicCopyFile };
}

export const { atomicWriteSync, atomicWriteFile, atomicCopyFileSync, atomicCopyFile } = atomicFiles();
