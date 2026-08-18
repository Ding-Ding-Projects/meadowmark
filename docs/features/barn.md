# Barn

## Behaviour

`panels/barn.ts` lists every stored good with a Sell action (sells the full
current stock of that good), a capacity progress bar, and an Upgrade action.
When at maximum capacity, the Upgrade button is disabled with an explicit
reason rather than hidden.

## Configuration

None; entirely driven by the barn view.

## Failure modes

- Selling always sells the full displayed amount; there is no partial-sell
  quantity picker in this pass — a future enhancement would add a stepper.
- A null upgrade cost is the documented "no further upgrade" signal; any
  other falsy value such as zero is treated as a valid free upgrade.

## Verification

Manual: mock stock with a few goods, confirm the capacity bar fraction,
confirm Sell dispatches the sell action with the full stocked amount, confirm
Upgrade is disabled with a reason once the upgrade cost is null.

Evidence status: this is a prescribed manual procedure; no packaged barn
interaction or capture is recorded at `6e7760b`.

## Security considerations

Sell and upgrade requests are intents. The simulation remains authoritative for
stock, capacity, prices, and affordability; the UI must not mutate balances
directly or trust stale displayed values.

## Suggested articles

- [Factories](./factories.md)
- [Orders](./orders.md)
- [UI, engine, and shared integration](./integration-contract.md)
