# Orders

## Behaviour

`panels/orders.ts` renders the fixed 6-slot order board. Each filled slot
lists its required goods with live availability (available over required,
highlighted in the error colour when short), its reward, an optional
countdown to expiry, a Fill button (disabled with a reason when it cannot be
filled), and a Reroll button showing its cost.

## Configuration

None; entirely driven by the orders view.

## Failure modes

- An order with no expiry timestamp renders with no timer, which is
  intentional — not every order need expire.
- A reroll cost of null currently renders as a zero-cost reroll. If free
  rerolls are a real game mechanic this is correct; if null should instead
  mean "reroll unavailable" the panel needs a small follow-up to disable the
  button in that case. Flagged for integration review since the exact
  semantics live in the shared package.

## Verification

Manual: mock slots in empty, fillable, unfillable, and expiring states and
confirm correct rendering and that the reroll and fill dispatches carry the
right slot index.
