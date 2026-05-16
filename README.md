# ArcStake Vault Dapp

A clean ArcStake-style dapp for Arc Testnet. Users connect an EVM wallet, choose USDC or EURC, lock tokens for a period, and see remaining days plus estimated profit.

## What this app does

- Connect wallet
- Switch/add Arc Testnet
- Support USDC and EURC vaults
- Show token balance
- Approve token spend
- Create lock vault
- Show active vaults with days left, unlock date, current profit, and profit at unlock
- Add TVL / reward pool from the UI
- Show TVL added separately from locked TVL
- Withdraw after unlock

## Add TVL / TVL đã add

The UI now has two top tasks:

1. **Add TVL**: transfers selected USDC/EURC from the connected wallet directly into the vault contract as surplus. This surplus is used as the reward pool.
2. **TVL đã add**: shows the surplus amount already added to the contract, calculated as `token balance of contract - total locked principal`.

This does not require redeploying the smart contract. It uses the ERC-20 `transfer()` function to send tokens to the deployed vault address.

The dashboard also shows:

- **Locked TVL**: principal currently locked by users.
- **TVL đã add**: surplus/reward pool added into the contract.
- **Total shown TVL**: locked TVL + TVL đã add.

## Important reward note

The smart contract calculates rewards by APR, but rewards are only payable if the vault contract has a funded reward pool. After deployment, send surplus testnet USDC/EURC into the vault contract if you want withdrawals with profit to succeed.

Example: users deposit 100 USDC principal. If the contract owes 1 USDC reward, the contract must hold 101 USDC total for that token. Otherwise `withdraw()` reverts with `REWARD_POOL_LOW`.

## Arc Testnet token addresses

- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`

Both are handled as 6-decimal ERC-20 assets in the frontend.

## 1. Deploy the smart contract

Use Remix for the fastest path.

1. Open https://remix.ethereum.org/
2. Create a new file: `ArcStakeVault.sol`
3. Paste the content from `contracts/ArcStakeVault.sol`
4. Compile with Solidity `0.8.24` or newer
5. Connect MetaMask/Rabby to Arc Testnet
6. Deploy with constructor arguments:

```txt
usdc = 0x3600000000000000000000000000000000000000
eurc = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
```
## Testnet tokens faucet

The UI includes a **Faucet Testnet Tokens** link in the top navigation and an **Open Faucet** card in the rewards panel. Both open:

```txt
https://faucet.circle.com/
```
Use the faucet to request Arc Testnet USDC or EURC, then return to the app and refresh the wallet balance.

## UI tabs

The app now has two main tabs:

- **Vaults**: create/add a new USDC or EURC lock vault, choose lock period, approve token, add vault, and optionally add reward TVL to the contract.
- **Portfolio**: view positions already added by the connected wallet, including status, locked amount, days left, unlock date, current profit, estimated profit, and withdraw action after unlock.
