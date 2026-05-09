# Arcium Private Perps

Private perpetual trading dapp for Solana and Arcium. The app separates trade intent from public settlement by giving users pages for opening positions, requesting risk checks, and settling PnL.

## Live Status

- Network: Solana devnet
- Program: `2HfWctJbtQTKFYnyLMHsmY5sGa3uAB6g4MVHSVWxCZ8G`
- Frontend: https://arciumprivateperps.vercel.app

## Fuller Dapp Flow

1. Connect a Solana wallet.
2. Open a private SOL/USDC position.
3. Request a private margin or liquidation check.
4. Settle final PnL when the result is ready.
5. Review the private workspace for local position drafts and explorer-confirmed receipts.

Every form sends a real wallet-signed transaction to the deployed program. The UI keeps the private trade draft in browser local storage and links it to the transaction signature so the user can verify the action on Solana Explorer without exposing full position details.

## How Arcium Is Used

Arcium is the confidential-computation layer for position, margin, liquidation, and PnL logic. Sensitive values such as side, size, leverage, margin, and liquidation thresholds are designed to be private inputs instead of readable account state.

The MVP program records explorer-verifiable action receipts. The privacy layer is structured so future Arcium computation can evaluate risk and settlement logic while revealing only the minimum public result needed by the market.

## Privacy Benefits

- Trader direction and position size do not need to be public.
- Margin health can be checked without revealing the full account.
- Liquidation targeting and copy-trading become harder.
- Final settlement can be verified without exposing every private input.

## Local Versus On-Chain Data

The transaction receipt is on-chain. The raw position draft shown in the private workspace is local to the browser and wallet. Clearing browser storage removes the local draft but does not remove the Solana transaction.

## Commands

```bash
yarn install
arcium build
arcium test
```
