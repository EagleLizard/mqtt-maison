
export const prim = {
  isObject,
  isString,
} as const;

function isObject(val: unknown): val is Record<string | number, unknown> {
  return (
    (val !== null)
    && ((typeof val) === 'object')
  );
}

function isString(val: unknown): val is string {
  return (typeof val) === 'string';
}
