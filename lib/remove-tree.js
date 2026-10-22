// Delete only directory entries, never the contents of symlinks / Windows junctions.
// A missing entry is idempotent; every other error is observable by the caller.
import fs from 'node:fs';
import path from 'node:path';

// Keep this function self-contained: raw bootstrap and detached uninstall helpers
// embed this exact body because they must survive removal of the installed package.
export function removeTreeNoFollowSync(target, options = {}) {
  const io = options.fs || fs;
  const root = path.resolve(target);
  if (root === path.parse(root).root) throw Error('Refusing to remove a filesystem root');
  const maxRetries = options.maxRetries ?? 0;
  const retryDelay = options.retryDelay ?? 100;
  const retryable = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']);
  const walk = file => {
    let stat;
    try { stat = io.lstatSync(file); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    // lstat must come before isDirectory: never stat / realpath a deletion target.
    try {
      if (stat.isSymbolicLink()) { io.unlinkSync(file); return; }
      if (stat.isDirectory()) {
        for (const name of io.readdirSync(file)) walk(path.join(file, name));
        io.rmdirSync(file); // Non-recursive: no native recursive rm fallback.
      } else io.unlinkSync(file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  for (let attempt = 0; ; attempt++) {
    try { walk(root); return; } catch (error) {
      if (error.code === 'ENOENT') return;
      if (attempt >= maxRetries || !retryable.has(error.code)) throw error;
      // Each retry re-lstats every remaining entry, including the root.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelay * (attempt + 1));
    }
  }
}

export async function removeTreeNoFollow(target, options = {}) {
  const io = (options.fs || fs).promises;
  const root = path.resolve(target);
  if (root === path.parse(root).root) throw Error('Refusing to remove a filesystem root');
  const retryable = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']);
  const walk = async file => {
    let stat;
    try { stat = await io.lstat(file); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    try {
      if (stat.isSymbolicLink()) { await io.unlink(file); return; }
      if (stat.isDirectory()) {
        for (const name of await io.readdir(file)) await walk(path.join(file, name));
        await io.rmdir(file);
      } else await io.unlink(file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  for (let attempt = 0; ; attempt++) {
    try { await walk(root); return; } catch (error) {
      if (error.code === 'ENOENT') return;
      if (attempt >= (options.maxRetries ?? 0) || !retryable.has(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, (options.retryDelay ?? 100) * (attempt + 1)));
    }
  }
}
