import { describe, expect, it } from "vitest";
import { decodeDay, decodeOffsets, encodeDay, encodeOffsets, u8, varint } from "./encoding";

/** The largest day pulse can produce: a sample every 2.3 s is about 37,000 a day (the plan's figure). */
function fullDay(n = 37_000) {
  const offsets: number[] = [];
  const values: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += i % 7 === 0 ? 3 : 2; // gaps of 2 and 3 s, like the band's
    offsets.push(t);
    values.push(55 + ((i * 7) % 90)); // 55 to 144 bpm
  }
  return { offsets, values };
}

describe("encoding", () => {
  it("round-trips an empty day", () => {
    const e = encodeDay(u8, [], []);
    expect(e.offsets.length + e.values.length).toBe(0);
    expect(decodeDay(u8, e.offsets, e.values)).toEqual({ offsets: [], values: [] });
  });

  it("round-trips one sample, a sample at second 0 and at the last second of the day", () => {
    for (const offsets of [[0], [86_399], [0, 1, 86_399]]) {
      const values = offsets.map((_, i) => 60 + i);
      const e = encodeDay(u8, offsets, values);
      expect(decodeDay(u8, e.offsets, e.values)).toEqual({ offsets, values });
    }
  });

  it("round-trips the largest day, and a full heart-rate day takes about 1 byte per offset and 1 per value", () => {
    const { offsets, values } = fullDay();
    const e = encodeDay(u8, offsets, values);
    expect(decodeDay(u8, e.offsets, e.values)).toEqual({ offsets, values });
    expect(e.values.length).toBe(37_000);
    expect(e.offsets.length).toBe(37_000); // every gap is under 128: one byte
    // One byte per offset and per value: 2 bytes a sample, about 74 KB.
    expect(e.offsets.length + e.values.length).toBeLessThan(75_000);
  });

  it("uses more bytes for a gap of 128 s or more, and handles gaps across the whole day", () => {
    const offsets = [0, 127, 255, 300, 20_000, 86_399];
    const bytes = encodeOffsets(offsets);
    expect(bytes.length).toBe(1 + 1 + 2 + 1 + 3 + 3);
    expect(decodeOffsets(bytes)).toEqual(offsets);
  });

  it("keeps equal neighbours (a gap of 0) and rejects unsorted or invalid offsets", () => {
    expect(decodeOffsets(encodeOffsets([5, 5, 6]))).toEqual([5, 5, 6]);
    expect(() => encodeOffsets([5, 4])).toThrow(RangeError);
    expect(() => encodeOffsets([-1])).toThrow(RangeError);
    expect(() => encodeOffsets([1.5])).toThrow(RangeError);
  });

  it("uint8 values: 0 to 255, nothing else", () => {
    expect(u8.decode(u8.encode([0, 1, 255]))).toEqual([0, 1, 255]);
    expect(() => u8.encode([256])).toThrow(RangeError);
    expect(() => u8.encode([-1])).toThrow(RangeError);
  });

  it("varint values (steps) round-trip past 255, and a whole day of steps is small", () => {
    const values = [0, 1, 127, 128, 255, 256, 300, 16_383, 16_384, 2 ** 31, 2 ** 40];
    expect(varint.decode(varint.encode(values))).toEqual(values);
    const minutes = Array.from({ length: 1440 }, (_, i) => (i % 3 === 0 ? 0 : 20 + (i % 150)));
    const offsets = minutes.map((_, i) => i * 60);
    const e = encodeDay(varint, offsets, minutes);
    expect(decodeDay(varint, e.offsets, e.values)).toEqual({ offsets, values: minutes });
    expect(e.offsets.length + e.values.length).toBeLessThan(4_000);
  });

  it("rejects a truncated varint and a length mismatch", () => {
    expect(() => decodeOffsets(new Uint8Array([0x80]))).toThrow(RangeError);
    const e = encodeDay(u8, [1, 2], [3, 4]);
    expect(() => decodeDay(u8, e.offsets, new Uint8Array([1]))).toThrow(RangeError);
    expect(() => encodeDay(u8, [1], [])).toThrow(RangeError);
  });
});
