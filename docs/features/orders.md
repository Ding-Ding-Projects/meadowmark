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
- A null reroll cost renders the Reroll button as an explicit disabled
  "Reroll unavailable" state with a stated reason, never as a silent zero-
  cost reroll — a control that reads as free and then either charges or
  fails is exactly the decorative-UI defect the project treats as real
  rather than cosmetic.

## Verification

Manual: mock slots in empty, fillable, unfillable, and expiring states, plus
a slot with a null reroll cost, and confirm correct rendering (including the
disabled "Reroll unavailable" state) and that the reroll and fill dispatches
carry the right slot index.

Evidence status: this is a prescribed manual procedure; no packaged order-board
interaction or capture is recorded at `6e7760b`.

## Security considerations

The simulation must revalidate stock, reward, expiry, reroll cost, and slot
identity. Displayed eligibility is not authority to consume goods or grant
currency.

## Suggested articles

- [Barn](./barn.md)
- [Delivery vehicles](./delivery-vehicles.md)
- [Notifications](./notifications.md)
