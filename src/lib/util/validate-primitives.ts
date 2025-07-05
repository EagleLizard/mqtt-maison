
export const prim = {
  isObject,
} as const;

function isObject(val: unknown): val is Record<string | number, unknown> {
  return (
    (val !== null)
    && ((typeof val) === 'object')
  );
}
