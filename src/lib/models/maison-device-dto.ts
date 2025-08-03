
import { Static, Type } from '@sinclair/typebox';
import { MaisonDeviceSchema } from './maison-device';
import { tbUtil } from '../util/tb-util';

const MaisonDeviceDtoTSchema = Type.Composite([
  MaisonDeviceSchema.tschema,
  Type.Object({
    ezd_device_id: Type.Number(),
    created_at: Type.String(),
    modified_at: Type.String(),
  }),
]);

export type MaisonDeviceDto = Static<typeof MaisonDeviceDtoTSchema>;

export const MaisonDeviceDtoSchema = {
  parse: maisonDeviceDtoParse
} as const;

function maisonDeviceDtoParse(rawVal: unknown): MaisonDeviceDto {
  return tbUtil.decodeWithSchema(MaisonDeviceDtoTSchema, rawVal);
}
