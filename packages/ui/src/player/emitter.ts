export class Emitter<E> {
  private readonly handlers = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(event: K, cb: (payload: E[K]) => void): () => void {
    const set = this.handlers.get(event) ?? new Set();
    this.handlers.set(event, set);
    set.add(cb as (payload: never) => void);
    return () => {
      set.delete(cb as (payload: never) => void);
    };
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    for (const cb of this.handlers.get(event) ?? []) (cb as (p: E[K]) => void)(payload);
  }
}
