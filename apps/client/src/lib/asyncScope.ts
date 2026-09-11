/** Invalidates async work when its owning screen/session is replaced. */
export function createAsyncScope() {
  let generation = 0;
  return {
    capture() {
      const captured = generation;
      return () => captured === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}
