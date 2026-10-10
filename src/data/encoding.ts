// The BLOB encoding of one day of samples (hr_days, steps_days). Pure functions, no I/O.
//
// A day is two parallel arrays, sorted by offset (second of the UTC day, 0 to 86,399):
//   offsets  delta-encoded unsigned varints (LEB128): the first offset as it is, then each gap to the one before.
//            Heart rate arrives every 1 to 5 s, so nearly every gap is one byte.
//   values   heart rate: one uint8 per sample (bpm fits; `SAMPLE_CODEC.hr` clamps at 255).
//            steps: one unsigned varint per sample. A minute's steps can pass 255 (a sprint, or a long interval
//            from the API spread over a few minutes), so uint8 would lose data; a varint is one byte up to 127.
// Pulse stored these as Postgres integer[] and smallint[] (4 and 2 bytes each plus array overhead).

export type Codec = { encode(values: number[]): Uint8Array; decode(bytes: Uint8Array): number[] };

function writeVarint(out: Uint8Array, at: number, n: number): number {
  // Arithmetic, not bit operations: a bit shift would wrap above 2^31.
  while (n >= 128) {
    out[at++] = (n % 128) | 128;
    n = Math.floor(n / 128);
  }
  out[at++] = n;
  return at;
}

function readVarints(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let n = 0;
  let scale = 1;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    n += (b & 127) * scale;
    if (b & 128) {
      scale *= 128;
    } else {
      out.push(n);
      n = 0;
      scale = 1;
    }
  }
  if (scale !== 1) throw new RangeError("truncated varint");
  return out;
}

const whole = (n: number, what: string) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer, got ${n}`);
  return n;
};

/** Offsets must be ascending (equal neighbours are allowed here; the repository never stores them). */
export function encodeOffsets(offsets: number[]): Uint8Array {
  const buf = new Uint8Array(offsets.length * 8); // a varint of a safe integer takes at most 8 bytes
  let at = 0;
  let prev = 0;
  for (const o of offsets) {
    whole(o, "offset");
    if (o < prev) throw new RangeError("offsets must be sorted");
    at = writeVarint(buf, at, o - prev);
    prev = o;
  }
  return buf.slice(0, at);
}

export function decodeOffsets(bytes: Uint8Array): number[] {
  const out = readVarints(bytes);
  for (let i = 1; i < out.length; i++) out[i] += out[i - 1];
  return out;
}

export const u8: Codec = {
  encode(values) {
    const out = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!Number.isInteger(v) || v < 0 || v > 255) throw new RangeError(`uint8 value out of range: ${v}`);
      out[i] = v;
    }
    return out;
  },
  decode: (bytes) => Array.from(bytes),
};

export const varint: Codec = {
  encode(values) {
    const buf = new Uint8Array(values.length * 8);
    let at = 0;
    for (const v of values) at = writeVarint(buf, at, whole(v, "value"));
    return buf.slice(0, at);
  },
  decode: readVarints,
};

/** One day's arrays as the two BLOBs, and back. */
export function encodeDay(codec: Codec, offsets: number[], values: number[]): { offsets: Uint8Array; values: Uint8Array } {
  if (offsets.length !== values.length) throw new RangeError("offsets and values differ in length");
  return { offsets: encodeOffsets(offsets), values: codec.encode(values) };
}

export function decodeDay(codec: Codec, offsets: Uint8Array, values: Uint8Array): { offsets: number[]; values: number[] } {
  const o = decodeOffsets(offsets);
  const v = codec.decode(values);
  if (o.length !== v.length) throw new RangeError(`corrupt day: ${o.length} offsets, ${v.length} values`);
  return { offsets: o, values: v };
}
