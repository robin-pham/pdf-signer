/**
 * Where the signature dialog remembers recent signatures and the typed name.
 * Any object with `load()` and `save(state)` works; this one uses localStorage and
 * quietly does nothing where storage is unavailable (private windows, blocked cookies).
 *
 * @typedef {{ signatures: { src: string, aspect: number }[], name: string }} SignerState
 * @returns {{ load(): SignerState, save(state: SignerState): void }}
 */
export function localStore(key = 'pdf-signer') {
  return {
    load() {
      try {
        return { signatures: [], name: '', ...JSON.parse(localStorage.getItem(key)) };
      } catch {
        return { signatures: [], name: '' };
      }
    },
    save(state) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage unavailable or full; signatures just won't be remembered.
      }
    },
  };
}
