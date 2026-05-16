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

const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || '0x19571Ff0E2982A232DdAFA6c57f3762AE3532C7A') as Address;

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
  const [activeTab, setActiveTab] = useState<'vaults' | 'portfolio' | 'tvl'>('vaults');
  const [showWalletModal, setShowWalletModal] = useState(false);
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
    setShowWalletModal(true);
  }

  async function connectWithProvider(provider: any) {
    setShowWalletModal(false);
    if (!provider) {
      setMessage('Wallet not found. Please install the selected wallet extension.');
      return;
    }

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0] as Address;

      // Sign message to verify wallet ownership
      const timestamp = Math.floor(Date.now() / 1000);
      const msg = `Welcome to ArcVault!\n\nSign this message to verify your wallet ownership.\n\nWallet: ${addr}\nTimestamp: ${timestamp}`;
      await provider.request({
        method: 'personal_sign',
        params: [msg, addr],
      });

      setAccount(addr);
      const chainHex = await provider.request({ method: 'eth_chainId' });
      setChainId(Number(chainHex));
      setMessage('Wallet connected & verified!');
    } catch (error: any) {
      setMessage(error.message || 'Failed to connect wallet.');
    }
  }

  async function switchToArc() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_CHAIN_ID_HEX }] });
    } catch (error: any) {
      if (error.code === 4902 || error.code === -32603) {
        try {
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
        } catch (addError: any) {
          setMessage('Please manually switch to Arc Testnet (Chain ID 5042002) in your wallet settings.');
          return;
        }
      } else {
        setMessage('Please manually switch to Arc Testnet (Chain ID 5042002) in your wallet settings.');
        return;
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
    { minDays: 365, apr: 250 },
    { minDays: 180, apr: 200 },
    { minDays: 90, apr: 180 },
    { minDays: 30, apr: 150 },
    { minDays: 7, apr: 100 },
    { minDays: 0, apr: 50 },
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
          <span>ArcVault</span>
        </div>
        <div className="nav-actions">
          <a href={ARC_FAUCET} target="_blank" rel="noreferrer" className="faucet-link">
            Faucet Testnet Tokens ↗
          </a>
          {account ? (
            <>
              <button className="wallet-button" onClick={switchToArc}>{shortAddress(account)}</button>
              <button className="ghost-button" onClick={() => { setAccount(null); setChainId(null); setBalance(0n); setVaults([]); setMessage('Wallet disconnected.'); }}>Logout</button>
            </>
          ) : (
            <button className="wallet-button" onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>
      </nav>

      <section className="hero">
        <h1><strong>Vault on Arc</strong></h1>
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
          <button
            className={activeTab === 'tvl' ? 'active' : ''}
            onClick={() => setActiveTab('tvl')}
          >
            Add TVL
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

            <section className="main-card" style={{maxWidth: '560px', margin: '0 auto'}}>
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
                ) : needsApprove ? (
                  <button className="primary-action" disabled={loading} onClick={approve}>Approve {token.symbol}</button>
                ) : (
                  <button className="primary-action" disabled={loading || parsedAmount <= 0n} onClick={createVault}>Add vault</button>
                )}
              </section>

            <div className="faucet-card" style={{maxWidth: '560px', margin: '24px auto 0'}}>
              <span>Need testnet tokens?</span>
              <p>Get Arc Testnet USDC or EURC from the Circle Faucet, then come back and refresh your balance.</p>
              <a href={ARC_FAUCET} target="_blank" rel="noreferrer">Open Faucet ↗</a>
            </div>
          </>
        ) : activeTab === 'portfolio' ? (
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
        ) : (
          <section className="portfolio-panel">
            <div className="section-title">
              <div>
                <div className="section-label">Reward Pool</div>
                <h2>Add TVL to Reward Pool</h2>
              </div>
            </div>

            <p style={{color: '#8f95a6', marginBottom: '24px', lineHeight: 1.6}}>
              Transfer USDC or EURC directly to the vault contract as reward pool funding. This TVL is used to pay stakers their APR rewards when they withdraw.
            </p>

            <div className="reward-pool-box">
              <span>Current reward pool</span>
              <strong>{formatToken(rewardPool)} {token.symbol}</strong>
            </div>

            <div className="token-tabs" role="tablist" style={{marginBottom: '20px'}}>
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

            <label>Amount to add</label>
            <div className="input-row">
              <input
                value={addTvlAmount}
                onChange={(event) => setAddTvlAmount(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <button className="max-button" onClick={() => setAddTvlAmount(formatUnits(balance, token.decimals))}>MAX</button>
              <span>{token.symbol}</span>
            </div>

            <div className="balance-line">
              <span>Wallet balance</span>
              <strong>{formatToken(balance)} {token.symbol}</strong>
            </div>

            {!account ? (
              <button className="primary-action" onClick={connectWallet}>Connect wallet</button>
            ) : (
              <button className="primary-action" disabled={loading || parsedAddTvlAmount <= 0n} onClick={addTvl}>Add {token.symbol} to Reward Pool</button>
            )}

            <div className="mini-metrics" style={{marginTop: '28px'}}>
              <div>
                <span>Locked TVL (stakers)</span>
                <strong>{formatToken(tvl)} {token.symbol}</strong>
              </div>
              <div>
                <span>Reward TVL (pool)</span>
                <strong>{formatToken(rewardPool)} {token.symbol}</strong>
              </div>
              <div>
                <span>Total contract TVL</span>
                <strong>{formatToken(totalDisplayedTvl)} {token.symbol}</strong>
              </div>
            </div>
          </section>
        )}
      </section>

      {showWalletModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:100,display:'grid',placeItems:'center'}} onClick={() => setShowWalletModal(false)}>
          <div style={{background:'#fff',borderRadius:'24px',padding:'32px',maxWidth:'380px',width:'90%',boxShadow:'0 30px 80px rgba(0,0,0,.2)'}} onClick={(e) => e.stopPropagation()}>
            <h3 style={{margin:'0 0 8px',fontSize:'22px',letterSpacing:'-.03em',color:'#1d2031'}}>Connect Wallet</h3>
            <p style={{margin:'0 0 22px',color:'#8f95a6',fontSize:'14px'}}>Select a wallet to connect to ArcVault</p>
            <div style={{display:'grid',gap:'10px'}}>
              {window.ethereum?.isMetaMask && (
                <button className="primary-action" style={{minHeight:'50px',fontSize:'15px'}} onClick={() => connectWithProvider(window.ethereum)}>MetaMask</button>
              )}
              {(window as any).okxwallet && (
                <button className="primary-action" style={{minHeight:'50px',fontSize:'15px'}} onClick={() => connectWithProvider((window as any).okxwallet)}>OKX Wallet</button>
              )}
              {window.ethereum && !window.ethereum?.isMetaMask && !(window as any).okxwallet && (
                <button className="primary-action" style={{minHeight:'50px',fontSize:'15px'}} onClick={() => connectWithProvider(window.ethereum)}>Browser Wallet</button>
              )}
              {window.ethereum && (
                <button className="primary-action" style={{minHeight:'50px',fontSize:'15px',background:'linear-gradient(135deg, #2b2364, #8a38f5)'}} onClick={() => connectWithProvider(window.ethereum)}>Default Wallet</button>
              )}
              {!window.ethereum && (
                <p style={{color:'#e74c3c',textAlign:'center',fontWeight:700}}>No wallet detected. Please install MetaMask or OKX Wallet.</p>
              )}
            </div>
            <button style={{marginTop:'16px',width:'100%',padding:'12px',background:'transparent',color:'#9aa1b2',fontWeight:800,borderRadius:'12px',border:'1px solid #eee'}} onClick={() => setShowWalletModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {message && <div className="toast">{message}</div>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
