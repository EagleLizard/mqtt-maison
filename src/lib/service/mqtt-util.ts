
export const mqttUtil = {
  parsePayload,
} as const;

function parsePayload(buf: Buffer): unknown | string {
  let payloadStr = buf.toString();
  let payload: unknown | string;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    payload = payloadStr;
  }
  return payload;
}
