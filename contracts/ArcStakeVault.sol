// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title ArcStakeVault
/// @notice Demo non-custodial lock vault for USDC/EURC on Arc Testnet.
/// @dev Rewards are paid from surplus tokens pre-funded into this contract by the owner.
contract ArcStakeVault {
    struct Vault {
        address token;
        uint256 amount;
        uint256 startTime;
        uint256 unlockTime;
        uint256 aprBps;
        bool withdrawn;
    }

    address public owner;
    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public minLockDays = 7;
    uint256 public maxLockDays = 365;
    uint256 public maxVaultsPerUser = 5;

    mapping(address => bool) public allowedTokens;
    mapping(address => uint256) public aprBps;
    mapping(address => uint256) public totalPrincipal;
    mapping(address => Vault[]) public vaults;

    event VaultCreated(
        address indexed user,
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        uint256 startTime,
        uint256 unlockTime,
        uint256 aprBps
    );
    event VaultWithdrawn(
        address indexed user,
        uint256 indexed vaultId,
        address indexed token,
        uint256 principal,
        uint256 reward
    );
    event TokenConfigured(address indexed token, bool allowed, uint256 aprBps);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address usdc, address eurc) {
        owner = msg.sender;
        _configureToken(usdc, true, 800); // 8.00% APR demo
        _configureToken(eurc, true, 600); // 6.00% APR demo
    }

    function vaultCount(address user) external view returns (uint256) {
        return vaults[user].length;
    }

    function createVault(address token, uint256 amount, uint256 lockDays) external returns (uint256 vaultId) {
        require(allowedTokens[token], "TOKEN_NOT_ALLOWED");
        require(amount > 0, "ZERO_AMOUNT");
        require(lockDays >= minLockDays && lockDays <= maxLockDays, "BAD_LOCK_DAYS");
        require(activeVaultCount(msg.sender) < maxVaultsPerUser, "MAX_ACTIVE_VAULTS");

        uint256 start = block.timestamp;
        uint256 unlock = start + (lockDays * 1 days);

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");
        totalPrincipal[token] += amount;

        vaults[msg.sender].push(
            Vault({
                token: token,
                amount: amount,
                startTime: start,
                unlockTime: unlock,
                aprBps: aprBps[token],
                withdrawn: false
            })
        );

        vaultId = vaults[msg.sender].length - 1;
        emit VaultCreated(msg.sender, vaultId, token, amount, start, unlock, aprBps[token]);
    }

    function withdraw(uint256 vaultId) external {
        Vault storage v = vaults[msg.sender][vaultId];
        require(!v.withdrawn, "ALREADY_WITHDRAWN");
        require(block.timestamp >= v.unlockTime, "LOCKED");

        uint256 reward = _fullReward(v.amount, v.aprBps, v.startTime, v.unlockTime);
        uint256 balance = IERC20(v.token).balanceOf(address(this));

        // Ensure rewards are paid only from surplus and not from other users' principal.
        require(balance >= totalPrincipal[v.token] + reward, "REWARD_POOL_LOW");

        v.withdrawn = true;
        totalPrincipal[v.token] -= v.amount;

        require(IERC20(v.token).transfer(msg.sender, v.amount + reward), "TRANSFER_FAILED");
        emit VaultWithdrawn(msg.sender, vaultId, v.token, v.amount, reward);
    }

    function activeVaultCount(address user) public view returns (uint256 count) {
        Vault[] storage list = vaults[user];
        for (uint256 i = 0; i < list.length; i++) {
            if (!list[i].withdrawn) count++;
        }
    }

    function pendingReward(address user, uint256 vaultId) public view returns (uint256) {
        Vault storage v = vaults[user][vaultId];
        if (v.withdrawn) return 0;

        uint256 end = block.timestamp;
        if (end > v.unlockTime) end = v.unlockTime;
        if (end <= v.startTime) return 0;

        return _rewardFor(v.amount, v.aprBps, end - v.startTime);
    }

    function estimatedReward(address user, uint256 vaultId) public view returns (uint256) {
        Vault storage v = vaults[user][vaultId];
        if (v.withdrawn) return 0;
        return _fullReward(v.amount, v.aprBps, v.startTime, v.unlockTime);
    }

    function availableRewardPool(address token) external view returns (uint256) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance <= totalPrincipal[token]) return 0;
        return balance - totalPrincipal[token];
    }

    function configureToken(address token, bool allowed, uint256 newAprBps) external onlyOwner {
        _configureToken(token, allowed, newAprBps);
    }

    function setLimits(uint256 newMinLockDays, uint256 newMaxLockDays, uint256 newMaxVaultsPerUser) external onlyOwner {
        require(newMinLockDays > 0, "BAD_MIN");
        require(newMaxLockDays >= newMinLockDays, "BAD_MAX");
        require(newMaxVaultsPerUser > 0, "BAD_MAX_VAULTS");
        minLockDays = newMinLockDays;
        maxLockDays = newMaxLockDays;
        maxVaultsPerUser = newMaxVaultsPerUser;
    }

    function rescueSurplus(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "BAD_TO");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance >= totalPrincipal[token] + amount, "NOT_SURPLUS");
        require(IERC20(token).transfer(to, amount), "TRANSFER_FAILED");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BAD_OWNER");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function _configureToken(address token, bool allowed, uint256 newAprBps) internal {
        require(token != address(0), "BAD_TOKEN");
        require(newAprBps <= 5_000, "APR_TOO_HIGH"); // max 50% APR for demo safety
        allowedTokens[token] = allowed;
        aprBps[token] = newAprBps;
        emit TokenConfigured(token, allowed, newAprBps);
    }

    function _fullReward(uint256 amount, uint256 rateBps, uint256 start, uint256 unlock) internal pure returns (uint256) {
        if (unlock <= start) return 0;
        return _rewardFor(amount, rateBps, unlock - start);
    }

    function _rewardFor(uint256 amount, uint256 rateBps, uint256 duration) internal pure returns (uint256) {
        return (amount * rateBps * duration) / (BPS * YEAR);
    }
}
