
/* typebox utils */

import { Static, TSchema } from '@sinclair/typebox';
import { TransformDecodeCheckError, Value } from '@sinclair/typebox/value';
import { TypeCompiler } from '@sinclair/typebox/compiler';

export const tbUtil = {
  getSchemaDecodeFn: getSchemaDecodeFn,
  decodeWithSchema: decodeWithSchema,
} as const;

function decodeWithSchema<S extends TSchema>(tschema: S, rawVal: unknown): Static<S> {
  let decoded: Static<S>;
  try {
    decoded = Value.Decode(tschema, rawVal);
  } catch(e) {
    if(!(e instanceof TransformDecodeCheckError)) {
      throw e;
    }
    throw new Error(`${e.error.message}, path: ${e.error.path}`, { cause: e });
  }
  return decoded;
}

function getSchemaDecodeFn<S extends TSchema>(tschema: S): (rawVal: unknown) => Static<S> {
  let cSchema = TypeCompiler.Compile(tschema);
  return function schemaDecodeFn(rawVal: unknown) {
    let decoded: Static<S>;
    try {
      decoded = cSchema.Decode(rawVal);
    } catch(e) {
      if(!(e instanceof TransformDecodeCheckError)) {
        throw e;
      }
      throw new Error(`${e.error.message}, path: ${e.error.path}`, { cause: e });
    }
    return decoded;
  };
}
