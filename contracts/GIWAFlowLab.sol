// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

contract GIWAFlowLab {
    // =============================================================
    // Errors
    // =============================================================

    error Unauthorized();
    error ZeroAmount();
    error InvalidAmount();
    error InsufficientBalance();
    error TransferFailed();
    error Paused();
    error NotPaused();
    error RoundNotEnded();
    error AlreadyFinalized();
    error NotEligible();
    error CapExceeded();
    error InvalidToken();
    error InvalidPair();
    error InvalidPosition();
    error BatchTooLarge();

    // =============================================================
    // Constants
    // =============================================================

    uint256 public constant BPS = 10_000;

    uint256 public constant DEPOSIT_FEE_BPS = 100; // 1%
    uint256 public constant WEEKLY_FEE_SHARE_BPS = 7_000; // 70%
    uint256 public constant TREASURY_FEE_SHARE_BPS = 2_000; // 20%
    uint256 public constant EMERGENCY_FEE_SHARE_BPS = 1_000; // 10%

    uint256 public constant MOCK_MINT_RATE = 1_000_000; // 1 ETH = 1,000,000 mGIWA

    uint256 public constant MIN_NATIVE_DEPOSIT_FOR_REWARD = 0.0005 ether;
    uint64 public constant DEPOSIT_MATURITY = 72 hours;
    uint64 public constant WEEKLY_ROUND_DURATION = 7 days;

    uint8 public constant MAX_SCRATCH_BATCH = 10;
    uint8 public constant MAX_ACTIVE_POSITIONS = 5;

    uint256 public constant MAX_LP_VALUE_PER_WALLET_POOL = 5_000;
    uint256 public constant MIN_LP_VALUE = 100;

    uint256 public constant MAX_SPONSOR_DRIP_PER_WEEK = 0.03 ether;
    uint256 public constant EARLY_HARD_WEEKLY_CAP = 0.05 ether;

    // =============================================================
    // Mock asset and pair types
    // =============================================================

    enum MockToken {
        mGIWA,
        mUSD,
        mBTC
    }

    enum PairType {
        mGIWA_mUSD,
        mGIWA_mBTC,
        mUSD_mBTC
    }

    // =============================================================
    // Structs
    // =============================================================

    struct NativeAccount {
        uint128 depositBalance;
        uint128 lifetimeDeposited;
        uint128 depositRewardMinted;
        uint64 eligibleSince;
    }

    struct LpPosition {
        address owner;
        uint128 amountA;
        uint128 amountB;
        uint128 valueMUSD;
        uint64 lastClaimAt;
        uint8 pairType;
        bool active;
    }

    struct TopUser {
        address user;
        uint128 points;
        uint128 activeDeposit;
        uint64 reachedAt;
    }

    struct RoundData {
        uint64 startTime;
        uint64 endTime;
        bool finalized;
        TopUser rank1;
        TopUser rank2;
        TopUser rank3;
    }

    struct DailyCounter {
        uint64 day;
        uint8 scratchCount;
        uint8 wheelCount;
        bool dailyLoginDone;
        bool swapPointDone;
    }

    struct WeeklyCounter {
        uint64 roundId;
        bool addLiquidityPointDone;
        bool claimAprPointDone;
        bool activeDepositPointDone;
        uint16 questBonusPoints;
    }

    // =============================================================
    // Ownership and pause state
    // =============================================================

    address public owner;

    bool public depositsPaused;
    bool public arcadePaused;
    bool public swapPaused;
    bool public liquidityPaused;
    bool public questsPaused;
    bool public weeklyPaused;

    uint256 private _locked;

    // =============================================================
    // Native ETH accounting buckets
    // =============================================================

    uint256 public totalUserDeposits;
    uint256 public weeklyFeePool;
    uint256 public sponsorWeeklyReserve;
    uint256 public treasuryPool;
    uint256 public emergencyReserve;
    uint256 public totalPendingNativeRewards;

    mapping(address => NativeAccount) public nativeAccounts;
    mapping(address => uint256) public pendingNativeReward;

    // =============================================================
    // Mock balances
    // =============================================================

    mapping(address => mapping(uint8 => uint256)) public mockBalance;

    // =============================================================
    // Weekly round and leaderboard state
    // =============================================================

    uint256 public currentRoundId;

    mapping(uint256 => RoundData) public rounds;
    mapping(uint256 => mapping(address => uint128)) public weeklyPoints;
    mapping(uint256 => mapping(address => uint64)) public weeklyReachedAt;
    mapping(uint256 => mapping(address => uint8)) public activityMask;

    mapping(address => DailyCounter) public dailyCounters;
    mapping(address => WeeklyCounter) public weeklyCounters;

    // =============================================================
    // Quest state
    // =============================================================

    mapping(address => mapping(uint8 => bool)) public oneTimeQuestDone;
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public weeklyQuestDone;

    // =============================================================
    // Liquidity state
    // =============================================================

    uint256 public nextPositionId = 1;

    mapping(uint256 => LpPosition) public lpPositions;
    mapping(address => uint256[]) public userPositions;
    mapping(address => mapping(uint8 => uint256)) public userPoolValue;
    mapping(uint256 => mapping(uint8 => uint256)) public weeklyPoolEmission;

    // =============================================================
    // Mock supply stats
    // =============================================================

    uint256 public totalMockMinted;
    uint256 public totalMockBurned;

    // =============================================================
    // Events
    // =============================================================

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    event NativeDeposited(
        address indexed user,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount,
        uint256 mockReward
    );

    event NativeWithdrawn(address indexed user, uint256 amount);

    event ReserveFunded(address indexed from, uint8 indexed bucket, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event EmergencyWithdrawn(address indexed to, uint256 amount);
    event NativeRewardClaimed(address indexed user, uint256 amount);

    event MockMinted(address indexed user, uint8 indexed token, uint256 amount, bytes32 reason);
    event MockBurned(address indexed user, uint8 indexed token, uint256 amount, bytes32 reason);

    event DailyLogin(address indexed user, uint256 indexed roundId, uint64 day, uint256 reward);
    event WheelSpin(address indexed user, uint256 indexed roundId, uint256 reward, bool freeSpin);
    event ScratchPlayed(address indexed user, uint256 indexed roundId, uint8 count, uint256 totalReward);

    event MockSwap(
        address indexed user,
        uint8 indexed tokenIn,
        uint8 indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 burnFee
    );

    event LiquidityAdded(
        address indexed user,
        uint256 indexed positionId,
        uint8 indexed pairType,
        uint256 valueMUSD
    );

    event LiquidityRemoved(
        address indexed user,
        uint256 indexed positionId,
        uint8 indexed pairType,
        uint256 valueMUSD
    );

    event AprClaimed(
        address indexed user,
        uint256 indexed positionId,
        uint8 indexed pairType,
        uint256 reward
    );

    event QuestCompleted(address indexed user, uint256 indexed roundId, uint8 indexed questId, bool weeklyQuest);
    event WeeklyPointsAdded(address indexed user, uint256 indexed roundId, uint256 points, uint8 category);

    event Top3Updated(
        uint256 indexed roundId,
        address rank1,
        address rank2,
        address rank3
    );

    event WeeklyFinalized(
        uint256 indexed roundId,
        uint256 payoutAmount,
        address rank1,
        address rank2,
        address rank3
    );

    event PauseUpdated(bytes32 indexed module, bool paused);

    // =============================================================
    // Modifiers
    // =============================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 1) revert Unauthorized();
        _locked = 1;
        _;
        _locked = 0;
    }

    modifier whenDepositsActive() {
        if (depositsPaused) revert Paused();
        _;
    }

    modifier whenArcadeActive() {
        if (arcadePaused) revert Paused();
        _;
    }

    modifier whenSwapActive() {
        if (swapPaused) revert Paused();
        _;
    }

    modifier whenLiquidityActive() {
        if (liquidityPaused) revert Paused();
        _;
    }

    modifier whenWeeklyActive() {
        if (weeklyPaused) revert Paused();
        _;
    }

    // =============================================================
    // Constructor
    // =============================================================

    constructor() {
        owner = msg.sender;
        _locked = 0;

        currentRoundId = 1;

        uint64 start = uint64(block.timestamp);
        uint64 end = start + WEEKLY_ROUND_DURATION;

        rounds[currentRoundId].startTime = start;
        rounds[currentRoundId].endTime = end;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // =============================================================
    // Basic admin
    // =============================================================

    receive() external payable {
        emergencyReserve += msg.value;
        emit ReserveFunded(msg.sender, 3, msg.value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAmount();

        address oldOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setPause(bytes32 module, bool paused) external onlyOwner {
        if (module == bytes32("deposits")) {
            depositsPaused = paused;
        } else if (module == bytes32("arcade")) {
            arcadePaused = paused;
        } else if (module == bytes32("swap")) {
            swapPaused = paused;
        } else if (module == bytes32("liquidity")) {
            liquidityPaused = paused;
        } else if (module == bytes32("quests")) {
            questsPaused = paused;
        } else if (module == bytes32("weekly")) {
            weeklyPaused = paused;
        } else {
            revert InvalidAmount();
        }

        emit PauseUpdated(module, paused);
    }

    // =============================================================
    // Reserve funding
    // =============================================================

    function fundSponsorWeeklyReserve() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();

        sponsorWeeklyReserve += msg.value;

        emit ReserveFunded(msg.sender, 1, msg.value);
    }

    function fundEmergencyReserve() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();

        emergencyReserve += msg.value;

        emit ReserveFunded(msg.sender, 3, msg.value);
    }

    function fundTreasury() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();

        treasuryPool += msg.value;

        emit ReserveFunded(msg.sender, 2, msg.value);
    }

    // =============================================================
    // Accounting views
    // =============================================================

    function accountedNativeBalance() public view returns (uint256) {
        return totalUserDeposits
            + weeklyFeePool
            + sponsorWeeklyReserve
            + treasuryPool
            + emergencyReserve
            + totalPendingNativeRewards;
    }

    function unaccountedNativeBalance() external view returns (uint256) {
        uint256 accounted = accountedNativeBalance();

        if (address(this).balance <= accounted) {
            return 0;
        }

        return address(this).balance - accounted;
    }

    // =============================================================
    // Vault
    // =============================================================

    function depositNative() external payable nonReentrant whenDepositsActive {
        _rolloverIfNeeded();
        if (msg.value == 0) revert ZeroAmount();

        NativeAccount storage account = nativeAccounts[msg.sender];

        uint256 feeAmount = (msg.value * DEPOSIT_FEE_BPS) / BPS;
        uint256 netAmount = msg.value - feeAmount;

        uint256 weeklyShare = (feeAmount * WEEKLY_FEE_SHARE_BPS) / BPS;
        uint256 treasuryShare = (feeAmount * TREASURY_FEE_SHARE_BPS) / BPS;
        uint256 emergencyShare = feeAmount - weeklyShare - treasuryShare;

        weeklyFeePool += weeklyShare;
        treasuryPool += treasuryShare;
        emergencyReserve += emergencyShare;

        uint256 oldDeposit = account.depositBalance;
        uint256 newDeposit = oldDeposit + netAmount;

        account.depositBalance = _toUint128(newDeposit);
        account.lifetimeDeposited = _toUint128(uint256(account.lifetimeDeposited) + msg.value);

        totalUserDeposits += netAmount;

        if (
            oldDeposit < MIN_NATIVE_DEPOSIT_FOR_REWARD &&
            newDeposit >= MIN_NATIVE_DEPOSIT_FOR_REWARD
        ) {
            account.eligibleSince = uint64(block.timestamp);
        }

        uint256 totalEligibleMock = (uint256(account.lifetimeDeposited) * MOCK_MINT_RATE) / 1 ether;
        uint256 alreadyMinted = account.depositRewardMinted;
        uint256 newMockReward = 0;

        if (totalEligibleMock > alreadyMinted) {
            newMockReward = totalEligibleMock - alreadyMinted;
            account.depositRewardMinted = _toUint128(totalEligibleMock);
            _mintMock(msg.sender, uint8(MockToken.mGIWA), newMockReward, bytes32("deposit"));
        }

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_DEPOSIT, 100, 10);

        emit NativeDeposited(msg.sender, msg.value, feeAmount, netAmount, newMockReward);
    }

    function withdrawNative(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        NativeAccount storage account = nativeAccounts[msg.sender];

        if (account.depositBalance < amount) revert InsufficientBalance();

        uint256 newDeposit = uint256(account.depositBalance) - amount;

        account.depositBalance = _toUint128(newDeposit);
        totalUserDeposits -= amount;

        if (newDeposit < MIN_NATIVE_DEPOSIT_FOR_REWARD) {
            account.eligibleSince = 0;
        }

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit NativeWithdrawn(msg.sender, amount);
    }

    // =============================================================
    // Internal mock helpers
    // =============================================================

    function _mintMock(address user, uint8 token, uint256 amount, bytes32 reason) internal {
        if (amount == 0) return;
        if (token > uint8(MockToken.mBTC)) revert InvalidToken();

        mockBalance[user][token] += amount;
        totalMockMinted += amount;

        emit MockMinted(user, token, amount, reason);
    }

    function _burnMock(address user, uint8 token, uint256 amount, bytes32 reason) internal {
        if (amount == 0) return;
        if (token > uint8(MockToken.mBTC)) revert InvalidToken();
        if (mockBalance[user][token] < amount) revert InsufficientBalance();

        mockBalance[user][token] -= amount;
        totalMockBurned += amount;

        emit MockBurned(user, token, amount, reason);
    }

    function _toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) revert InvalidAmount();
        return uint128(value);
    }

    // =============================================================
    // Activity categories and points
    // =============================================================

    uint8 public constant ACTIVITY_DEPOSIT = 1;
    uint8 public constant ACTIVITY_DAILY = 2;
    uint8 public constant ACTIVITY_ARCADE = 4;
    uint8 public constant ACTIVITY_SWAP = 8;
    uint8 public constant ACTIVITY_LIQUIDITY = 16;
    uint8 public constant ACTIVITY_APR = 32;
    uint8 public constant ACTIVITY_QUEST = 64;

    uint128 public constant POINT_DAILY_LOGIN = 10;
    uint128 public constant POINT_WHEEL = 5;

    uint256 public constant DAILY_LOGIN_REWARD = 25;
    uint256 public constant EXTRA_WHEEL_COST = 25;

    uint8 public constant MAX_WHEEL_POINTS_PER_DAY = 3;

    // =============================================================
    // Daily login and wheel
    // =============================================================

    function dailyLoginAndSpin() external nonReentrant whenArcadeActive {
        _rolloverIfNeeded();
        DailyCounter storage counter = dailyCounters[msg.sender];

        _resetDailyCounterIfNeeded(counter);

        if (counter.dailyLoginDone) revert NotEligible();

        counter.dailyLoginDone = true;
        counter.wheelCount += 1;

        uint256 wheelReward = _mockRandomReward(msg.sender, 1, 5, 60);
        uint256 totalReward = DAILY_LOGIN_REWARD + wheelReward;

        _mintMock(msg.sender, uint8(MockToken.mGIWA), totalReward, bytes32("daily_wheel"));

        _addWeeklyPoints(msg.sender, POINT_DAILY_LOGIN, ACTIVITY_DAILY);
        _addWeeklyPoints(msg.sender, POINT_WHEEL, ACTIVITY_ARCADE);

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_DAILY, 50, 10);
        _completeOneTimeQuest(msg.sender, QUEST_FIRST_WHEEL, 50, 10);

        emit DailyLogin(msg.sender, currentRoundId, counter.day, DAILY_LOGIN_REWARD);
        emit WheelSpin(msg.sender, currentRoundId, wheelReward, true);
    }

    function spinWheel() external nonReentrant whenArcadeActive {
        _rolloverIfNeeded();
        DailyCounter storage counter = dailyCounters[msg.sender];

        _resetDailyCounterIfNeeded(counter);

        if (!counter.dailyLoginDone) revert NotEligible();

        _burnMock(msg.sender, uint8(MockToken.mGIWA), EXTRA_WHEEL_COST, bytes32("wheel"));

        counter.wheelCount += 1;

        uint256 reward = _mockRandomReward(msg.sender, counter.wheelCount, 5, 60);

        _mintMock(msg.sender, uint8(MockToken.mGIWA), reward, bytes32("wheel"));

        if (counter.wheelCount <= MAX_WHEEL_POINTS_PER_DAY) {
            _addWeeklyPoints(msg.sender, POINT_WHEEL, ACTIVITY_ARCADE);
        }

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_WHEEL, 50, 10);

        emit WheelSpin(msg.sender, currentRoundId, reward, false);
    }

    // =============================================================
    // Internal daily helpers
    // =============================================================

    function _resetDailyCounterIfNeeded(DailyCounter storage counter) internal {
        uint64 todayId = uint64(block.timestamp / 1 days);

        if (counter.day != todayId) {
            counter.day = todayId;
            counter.scratchCount = 0;
            counter.wheelCount = 0;
            counter.dailyLoginDone = false;
            counter.swapPointDone = false;
        }
    }

    function _mockRandomReward(
        address user,
        uint256 salt,
        uint256 minReward,
        uint256 maxReward
    ) internal view returns (uint256) {
        uint256 spread = maxReward - minReward + 1;

        uint256 randomValue = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    user,
                    salt,
                    currentRoundId
                )
            )
        );

        return minReward + (randomValue % spread);
    }

    // =============================================================
    // Internal weekly points and Top 3 helpers
    // =============================================================

    function _addWeeklyPoints(address user, uint128 points, uint8 category) internal {
        if (points == 0) return;

        uint256 roundId = currentRoundId;

        uint256 newScore = uint256(weeklyPoints[roundId][user]) + points;

        weeklyPoints[roundId][user] = _toUint128(newScore);
        weeklyReachedAt[roundId][user] = uint64(block.timestamp);
        activityMask[roundId][user] |= category;

        emit WeeklyPointsAdded(user, roundId, points, category);

        _updateTop3(user);
    }

    function _updateTop3(address user) internal {
        RoundData storage rd = rounds[currentRoundId];

        TopUser memory updated = _makeTopUser(user);

        TopUser[4] memory list;

        list[0] = rd.rank1;
        list[1] = rd.rank2;
        list[2] = rd.rank3;
        list[3] = updated;

        for (uint256 i = 0; i < 3; i++) {
            if (list[i].user == user) {
                list[i] = TopUser(address(0), 0, 0, 0);
            }
        }

        TopUser memory best1;
        TopUser memory best2;
        TopUser memory best3;

        for (uint256 i = 0; i < 4; i++) {
            TopUser memory item = list[i];

            if (item.user == address(0) || item.points == 0) {
                continue;
            }

            if (_isBetterTopUser(item, best1)) {
                best3 = best2;
                best2 = best1;
                best1 = item;
            } else if (_isBetterTopUser(item, best2)) {
                best3 = best2;
                best2 = item;
            } else if (_isBetterTopUser(item, best3)) {
                best3 = item;
            }
        }

        rd.rank1 = best1;
        rd.rank2 = best2;
        rd.rank3 = best3;

        emit Top3Updated(currentRoundId, best1.user, best2.user, best3.user);
    }

    function _makeTopUser(address user) internal view returns (TopUser memory) {
        uint256 roundId = currentRoundId;

        return TopUser({
            user: user,
            points: weeklyPoints[roundId][user],
            activeDeposit: nativeAccounts[user].depositBalance,
            reachedAt: weeklyReachedAt[roundId][user]
        });
    }

    function _isBetterTopUser(
        TopUser memory a,
        TopUser memory b
    ) internal view returns (bool) {
        if (a.user == address(0)) return false;
        if (b.user == address(0)) return true;

        if (a.points != b.points) {
            return a.points > b.points;
        }

        if (a.reachedAt != b.reachedAt) {
            return a.reachedAt < b.reachedAt;
        }

        if (a.activeDeposit != b.activeDeposit) {
            return a.activeDeposit > b.activeDeposit;
        }

        return uint256(keccak256(abi.encodePacked(currentRoundId, a.user)))
            < uint256(keccak256(abi.encodePacked(currentRoundId, b.user)));
    }

    // =============================================================

    // =============================================================
    // Scratch cards
    // =============================================================

    uint256 public constant SCRATCH_COST = 50;
    uint128 public constant POINT_SCRATCH = 8;
    uint8 public constant MAX_SCRATCH_POINTS_PER_DAY = 5;

    function scratchBatch(uint8 count) external nonReentrant whenArcadeActive {
        _rolloverIfNeeded();
        if (count == 0) revert ZeroAmount();
        if (count > MAX_SCRATCH_BATCH) revert BatchTooLarge();

        DailyCounter storage counter = dailyCounters[msg.sender];

        _resetDailyCounterIfNeeded(counter);

        uint256 totalCost = uint256(count) * SCRATCH_COST;

        _burnMock(msg.sender, uint8(MockToken.mGIWA), totalCost, bytes32("scratch"));

        uint256 totalReward = 0;

        for (uint8 i = 0; i < count; i++) {
            totalReward += _mockRandomReward(msg.sender, counter.scratchCount + i + 1, 5, 80);
        }

        counter.scratchCount += count;

        _mintMock(msg.sender, uint8(MockToken.mGIWA), totalReward, bytes32("scratch"));

        uint8 counted = count;

        if (counter.scratchCount > MAX_SCRATCH_POINTS_PER_DAY) {
            uint8 over = counter.scratchCount - MAX_SCRATCH_POINTS_PER_DAY;

            if (over >= count) {
                counted = 0;
            } else {
                counted = count - over;
            }
        }

        if (counted > 0) {
            _addWeeklyPoints(msg.sender, uint128(counted) * POINT_SCRATCH, ACTIVITY_ARCADE);
        }

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_SCRATCH, 50, 10);

        emit ScratchPlayed(msg.sender, currentRoundId, count, totalReward);
    }

    // =============================================================
    // Fixed-rate mock swap
    // =============================================================

    uint256 public constant MOCK_SWAP_FEE_BPS = 100; // 1%
    uint128 public constant POINT_SWAP = 10;

    function swapMock(
        uint8 tokenIn,
        uint8 tokenOut,
        uint256 amountIn
    ) external nonReentrant whenSwapActive {
        _rolloverIfNeeded();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn > uint8(MockToken.mBTC)) revert InvalidToken();
        if (tokenOut > uint8(MockToken.mBTC)) revert InvalidToken();
        if (tokenIn == tokenOut) revert InvalidToken();

        DailyCounter storage counter = dailyCounters[msg.sender];

        _resetDailyCounterIfNeeded(counter);

        uint256 burnFee = (amountIn * MOCK_SWAP_FEE_BPS) / BPS;
        uint256 amountAfterFee = amountIn - burnFee;

        _burnMock(msg.sender, tokenIn, amountIn, bytes32("swap_in"));

        uint256 amountOut = _convertMockValue(tokenIn, tokenOut, amountAfterFee);

        _mintMock(msg.sender, tokenOut, amountOut, bytes32("swap_out"));

        if (!counter.swapPointDone) {
            counter.swapPointDone = true;
            _addWeeklyPoints(msg.sender, POINT_SWAP, ACTIVITY_SWAP);
        }

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_SWAP, 50, 10);

        emit MockSwap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, burnFee);
    }

    function quoteMockSwap(
        uint8 tokenIn,
        uint8 tokenOut,
        uint256 amountIn
    ) external pure returns (uint256 amountOut, uint256 burnFee) {
        if (amountIn == 0) return (0, 0);
        if (tokenIn > uint8(MockToken.mBTC)) revert InvalidToken();
        if (tokenOut > uint8(MockToken.mBTC)) revert InvalidToken();
        if (tokenIn == tokenOut) revert InvalidToken();

        burnFee = (amountIn * MOCK_SWAP_FEE_BPS) / BPS;
        amountOut = _convertMockValue(tokenIn, tokenOut, amountIn - burnFee);
    }

    function _convertMockValue(
        uint8 tokenIn,
        uint8 tokenOut,
        uint256 amountIn
    ) internal pure returns (uint256) {
        uint256 valueMUSD = _toMUSDValue(tokenIn, amountIn);
        return _fromMUSDValue(tokenOut, valueMUSD);
    }

    function _toMUSDValue(uint8 token, uint256 amount) internal pure returns (uint256) {
        if (token == uint8(MockToken.mGIWA)) {
            return amount;
        }

        if (token == uint8(MockToken.mUSD)) {
            return amount;
        }

        if (token == uint8(MockToken.mBTC)) {
            return amount * 100_000;
        }

        revert InvalidToken();
    }

    function _fromMUSDValue(uint8 token, uint256 valueMUSD) internal pure returns (uint256) {
        if (token == uint8(MockToken.mGIWA)) {
            return valueMUSD;
        }

        if (token == uint8(MockToken.mUSD)) {
            return valueMUSD;
        }

        if (token == uint8(MockToken.mBTC)) {
            return valueMUSD / 100_000;
        }

        revert InvalidToken();
    }

    // =============================================================
    // Simulated liquidity constants
    // =============================================================

    uint128 public constant POINT_ADD_LIQUIDITY = 25;
    uint128 public constant POINT_CLAIM_APR = 10;

    uint256 public constant APR_MGIWA_MUSD_BPS = 2_400; // 24%
    uint256 public constant APR_MGIWA_MBTC_BPS = 3_600; // 36%
    uint256 public constant APR_MUSD_MBTC_BPS = 1_800; // 18%

    function getPairTokens(uint8 pairType) public pure returns (uint8 tokenA, uint8 tokenB) {
        if (pairType == uint8(PairType.mGIWA_mUSD)) {
            return (uint8(MockToken.mGIWA), uint8(MockToken.mUSD));
        }

        if (pairType == uint8(PairType.mGIWA_mBTC)) {
            return (uint8(MockToken.mGIWA), uint8(MockToken.mBTC));
        }

        if (pairType == uint8(PairType.mUSD_mBTC)) {
            return (uint8(MockToken.mUSD), uint8(MockToken.mBTC));
        }

        revert InvalidPair();
    }

    function getPairAprBps(uint8 pairType) public pure returns (uint256) {
        if (pairType == uint8(PairType.mGIWA_mUSD)) return APR_MGIWA_MUSD_BPS;
        if (pairType == uint8(PairType.mGIWA_mBTC)) return APR_MGIWA_MBTC_BPS;
        if (pairType == uint8(PairType.mUSD_mBTC)) return APR_MUSD_MBTC_BPS;

        revert InvalidPair();
    }

    function addLiquidity(
        uint8 pairType,
        uint256 amountA,
        uint256 amountB
    ) external nonReentrant whenLiquidityActive returns (uint256 positionId) {
        _rolloverIfNeeded();
        if (amountA == 0 || amountB == 0) revert ZeroAmount();

        (uint8 tokenA, uint8 tokenB) = getPairTokens(pairType);

        uint256 valueA = _toMUSDValue(tokenA, amountA);
        uint256 valueB = _toMUSDValue(tokenB, amountB);
        uint256 totalValue = valueA + valueB;

        if (totalValue < MIN_LP_VALUE) revert InvalidAmount();

        uint256 newUserPoolValue = userPoolValue[msg.sender][pairType] + totalValue;

        if (newUserPoolValue > MAX_LP_VALUE_PER_WALLET_POOL) {
            revert CapExceeded();
        }

        if (_activePositionCount(msg.sender) >= MAX_ACTIVE_POSITIONS) {
            revert CapExceeded();
        }

        _burnMock(msg.sender, tokenA, amountA, bytes32("lp_add_a"));
        _burnMock(msg.sender, tokenB, amountB, bytes32("lp_add_b"));

        positionId = nextPositionId;
        nextPositionId += 1;

        lpPositions[positionId] = LpPosition({
            owner: msg.sender,
            amountA: _toUint128(amountA),
            amountB: _toUint128(amountB),
            valueMUSD: _toUint128(totalValue),
            lastClaimAt: uint64(block.timestamp),
            pairType: pairType,
            active: true
        });

        userPositions[msg.sender].push(positionId);
        userPoolValue[msg.sender][pairType] = newUserPoolValue;

        _addWeeklyLiquidityPointIfNeeded(msg.sender);
        activityMask[currentRoundId][msg.sender] |= ACTIVITY_LIQUIDITY;

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_LIQUIDITY, 100, 15);

        emit LiquidityAdded(msg.sender, positionId, pairType, totalValue);
    }

    function _activePositionCount(address user) internal view returns (uint8 count) {
        uint256[] storage ids = userPositions[user];

        for (uint256 i = 0; i < ids.length; i++) {
            if (lpPositions[ids[i]].active) {
                count++;
            }
        }
    }

    function _addWeeklyLiquidityPointIfNeeded(address user) internal {
        WeeklyCounter storage counter = weeklyCounters[user];

        if (counter.roundId != uint64(currentRoundId)) {
            counter.roundId = uint64(currentRoundId);
            counter.addLiquidityPointDone = false;
            counter.claimAprPointDone = false;
            counter.activeDepositPointDone = false;
            counter.questBonusPoints = 0;
        }

        if (!counter.addLiquidityPointDone) {
            counter.addLiquidityPointDone = true;
            _addWeeklyPoints(user, POINT_ADD_LIQUIDITY, ACTIVITY_LIQUIDITY);
        }
    }

    function pendingApr(uint256 positionId) public view returns (uint256) {
        LpPosition storage position = lpPositions[positionId];

        if (!position.active) return 0;

        uint256 elapsed = block.timestamp - position.lastClaimAt;
        uint256 aprBps = getPairAprBps(position.pairType);

        uint256 reward = (uint256(position.valueMUSD) * aprBps * elapsed)
            / BPS
            / 365 days;

        uint256 emittedThisWeek = weeklyPoolEmission[currentRoundId][position.pairType];
        uint256 cap = _poolWeeklyEmissionCap(position.pairType);

        if (emittedThisWeek >= cap) {
            return 0;
        }

        uint256 remaining = cap - emittedThisWeek;

        if (reward > remaining) {
            return remaining;
        }

        return reward;
    }

    function claimApr(uint256 positionId) external nonReentrant whenLiquidityActive {
        _rolloverIfNeeded();
        LpPosition storage position = lpPositions[positionId];

        if (position.owner != msg.sender) revert Unauthorized();
        if (!position.active) revert InvalidPosition();

        uint256 reward = pendingApr(positionId);

        position.lastClaimAt = uint64(block.timestamp);

        if (reward > 0) {
            weeklyPoolEmission[currentRoundId][position.pairType] += reward;
            _mintMock(msg.sender, uint8(MockToken.mGIWA), reward, bytes32("lp_apr"));
        }

        _addWeeklyAprPointIfNeeded(msg.sender);
        activityMask[currentRoundId][msg.sender] |= ACTIVITY_APR;

        _completeOneTimeQuest(msg.sender, QUEST_FIRST_APR, 50, 10);

        emit AprClaimed(msg.sender, positionId, position.pairType, reward);
    }

    function _poolWeeklyEmissionCap(uint8 pairType) internal pure returns (uint256) {
        if (pairType == uint8(PairType.mGIWA_mUSD)) return 10_000;
        if (pairType == uint8(PairType.mGIWA_mBTC)) return 15_000;
        if (pairType == uint8(PairType.mUSD_mBTC)) return 8_000;

        revert InvalidPair();
    }

    function _addWeeklyAprPointIfNeeded(address user) internal {
        WeeklyCounter storage counter = weeklyCounters[user];

        if (counter.roundId != uint64(currentRoundId)) {
            counter.roundId = uint64(currentRoundId);
            counter.addLiquidityPointDone = false;
            counter.claimAprPointDone = false;
            counter.activeDepositPointDone = false;
            counter.questBonusPoints = 0;
        }

        if (!counter.claimAprPointDone) {
            counter.claimAprPointDone = true;
            _addWeeklyPoints(user, POINT_CLAIM_APR, ACTIVITY_APR);
        }
    }

    function removeLiquidity(uint256 positionId) external nonReentrant whenLiquidityActive {
        _rolloverIfNeeded();
        LpPosition storage position = lpPositions[positionId];

        if (position.owner != msg.sender) revert Unauthorized();
        if (!position.active) revert InvalidPosition();

        uint8 pairType = position.pairType;
        (uint8 tokenA, uint8 tokenB) = getPairTokens(pairType);

        uint256 reward = pendingApr(positionId);

        if (reward > 0) {
            weeklyPoolEmission[currentRoundId][pairType] += reward;
            _mintMock(msg.sender, uint8(MockToken.mGIWA), reward, bytes32("lp_apr_remove"));
            emit AprClaimed(msg.sender, positionId, pairType, reward);
        }

        uint256 amountA = position.amountA;
        uint256 amountB = position.amountB;
        uint256 valueMUSD = position.valueMUSD;

        position.active = false;
        position.lastClaimAt = uint64(block.timestamp);

        if (userPoolValue[msg.sender][pairType] >= valueMUSD) {
            userPoolValue[msg.sender][pairType] -= valueMUSD;
        } else {
            userPoolValue[msg.sender][pairType] = 0;
        }

        _mintMock(msg.sender, tokenA, amountA, bytes32("lp_remove_a"));
        _mintMock(msg.sender, tokenB, amountB, bytes32("lp_remove_b"));

        emit LiquidityRemoved(msg.sender, positionId, pairType, valueMUSD);
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    // =============================================================
    // Native reward eligibility helpers
    // =============================================================

    function isNativeRewardEligible(
        uint256 roundId,
        address user
    ) public view returns (bool) {
        RoundData storage rd = rounds[roundId];
        NativeAccount storage account = nativeAccounts[user];

        if (account.depositBalance < MIN_NATIVE_DEPOSIT_FOR_REWARD) {
            return false;
        }

        if (account.eligibleSince == 0) {
            return false;
        }

        if (rd.endTime <= DEPOSIT_MATURITY) {
            return false;
        }

        uint64 latestEligibleSince = rd.endTime - DEPOSIT_MATURITY;

        if (account.eligibleSince > latestEligibleSince) {
            return false;
        }

        if (_activityCategoryCount(activityMask[roundId][user]) < 2) {
            return false;
        }

        return true;
    }

    function activityCategoryCount(
        uint256 roundId,
        address user
    ) external view returns (uint8) {
        return _activityCategoryCount(activityMask[roundId][user]);
    }

    function _activityCategoryCount(uint8 mask) internal pure returns (uint8 count) {
        for (uint8 i = 0; i < 7; i++) {
            if ((mask & (uint8(1) << i)) != 0) {
                count++;
            }
        }
    }

    // =============================================================
    // Weekly finalization and native reward claim
    // =============================================================


    function _rolloverIfNeeded() internal {
        if (canFinalizeWeekly()) {
            _finalizeWeekly();
        }
    }


    function canFinalizeWeekly() public view returns (bool) {
        RoundData storage rd = rounds[currentRoundId];

        return block.timestamp >= rd.endTime && !rd.finalized && !weeklyPaused;
    }

    function finalizeWeekly() public nonReentrant whenWeeklyActive {
        _finalizeWeekly();
    }

    function _finalizeWeekly() internal {
        RoundData storage rd = rounds[currentRoundId];

        if (block.timestamp < rd.endTime) revert RoundNotEnded();
        if (rd.finalized) revert AlreadyFinalized();

        rd.finalized = true;

        uint256 payoutAmount = _computeWeeklyPayout();

        uint256 rank1Reward = 0;
        uint256 rank2Reward = 0;
        uint256 rank3Reward = 0;

        if (payoutAmount > 0) {
            rank1Reward = (payoutAmount * 50) / 100;
            rank2Reward = (payoutAmount * 30) / 100;
            rank3Reward = payoutAmount - rank1Reward - rank2Reward;

            _creditWeeklyWinner(currentRoundId, rd.rank1.user, rank1Reward);
            _creditWeeklyWinner(currentRoundId, rd.rank2.user, rank2Reward);
            _creditWeeklyWinner(currentRoundId, rd.rank3.user, rank3Reward);
        }

        emit WeeklyFinalized(
            currentRoundId,
            payoutAmount,
            rd.rank1.user,
            rd.rank2.user,
            rd.rank3.user
        );

        _startNextRound();
    }

    function claimWeeklyReward() external nonReentrant {
        uint256 amount = pendingNativeReward[msg.sender];

        if (amount == 0) revert ZeroAmount();

        pendingNativeReward[msg.sender] = 0;
        totalPendingNativeRewards -= amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit NativeRewardClaimed(msg.sender, amount);
    }

    function _computeWeeklyPayout() internal returns (uint256 payoutAmount) {
        uint256 feePart = weeklyFeePool;
        uint256 sponsorPart = sponsorWeeklyReserve;

        if (sponsorPart > MAX_SPONSOR_DRIP_PER_WEEK) {
            sponsorPart = MAX_SPONSOR_DRIP_PER_WEEK;
        }

        payoutAmount = feePart + sponsorPart;

        if (payoutAmount > EARLY_HARD_WEEKLY_CAP) {
            payoutAmount = EARLY_HARD_WEEKLY_CAP;
        }

        if (payoutAmount == 0) {
            return 0;
        }

        if (feePart >= payoutAmount) {
            weeklyFeePool -= payoutAmount;
            return payoutAmount;
        }

        weeklyFeePool = 0;

        uint256 remaining = payoutAmount - feePart;

        if (remaining > sponsorWeeklyReserve) {
            remaining = sponsorWeeklyReserve;
            payoutAmount = feePart + remaining;
        }

        sponsorWeeklyReserve -= remaining;

        return payoutAmount;
    }

    function _creditWeeklyWinner(
        uint256 roundId,
        address winner,
        uint256 amount
    ) internal {
        if (winner == address(0) || amount == 0) {
            return;
        }

        if (!isNativeRewardEligible(roundId, winner)) {
            return;
        }

        pendingNativeReward[winner] += amount;
        totalPendingNativeRewards += amount;
    }

    function _startNextRound() internal {
        currentRoundId += 1;

        uint64 start = uint64(block.timestamp);
        uint64 end = start + WEEKLY_ROUND_DURATION;

        rounds[currentRoundId].startTime = start;
        rounds[currentRoundId].endTime = end;
    }

    // =============================================================
    // Quest Board
    // =============================================================

    uint8 public constant QUEST_FIRST_DEPOSIT = 1;
    uint8 public constant QUEST_FIRST_DAILY = 2;
    uint8 public constant QUEST_FIRST_SCRATCH = 3;
    uint8 public constant QUEST_FIRST_WHEEL = 4;
    uint8 public constant QUEST_FIRST_SWAP = 5;
    uint8 public constant QUEST_FIRST_LIQUIDITY = 6;
    uint8 public constant QUEST_FIRST_APR = 7;

    uint128 public constant MAX_QUEST_BONUS_POINTS = 50;

    function _completeOneTimeQuest(
        address user,
        uint8 questId,
        uint256 mockReward,
        uint128 points
    ) internal {
        if (questsPaused) return;

        if (oneTimeQuestDone[user][questId]) {
            return;
        }

        oneTimeQuestDone[user][questId] = true;

        if (mockReward > 0) {
            _mintMock(user, uint8(MockToken.mGIWA), mockReward, bytes32("quest"));
        }

        _addQuestBonusPoints(user, points);

        activityMask[currentRoundId][user] |= ACTIVITY_QUEST;

        emit QuestCompleted(user, currentRoundId, questId, false);
    }

    function _addQuestBonusPoints(address user, uint128 points) internal {
        if (points == 0) return;

        WeeklyCounter storage counter = weeklyCounters[user];

        if (counter.roundId != uint64(currentRoundId)) {
            counter.roundId = uint64(currentRoundId);
            counter.addLiquidityPointDone = false;
            counter.claimAprPointDone = false;
            counter.activeDepositPointDone = false;
            counter.questBonusPoints = 0;
        }

        uint256 newQuestPoints = uint256(counter.questBonusPoints) + points;

        if (newQuestPoints > MAX_QUEST_BONUS_POINTS) {
            points = uint128(MAX_QUEST_BONUS_POINTS - counter.questBonusPoints);
            counter.questBonusPoints = uint16(MAX_QUEST_BONUS_POINTS);
        } else {
            counter.questBonusPoints = uint16(newQuestPoints);
        }

        if (points > 0) {
            _addWeeklyPoints(user, points, ACTIVITY_QUEST);
        }
    }

    // =============================================================
    // Frontend view helpers
    // =============================================================

    function getNativeAccount(
        address user
    )
        external
        view
        returns (
            uint256 depositBalance,
            uint256 lifetimeDeposited,
            uint256 depositRewardMinted,
            uint64 eligibleSince,
            uint256 pendingReward
        )
    {
        NativeAccount storage account = nativeAccounts[user];

        return (
            account.depositBalance,
            account.lifetimeDeposited,
            account.depositRewardMinted,
            account.eligibleSince,
            pendingNativeReward[user]
        );
    }

    function getMockBalances(
        address user
    ) external view returns (uint256 mGIWA, uint256 mUSD, uint256 mBTC) {
        return (
            mockBalance[user][uint8(MockToken.mGIWA)],
            mockBalance[user][uint8(MockToken.mUSD)],
            mockBalance[user][uint8(MockToken.mBTC)]
        );
    }

    function getCurrentTop3()
        external
        view
        returns (TopUser memory rank1, TopUser memory rank2, TopUser memory rank3)
    {
        RoundData storage rd = rounds[currentRoundId];

        return (rd.rank1, rd.rank2, rd.rank3);
    }

    function getRoundInfo()
        external
        view
        returns (
            uint256 roundId,
            uint64 startTime,
            uint64 endTime,
            bool finalized,
            bool canFinalize
        )
    {
        RoundData storage rd = rounds[currentRoundId];

        return (
            currentRoundId,
            rd.startTime,
            rd.endTime,
            rd.finalized,
            canFinalizeWeekly()
        );
    }

    function getUserDailyCounter(
        address user
    )
        external
        view
        returns (
            uint64 day,
            uint8 scratchCount,
            uint8 wheelCount,
            bool dailyLoginDone,
            bool swapPointDone
        )
    {
        DailyCounter storage counter = dailyCounters[user];

        return (
            counter.day,
            counter.scratchCount,
            counter.wheelCount,
            counter.dailyLoginDone,
            counter.swapPointDone
        );
    }

    function getUserWeeklyCounter(
        address user
    )
        external
        view
        returns (
            uint64 roundId,
            bool addLiquidityPointDone,
            bool claimAprPointDone,
            bool activeDepositPointDone,
            uint16 questBonusPoints
        )
    {
        WeeklyCounter storage counter = weeklyCounters[user];

        return (
            counter.roundId,
            counter.addLiquidityPointDone,
            counter.claimAprPointDone,
            counter.activeDepositPointDone,
            counter.questBonusPoints
        );
    }
}
