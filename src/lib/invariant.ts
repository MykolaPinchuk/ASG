export class InvariantError extends Error {
  override name = "InvariantError";
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (condition) return;
  throw new InvariantError(message);
}

