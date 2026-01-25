export class PRNG {
  private state: number;

  constructor(seed: number) {
    const s = seed >>> 0;
    this.state = s === 0 ? 0x6d2b79f5 : s;
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat01(): number {
    return this.nextUint32() / 0xffffffff;
  }

  bool(): boolean {
    return (this.nextUint32() & 1) === 1;
  }

  intInclusive(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("intInclusive bounds must be finite");
    if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error("intInclusive bounds must be integers");
    if (max < min) throw new Error("intInclusive max must be >= min");

    const range = max - min + 1;
    const r = this.nextUint32();
    return min + (r % range);
  }
}

