import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Address,
} from 'viem';
import './styles.css';

const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_ID_HEX = '0x4cef52';
const ARC_RPC = 'https://rpc.testnet.arc.network';
const ARC_EXPLORER = 'https://testnet.arcscan.app';
const ARC_FAUCET = 'https://faucet.circle.com/';

const TOKENS = {
  USDC: {
    symbol: 'USDC',
    label: 'USDC Vault',
    address: '0x3600000000000000000000000000000000000000' as Address,
    decimals: 6,
  },
  EURC: {
    symbol: 'EURC',
    label: 'EURC Vault',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as Address,
    decimals: 6,
  },
} as const;

type TokenKey = keyof typeof TOKENS;

type VaultView = {
  id: number;
  token: Address;
  amount: bigint;
  startTime: bigint;
  unlockTime: bigint;
  aprBps: bigint;
  withdrawn: boolean;
  pendingReward: bigint;
  estimatedReward: bigint;
};

const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || '') as Address;

const publicClient = createPublicClient({
  chain: {
    id: ARC_CHAIN_ID,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [ARC_RPC] } },
    blockExplorers: { default: { name: 'Arcscan', url: ARC_EXPLORER } },
  },
  transport: http(ARC_RPC),
});

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const vaultAbi = [
  {
    type: 'function',
    name: 'createVault',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'lockDays', type: 'uint256' },
    ],
    outputs: [{ name: 'vaultId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'vaultId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'vaultCount',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'activeVaultCount',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxVaultsPerUser',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'aprBps',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalPrincipal',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'availableRewardPool',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'pendingReward',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'vaultId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'estimatedReward',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'vaultId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'vaults',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'uint256' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'startTime', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
      { name: 'aprBps', type: 'uint256' },
      { name: 'withdrawn', type: 'bool' },
    ],
  },
] as const;

declare global {
  interface Window {
    ethereum?: any;
  }
}

