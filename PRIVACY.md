# Privacy Model

## Private
- Trader side, size, margin, leverage, entry price, and liquidation threshold.
- Unrealized PnL and health state before settlement.
- Liquidation eligibility until a check is finalized.

## Public
- Market configuration, collateral vault balances, oracle account, aggregate open interest, and final settlement.
- Deposits, withdrawals, and realized PnL transfers.

## Arcium Role
Arcium computes position checks, liquidation checks, and final PnL over encrypted trader state. The callback reveals only the settlement result needed by the Solana program.
