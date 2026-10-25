import Big from 'big.js';

/**
 * Isolated decimal constructor for domain arithmetic. Strict mode rejects JS number inputs so
 * binary floating-point values cannot leak into financial calculations; pass strings instead.
 */
export const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 20;
Decimal.RM = Decimal.roundHalfUp;

export type Decimal = Big.Big;

export type RoundingMode = 'half-up' | 'half-even' | 'toward-zero';

export function toBigRoundingMode(mode: RoundingMode): Big.RoundingMode {
  switch (mode) {
    case 'half-up':
      return Decimal.roundHalfUp;
    case 'half-even':
      return Decimal.roundHalfEven;
    case 'toward-zero':
      return Decimal.roundDown;
  }
}
