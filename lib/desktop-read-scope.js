// Reuse filesystem evidence only within one read-only diagnostic operation.
// No process-lifetime identity/path cache: the next request must observe updates,
// deletions, permission failures and retargeted links without a manual reset.
import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage();
let generation = 0;
export function clearDesktopReadScope() { generation += 1; }
export function withDesktopReadScope(read) {
  if (storage.getStore()?.active) return read();
  const scope = { active: true, generation, values: new Map() };
  return storage.run(scope, () => {
    const close = () => { scope.active = false; scope.values.clear(); };
    try {
      const result = read();
      if (result && typeof result.then === "function") return Promise.resolve(result).finally(close);
      close();
      return result;
    } catch (error) { close(); throw error; }
  });
}
export function memoDesktopRead(namespace, key, read, cacheable = Boolean) {
  const scope = storage.getStore();
  if (!scope?.active) return read();
  if (scope.generation !== generation) {
    scope.values.clear(); scope.generation = generation;
  }
  let values = scope.values.get(namespace);
  if (!values) { values = new Map(); scope.values.set(namespace, values); }
  if (values.has(key)) return values.get(key);
  const value = read(); // Failures and unknown evidence are never cached.
  if (cacheable(value) && values.size < 8192) values.set(key, value);
  return value;
}
