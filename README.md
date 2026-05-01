# Arcium Private Perps

An Arcium RTG developer submission for private perpetual trading on Solana.

## What It Builds
This repo contains an Arcium/Anchor project for private position computation. The intended v1 market is isolated-margin `SOL-PERP`: position side, size, leverage, margin, entry price, health, and liquidation threshold are encrypted inputs. Arcium computes risk and settlement privately, then returns only the verified result required by the public Solana program.

The current generated circuit is the buildable Arcium integration base. The perps domain layer is documented in `PRIVACY.md`, `DEPLOYMENT.md`, and the Vercel demo in `app/`.

## Privacy Benefit
Public perps leak trader intent and health. Private computation reduces copy-trading, targeted liquidation, and adversarial flow analysis.

## Arcium Flow
1. Trader encrypts position parameters.
2. Program queues an Arcium computation.
3. MPC nodes compute position/risk logic without seeing raw inputs.
4. Callback verifies output.
5. Program settles public vault effects only when the private check passes.

## Commands

```bash
yarn install
arcium build
arcium test
```

## RTG Notes
- Functional Solana/Arcium project scaffolded with `arcium init`.
- Open-source repo ready.
- English explanation included.
- Frontend demo included under `app/`.