function shortAddress(address?: string) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatToken(value: bigint | number | string, decimals = 6, digits = 2) {
  const n = Number(formatUnits(BigInt(value), decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function daysRemaining(unlockTime: bigint) {
  const diff = Number(unlockTime) - nowSeconds();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86400);
}

function dateLabel(timestamp: bigint) {
  return new Date(Number(timestamp) * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getTokenKey(address: Address): TokenKey {
  const lower = address.toLowerCase();
  if (lower === TOKENS.EURC.address.toLowerCase()) return 'EURC';
  return 'USDC';
}

function App() {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [tokenKey, setTokenKey] = useState<TokenKey>('USDC');
  const [activeTab, setActiveTab] = useState<'vaults' | 'portfolio'>('vaults');
  const [amount, setAmount] = useState('');
  const [addTvlAmount, setAddTvlAmount] = useState('');
  const [lockDays, setLockDays] = useState('30');
  const [balance, setBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [apr, setApr] = useState<bigint>(0n);
  const [tvl, setTvl] = useState<bigint>(0n);
  const [rewardPool, setRewardPool] = useState<bigint>(0n);
  const [activeCount, setActiveCount] = useState<bigint>(0n);
  const [maxVaults, setMaxVaults] = useState<bigint>(5n);
  const [vaults, setVaults] = useState<VaultView[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);

  const token = TOKENS[tokenKey];
  const vaultReady = isAddress(VAULT_ADDRESS || '');
  const parsedAmount = useMemo(() => {
    try {
      if (!amount || Number(amount) <= 0) return 0n;
      return parseUnits(amount, token.decimals);
    } catch {
      return 0n;
    }
  }, [amount, token.decimals]);

  const parsedAddTvlAmount = useMemo(() => {
    try {
      if (!addTvlAmount || Number(addTvlAmount) <= 0) return 0n;
      return parseUnits(addTvlAmount, token.decimals);
    } catch {
      return 0n;
    }
  }, [addTvlAmount, token.decimals]);

  const walletClient = useMemo(() => {
    if (!window.ethereum || !account) return null;
    return createWalletClient({
      account,
      chain: {
        id: ARC_CHAIN_ID,
        name: 'Arc Testnet',
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: { default: { http: [ARC_RPC] } },
      },
      transport: custom(window.ethereum),
    });
  }, [account]);

  const needsApprove = parsedAmount > 0n && allowance < parsedAmount;

  const refresh = useCallback(async () => {
    if (!account) return;

    const [bal, chainHex] = await Promise.all([
      publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
      window.ethereum?.request({ method: 'eth_chainId' }),
    ]);

    setBalance(bal);
    setChainId(Number(chainHex));

    if (vaultReady) {
      const [allow, rate, total, rewards, active, max] = await Promise.all([
        publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'allowance', args: [account, VAULT_ADDRESS] }),
        publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'aprBps', args: [token.address] }),
        publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'totalPrincipal', args: [token.address] }),
        publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'availableRewardPool', args: [token.address] }),
        publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'activeVaultCount', args: [account] }),
        publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'maxVaultsPerUser', args: [] }),
      ]);

      setAllowance(allow);
      setApr(rate);
      setTvl(total);
      setRewardPool(rewards);
      setActiveCount(active);
      setMaxVaults(max);

      const count = await publicClient.readContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'vaultCount',
        args: [account],
      });

      const list: VaultView[] = [];
      for (let i = 0; i < Number(count); i += 1) {
        const [raw, pending, estimated] = await Promise.all([
          publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'vaults', args: [account, BigInt(i)] }),
          publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'pendingReward', args: [account, BigInt(i)] }),
          publicClient.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'estimatedReward', args: [account, BigInt(i)] }),
        ]);

        list.push({
          id: i,
          token: raw[0] as Address,
          amount: raw[1],
          startTime: raw[2],
          unlockTime: raw[3],
          aprBps: raw[4],
          withdrawn: raw[5],
          pendingReward: pending,
          estimatedReward: estimated,
        });
      }
      setVaults(list.reverse());
    }
  }, [account, token.address, vaultReady]);

  useEffect(() => {
    refresh().catch((err) => setMessage(err.message || 'Refresh failed'));
  }, [refresh, tick]);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      setMessage('Please install MetaMask, Rabby, or another EVM wallet.');
      return;
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(accounts[0]);
    await switchToArc();
  }

  async function switchToArc() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_CHAIN_ID_HEX }] });
    } catch (error: any) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ARC_CHAIN_ID_HEX,
              chainName: 'Arc Testnet',
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
              rpcUrls: [ARC_RPC],
              blockExplorerUrls: [ARC_EXPLORER],
            },
          ],
        });
      } else {
        throw error;
      }
    }
    const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
    setChainId(Number(chainHex));
  }

  async function approve() {
    if (!walletClient || !vaultReady || parsedAmount <= 0n) return;
    setLoading(true);
    setMessage('Approving token spend...');
    try {
      const hash = await walletClient.writeContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [VAULT_ADDRESS, parsedAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Approve confirmed: ${hash}`);
      await refresh();
    } catch (error: any) {
      setMessage(error.shortMessage || error.message || 'Approve failed');
    } finally {
      setLoading(false);
    }
  }

  async function addTvl() {
    if (!walletClient || !vaultReady || parsedAddTvlAmount <= 0n) return;
    setLoading(true);
    setMessage(`Adding ${token.symbol} TVL / reward pool...`);
    try {
      const hash = await walletClient.writeContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [VAULT_ADDRESS, parsedAddTvlAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`TVL added: ${hash}`);
      setAddTvlAmount('');
      await refresh();
    } catch (error: any) {
      setMessage(error.shortMessage || error.message || 'Add TVL failed');
    } finally {
      setLoading(false);
    }
  }

  async function createVault() {
    if (!walletClient || !vaultReady || parsedAmount <= 0n) return;
    const days = BigInt(Math.max(0, Number(lockDays)));
    if (days <= 0n) {
      setMessage('Please enter a valid lock period.');
      return;
    }

    setLoading(true);
    setMessage('Creating vault...');
    try {
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'createVault',
        args: [token.address, parsedAmount, days],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Vault created: ${hash}`);
      setAmount('');
      await refresh();
    } catch (error: any) {
      setMessage(error.shortMessage || error.message || 'Create vault failed');
    } finally {
      setLoading(false);
    }
  }

  async function withdraw(vaultId: number) {
    if (!walletClient || !vaultReady) return;
    setLoading(true);
    setMessage('Withdrawing vault...');
    try {
      const hash = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: 'withdraw',
        args: [BigInt(vaultId)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Withdraw confirmed: ${hash}`);
      await refresh();
    } catch (error: any) {
      setMessage(error.shortMessage || error.message || 'Withdraw failed. The reward pool may be low or the vault may still be locked.');
    } finally {
      setLoading(false);
    }
  }

  // APR tiers: the longer you stake, the higher the APR
  const APR_TIERS = [
    { minDays: 365, apr: 50 },
    { minDays: 180, apr: 40 },
    { minDays: 90, apr: 35 },
    { minDays: 30, apr: 20 },
    { minDays: 7, apr: 10 },
    { minDays: 0, apr: 5 },
  ];

  const currentApr = useMemo(() => {
    const days = Math.max(0, Number(lockDays || '0'));
    const tier = APR_TIERS.find((t) => days >= t.minDays) || APR_TIERS[APR_TIERS.length - 1];
    return tier.apr;
  }, [lockDays]);

  const expectedProfit = useMemo(() => {
    if (parsedAmount <= 0n) return 0n;
    const days = BigInt(Math.max(0, Number(lockDays || '0')));
    const aprBps = BigInt(currentApr * 100); // convert % to bps
    return (parsedAmount * aprBps * days) / (10_000n * 365n);
  }, [parsedAmount, currentApr, lockDays]);

  const totalDisplayedTvl = tvl + rewardPool;

  return (
    <main className="app-shell">
      <nav className="top-nav">
        <div className="brand">
          <div className="logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L3 20h4l1.5-3h7l1.5 3h4L12 2zm0 6l2.5 6h-5L12 8z" fill="white"/>
            </svg>
          </div>
          <span>ArcStake</span>
        </div>
        <div className="nav-actions">
          <a href={ARC_FAUCET} target="_blank" rel="noreferrer" className="faucet-link">
            Faucet Testnet Tokens ↗
          </a>
          {account ? (
            <button className="wallet-button" onClick={switchToArc}>{shortAddress(account)}</button>
          ) : (
            <button className="wallet-button" onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>
      </nav>

      <section className="hero">
        <h1><strong>Stake on Arc</strong></h1>
      </section>

      <section className="vault-layout">
        <div className="app-tabs" role="tablist" aria-label="ArcStake main sections">
          <button
            className={activeTab === 'vaults' ? 'active' : ''}
            onClick={() => setActiveTab('vaults')}
          >
            Vaults
          </button>
          <button
            className={activeTab === 'portfolio' ? 'active' : ''}
            onClick={() => setActiveTab('portfolio')}
          >
            Portfolio
          </button>
        </div>

        {activeTab === 'vaults' ? (
          <>
            <div className="tab-heading">
              <div>
                <span>Create vault</span>
                <h2>Add a new lock position</h2>
              </div>
              <p>Choose USDC or EURC, enter an amount, select a lock period, then create a vault on Arc Testnet.</p>
            </div>

            <div className="token-tabs" role="tablist">
              {(['USDC', 'EURC'] as TokenKey[]).map((key) => (
                <button
                  key={key}
                  className={key === tokenKey ? 'active' : ''}
                  onClick={() => setTokenKey(key)}
                >
                  ⊙ {key}
                </button>
              ))}
            </div>

            <div className="stats-row">
              <span>Locked TVL: <strong>{formatToken(tvl)} {token.symbol}</strong></span>
              <span>Reward TVL: <strong>{formatToken(rewardPool)} {token.symbol}</strong></span>
              <span>Total shown TVL: <strong>{formatToken(totalDisplayedTvl)} {token.symbol}</strong></span>
              <span>{activeCount.toString()} / {maxVaults.toString()} vaults used</span>
            </div>

            <div className="cards-grid">
              <section className="main-card">
                <div className="section-label">Vaults</div>
                <h2>{token.label}</h2>

                <label>Amount to lock</label>
                <div className="input-row">
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                  <button className="max-button" onClick={() => setAmount(formatUnits(balance, token.decimals))}>MAX</button>
                  <span>{token.symbol}</span>
                </div>

                <div className="balance-line">
                  <span>Wallet balance</span>
                  <strong>{formatToken(balance)} {token.symbol}</strong>
                </div>

                <label>Lock period</label>
                <div className="input-row">
                  <input value={lockDays} onChange={(event) => setLockDays(event.target.value)} inputMode="numeric" />
                  <span>DAYS</span>
                </div>

                <div className="quick-days">
                  {[7, 30, 90, 365].map((days) => (
                    <button key={days} onClick={() => setLockDays(String(days))}>{days === 365 ? '1yr' : `${days}d`}</button>
                  ))}
                </div>

                <div className="profit-preview">
                  <div>
                    <span>APR</span>
                    <strong>{currentApr}%</strong>
                  </div>
                  <div>
                    <span>Estimated reward</span>
                    <strong>{formatToken(expectedProfit)} {token.symbol}</strong>
                  </div>
                  <div>
                    <span>Unlocks after</span>
                    <strong>{lockDays || 0} days</strong>
                  </div>
                </div>

                {!account ? (
                  <button className="primary-action" onClick={connectWallet}>Connect wallet to deposit</button>
                ) : chainId !== ARC_CHAIN_ID ? (
                  <button className="primary-action" onClick={switchToArc}>Switch to Arc Testnet</button>
                ) : needsApprove ? (
                  <button className="primary-action" disabled={loading || !vaultReady} onClick={approve}>Approve {token.symbol}</button>
                ) : (
                  <button className="primary-action" disabled={loading || !vaultReady || parsedAmount <= 0n} onClick={createVault}>Add vault</button>
                )}
              </section>

              <aside className="info-card">
                <div className="section-label">Vault health</div>
                <h3>Reward pool</h3>
                <p>Vaults are non-custodial lock positions. Reward TVL is surplus token inside the contract and is used to pay profit when users withdraw after unlock.</p>

                <div className="reward-pool-box">
                  <span>TVL added to rewards</span>
                  <strong>{formatToken(rewardPool)} {token.symbol}</strong>
                </div>

                <label>Add reward TVL</label>
                <div className="add-tvl-row compact">
                  <input
                    value={addTvlAmount}
                    onChange={(event) => setAddTvlAmount(event.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                  <span>{token.symbol}</span>
                  {!account ? (
                    <button onClick={connectWallet}>Connect</button>
                  ) : chainId !== ARC_CHAIN_ID ? (
                    <button onClick={switchToArc}>Switch</button>
                  ) : (
                    <button disabled={loading || !vaultReady || parsedAddTvlAmount <= 0n} onClick={addTvl}>Add TVL</button>
                  )}
                </div>

                <div className="faucet-card">
                  <span>Need testnet tokens?</span>
                  <p>Get Arc Testnet USDC or EURC from the Circle Faucet, then come back and refresh your balance.</p>
                  <a href={ARC_FAUCET} target="_blank" rel="noreferrer">Open Faucet ↗</a>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <section className="portfolio-panel">
            <div className="section-title">
              <div>
                <div className="section-label">Portfolio</div>
                <h2>Your active positions</h2>
              </div>
              <button className="ghost-button" onClick={refresh}>Refresh</button>
            </div>

            <div className="portfolio-summary">
              <div>
                <span>Total positions</span>
                <strong>{vaults.length}</strong>
              </div>
              <div>
                <span>Active vaults</span>
                <strong>{activeCount.toString()}</strong>
              </div>
              <div>
                <span>Selected asset TVL</span>
                <strong>{formatToken(tvl)} {token.symbol}</strong>
              </div>
              <div>
                <span>Reward pool</span>
                <strong>{formatToken(rewardPool)} {token.symbol}</strong>
              </div>
            </div>

            {!account ? (
              <div className="empty-state">Connect wallet to view your portfolio.</div>
            ) : vaults.length === 0 ? (
              <div className="empty-state">No positions yet. Open the Vaults tab to add your first vault.</div>
            ) : (
              <div className="vault-list portfolio-list">
                {vaults.map((v) => {
                  const key = getTokenKey(v.token);
                  const t = TOKENS[key];
                  const remaining = daysRemaining(v.unlockTime);
                  const unlocked = remaining === 0 && !v.withdrawn;
                  const status = v.withdrawn ? 'Withdrawn' : unlocked ? 'Unlocked' : 'Active';
                  return (
                    <article className="vault-item" key={`${v.id}-${v.token}`}>
                      <div className="vault-token">{t.symbol}</div>
                      <div>
                        <span>Status</span>
                        <strong>{status}</strong>
                      </div>
                      <div>
                        <span>Locked</span>
                        <strong>{formatToken(v.amount)} {t.symbol}</strong>
                      </div>
                      <div>
                        <span>Days left</span>
                        <strong>{v.withdrawn ? 'Done' : `${remaining} days`}</strong>
                      </div>
                      <div>
                        <span>Unlock date</span>
                        <strong>{dateLabel(v.unlockTime)}</strong>
                      </div>
                      <div>
                        <span>Profit</span>
                        <strong>{formatToken(v.pendingReward)} / {formatToken(v.estimatedReward)} {t.symbol}</strong>
                      </div>
                      <button disabled={!unlocked || loading} onClick={() => withdraw(v.id)}>
                        {v.withdrawn ? 'Done' : unlocked ? 'Withdraw' : 'Locked'}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </section>

      {message && <div className="toast">{message}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
