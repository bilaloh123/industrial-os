// jsdom's test environment doesn't provide the global structuredClone
// that fake-indexeddb needs internally to clone stored values.
if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}
