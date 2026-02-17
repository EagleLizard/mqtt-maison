import { Static, Type } from '@sinclair/typebox';
import { tbUtil } from '../../util/tb-util';

const MnJobTSchema = Type.Object({
  id: Type.Number(),
  job_type: Type.String(),
  data: Type.Union([ Type.String(), Type.Null() ]),
  status: Type.String(),
  run_at: Type.String(),
  created_at: Type.String(),
  modified_at: Type.String(),
});
export type MnJob = Static<typeof MnJobTSchema>;

export const MnJob = {
  schema: MnJobTSchema,
  decode: function decodeMnJob(val: unknown): MnJob {
    return tbUtil.decodeWithSchema(this.schema, val);
  }
} as const;
