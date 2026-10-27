export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class TransientDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "TransientDeliveryError";
  }
}

export class PermanentDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PermanentDeliveryError";
  }
}

export function shouldRetryDelivery(error: unknown): boolean {
  if (error instanceof PermanentDeliveryError) return false;
  if (error instanceof TransientDeliveryError) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("econnreset") || message.includes("etimedout") || message.includes("socket")) return true;
  }
  return false;
}
