export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function positiveInt(value: string | undefined, name: string, max: number): number {
  if (!value || !/^\d+$/.test(value)) throw new ValidationError(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ValidationError(`${name} must be between 1 and ${max}.`);
  }
  return parsed;
}

export function boundedInt(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^-?\d+$/.test(value)) throw new ValidationError(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function position(value: string | undefined): string {
  const normalized = (value || 'MID').toUpperCase();
  if (!['GKP', 'DEF', 'MID', 'FWD'].includes(normalized)) {
    throw new ValidationError('position must be one of GKP, DEF, MID, or FWD.');
  }
  return normalized;
}
