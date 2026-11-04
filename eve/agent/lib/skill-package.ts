// The emitted modules under agent/skills/ carry each skill package's data, so the built agent
// reads nothing from skills/ at run time. A sibling file that is not valid UTF-8 is emitted as
// base64 and decoded here when its module loads.

/** A sibling file's bytes from the base64 the emitter wrote. */
export function fromBase64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}
