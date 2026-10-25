# ADR 0002 — Money representation and rounding

- Status: Accepted (Phase 0, 2026-10-25)

## Decision

- Every monetary value is stored as `{ amountMinor: integer, currency: 'GHS' }`. `amountMinor` is
  in the currency's minor unit (pesewas; 1 GHS = 100 pesewas) and must be a JS safe integer, which
  allows magnitudes up to about GHS 90 trillion.
- Arithmetic that multiplies or divides (rate × quantity, depreciation per month) uses **big.js**
  through an isolated constructor in `src/domain/money/decimal.ts`. Strict mode is on, so JS
  `number` inputs are rejected and binary floating point cannot leak into calculations.
- Rounding to minor units uses an explicit named mode. The default is **half away from zero**
  (`half-up`); `half-even` and `toward-zero` are available when a rule calls for them.
- Parsing user input rejects more decimal places than the currency allows. It never silently rounds.
- Combining different currencies throws `CurrencyMismatchError`. Only GHS is representable until
  an FX policy is approved.
- Depreciation (Phase 3) will compute the base monthly charge with decimals, round per period, and
  put the residual difference in the final period. Total depreciation then equals the depreciable
  basis exactly and never exceeds it.

## Why

- Integers are exact, cheap to sum, index and sort well in IndexedDB, and survive JSON backup
  unchanged. Decimal strings would need parsing everywhere, and floats are unacceptable.
- big.js is small, maintained, and enough for the precision we need. decimal.js adds features we
  don't use.

## Consequences

- UI and CSV layers convert with `parseMoney` / `toDecimalString` / `formatMoney` only.
- Currencies with 0 or 3 minor digits can be added by extending the currency table. The currency
  is always stored with the amount.
