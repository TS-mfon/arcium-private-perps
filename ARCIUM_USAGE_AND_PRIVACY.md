# Arcium Usage and Privacy Benefits

## Project

Arcium Private Perps is a Solana dapp for confidential perpetual trading workflows. It focuses on reducing public leakage around trader intent, position size, direction, margin, and liquidation checks.

## How Arcium Is Used

The dapp is designed around Arcium confidential computation. Wallet authorization and action receipts happen on Solana, while sensitive trading inputs are treated as private data for Arcium-powered computation.

The intended Arcium flow is:

1. A trader connects a Solana wallet and chooses a market.
2. The trader prepares a private position or risk action. Direction, size, leverage, and strategy-sensitive values should not be published as readable state.
3. The frontend submits a wallet-signed Solana transaction to the deployed Arcium program, creating an explorer-verifiable action receipt.
4. Arcium confidential computation can evaluate position updates, margin requirements, liquidation eligibility, and PnL logic over private inputs.
5. Only the minimum public result needed for settlement should be revealed.

The deployed MVP includes a live Solana program instruction for wallet-signed action receipts. This proves user actions are real on-chain transactions while avoiding fake frontend state.

## Privacy Benefits

Public perpetual trading exposes trader intent. On a normal public ledger, other participants can inspect positions, copy profitable traders, target liquidation levels, and infer strategy from margin changes.

Using Arcium improves the design because:

- Position direction and size can remain confidential.
- Margin and liquidation checks can be computed without revealing the full position.
- Traders are less exposed to copy-trading and targeted liquidation attacks.
- Market makers can quote deeper liquidity without leaking inventory-sensitive information.
- Final PnL or settlement outputs can be verified without exposing every private input.

## Why This Matters

Perps are highly adversarial. Arcium gives the protocol a path to compute risk and settlement logic over private trading data instead of forcing traders to reveal their strategy to the entire market.
