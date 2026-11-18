/** A lazy catalogue instance that survives section changes. */
export function createMusicSession({load, mount, visible, loading = () => {}, failed = () => {}}) {
  let active = false, destroyed = false, instance = null, data = null, pending = null;
  async function setActive(value) {
    if (destroyed) return;
    active = value;
    visible(active);
    if (!active) return;
    if (instance) { instance.refresh?.(); return; }
    loading();
    try {
      if (!data) {
        if (!pending) pending = Promise.resolve().then(load).then(result => { data = result; });
        const request = pending;
        try { await request; } finally { if (pending === request) pending = null; }
      }
      if (destroyed || !active || instance) return;
      instance = mount(data);
      instance.refresh?.();
    } catch (error) {
      if (!destroyed && active) failed(error);
    }
  }
  return {setActive, destroy() {
    if (destroyed) return;
    destroyed = true;
    instance?.destroy();
  }};
}
