# Deployment

```bash
yarn install
arcium build
arcium test
solana config set --url devnet --keypair ~/.config/solana/arcium-rtg-deployer.json
arcium deploy --cluster-offset 456 --recovery-set-size 4 --rpc-url https://api.devnet.solana.com
```

The v1 devnet market is isolated-margin only and should be treated as a technical MVP, not a production trading venue.
