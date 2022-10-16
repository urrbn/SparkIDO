// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";


interface IAdmin2 {
    function isAdmin(address user) external view returns (bool);
}

contract SparklaunchSaleERC20 {
    using SafeMath for uint256;

    // Admin contract
    IAdmin2 public admin;
    uint256 public serviceFee;
    address public feeAddr;
    bool public isSaleSuccessful;
    bool public saleFinished;
    // Token used for payment
    address public tokenERC20;
    uint256 public minParticipation;
    uint256 public maxParticipation;
    uint256 public saleStartTime;
    uint256 public publicRoundStartDelta;
    bool public saleCancelledTokensWithdrawn;

    struct Sale {
        // Token being sold
        IERC20 saleToken;
        // Is sale created
        bool isCreated;
        // Are earnings withdrawn
        bool earningsWithdrawn;
        // Is leftover withdrawn
        bool leftoverWithdrawn;
        // Have saleTokens been deposited
        bool saleTokensDeposited;
        // Address of sale owner
        address saleOwner;
        // Price of the token quoted in ERC20
        uint256 saleTokenPriceInERC20;
        // Total saleTokens being sold
        uint256 totalSaleTokensSold;
        // Total ERC20 Raised
        uint256 totalERC20Raised;
        // Sale end time
        uint256 saleEnd;
        // Hard cap
        uint256 hardCap;
        // Soft cap
        uint256 softCap;
    }

    // Participation structure
    struct Participation {
        uint256 amountBought;
        uint256 amountERC20Paid;
        uint256 tierId;
        bool areTokensWithdrawn;
    }

    // Sale
    Sale public sale;
    
    // Number of users participated in the sale.
    uint256 public numberOfParticipants;

    // Array storing IDS of tiers (IDs start from 1, so they can't be mapped as array indexes
    uint256[] public tierIds;
    // Mapping tier Id to tier start time
    mapping(uint256 => uint256) public tierIdToTierStartTime;
   
    mapping(address => Participation) public userToParticipation;
    // mapping if user is participated or not
    mapping(address => bool) public isParticipated;
    // mapping user to tier
    mapping(address => uint256) public tier;
    

    // Restricting calls only to sale owner
    modifier onlySaleOwner() {
        require(msg.sender == sale.saleOwner, "Restricted to sale owner.");
        _;
    }

    // Restricting calls only to sale admin
    modifier onlyAdmin() {
        require(
            admin.isAdmin(msg.sender),
            "Only admin can call this function."
        );
        _;
    }

    // Events
    event TokensSold(address user, uint256 amount);
    event TokensWithdrawn(address user, uint256 amount);
    event SaleCreated(
        address saleOwner,
        uint256 tokenPriceInERC20,
        uint256 saleEnd,
        uint256 _hardCap,
        uint256 _softCap,
        address _tokenERC20
    );
    event LogwithdrawUserFundsIfSaleCancelled(address user, uint256 amount);
    event LogFinishSale(bool isSaleSucsessful);
    event LogWithdrawDepositedTokensIfSaleCancelled(address user, uint256 amount);
    event RoundAdded(uint256 _tierId, uint256 _startTime);
    
    constructor(
        address _admin, 
        uint256 _serviceFee, 
        address _feeAddr, 
        uint256 _minParticipation, 
        uint256 _maxParticipation){
        require(_admin != address(0), "Address zero validation");
        require(_feeAddr != address(0), "Address zero validation");
        admin = IAdmin2(_admin);
        serviceFee = _serviceFee;
        feeAddr = _feeAddr;
        minParticipation = _minParticipation;
        maxParticipation = _maxParticipation;
    }

    /// @notice     Admin function to set sale parameters
    function setSaleParams(
        address _saleToken,
        address _saleOwner,
        uint256 _saleTokenPriceInERC20,
        uint256 _saleEnd,
        uint256 _saleStart,
        uint256 _publicRoundStartDelta,
        uint256 _hardCap,
        uint256 _softCap,
        address _tokenERC20
    )
        external
        onlyAdmin
    {
        require(!sale.isCreated, "Sale already created.");
        require(_saleToken != address(0), "setSaleParams: Token address can not be 0.");
        require(
            _saleOwner != address(0),
            "Invalid sale owner address."
        );
        require(
            _tokenERC20 != address(0),
            "Invalid address."
        );
        require(
            _saleTokenPriceInERC20 != 0 &&
            _hardCap != 0 &&
            _softCap != 0 &&
            _saleEnd > block.timestamp,
            "Invalid input."
        );
        require(_saleEnd <= block.timestamp + 8640000, "Max sale duration is 100 days");
        require(_saleStart >= block.timestamp, "Sale start should be in the future");
        require(_saleStart < _saleEnd, "Sale start should be before sale end");
        

        // Set params
        sale.saleToken = IERC20(_saleToken);
        sale.isCreated = true;
        sale.saleOwner = _saleOwner;
        sale.saleTokenPriceInERC20 = _saleTokenPriceInERC20;
        sale.saleEnd = _saleEnd;
        sale.hardCap = _hardCap;
        sale.softCap = _softCap;
        tokenERC20 = _tokenERC20;
        publicRoundStartDelta = _publicRoundStartDelta;
        saleStartTime = _saleStart;
    

        // Emit event
        emit SaleCreated(
            sale.saleOwner,
            sale.saleTokenPriceInERC20,
            sale.saleEnd,
            sale.hardCap,
            sale.softCap,
            tokenERC20
        );
    }

    function grantATierMultiply(address[] memory addys, uint256[] memory tiers) external onlyAdmin {
        require(addys.length == tiers.length, "Invalid input");
        for (uint256 i = 0; i < addys.length; i++){
            grantATier(addys[i], tiers[i]);
        }
    }

    function grantATier(address user, uint256 _tier) public onlyAdmin {
        require(_tier <= 5, "Max tier is 5");
        require(_tier != 0, "Tier can't be 0");
        require(user != address(0), "Zero address validation");
        tier[user] = _tier;
    }

    // Function for owner to deposit saleTokens, can be called only once.
    function depositSaleTokens()
        external
        onlySaleOwner
    {
        // Require that setSaleParams was called
        require(
            sale.hardCap > 0,
            "Sale parameters not set."
        );

        // Require that saleTokens are not deposited
        require(
            !sale.saleTokensDeposited,
            "Tokens already deposited."
        );

        // Mark that saleTokens are deposited
        sale.saleTokensDeposited = true;

        // Perform safe transfer
        sale.saleToken.transferFrom(
            msg.sender,
            address(this),
            sale.hardCap
        );
    }

    // Participate function for manual participation
    function participate(
        uint256 amountERC20,
        uint256 tierId
    ) external {
        require(tierId != 0 && tierId <= 5, "Invalid tier id");
        require(amountERC20 >= minParticipation, "Amount should be greater than minParticipation");
        require(amountERC20 <= maxParticipation, "Amount should be not greater than maxParticipation");

        _participate(msg.sender,amountERC20, tierId);
    }

    // Function to participate in the sales
    function _participate(
        address user,
        uint256 amountERC20, 
        uint256 _tierId
    ) internal {

       require(!isParticipated[user], "Already participated.");
       require(tier[user] == _tierId, "Wrong Round");
       require(block.timestamp >= tierIdToTierStartTime[_tierId], "Your round haven't started yet");
       if(_tierId == 0){
           require(block.timestamp >= tierIdToTierStartTime[5] + publicRoundStartDelta);
       }
       require(sale.saleTokensDeposited == true, "Sale tokens were not deposited");
       require(IERC20(tokenERC20).allowance(user, address(this)) >= amountERC20, "Insuficcient allowance");
       console.log(IERC20(tokenERC20).allowance(user, address(this)), "Allowance");
       console.log(amountERC20, "amount");
        // Compute the amount of saleTokens user is buying
        uint256 amountOfTokensBuying = 
            (amountERC20).mul(uint(10) ** IERC20Metadata(address(sale.saleToken)).decimals()).div(sale.saleTokenPriceInERC20);

        // Must buy more than 0 tokens
        require(amountOfTokensBuying > 0, "Can't buy 0 tokens");


        // Require that amountOfTokensBuying is less than sale token leftover cap
        require(
            amountOfTokensBuying <= sale.hardCap.sub(sale.totalSaleTokensSold),
            "Not enough tokens to sell."
        );

        // Increase amount of sold tokens
        sale.totalSaleTokensSold = sale.totalSaleTokensSold.add(amountOfTokensBuying);

        // Increase amount of ERC20 raised
        sale.totalERC20Raised = sale.totalERC20Raised.add(amountERC20);

        // Create participation object
        Participation memory p = Participation({
            amountBought: amountOfTokensBuying,
            amountERC20Paid: amountERC20,
            tierId: _tierId,
            areTokensWithdrawn: false
        });

        // Add participation for user.
        userToParticipation[user] = p;
        // Mark user is participated
        isParticipated[user] = true;
        // Increment number of participants in the Sale.
        numberOfParticipants++;
        // Transfer tokens 
        bool success = IERC20(tokenERC20).transferFrom(user, address(this), amountERC20);
        require(success);

        emit TokensSold(user, amountOfTokensBuying);
    }


    // Expose function where user can withdraw multiple unlocked portions at once.
    function withdraw() external {
        require(block.timestamp > sale.saleEnd, "Sale is running");
        require(saleFinished == true && isSaleSuccessful == true, "Sale was cancelled");
        uint256 totalToWithdraw = 0;

        // Retrieve participation from storage
        Participation storage p = userToParticipation[msg.sender];

        require(p.areTokensWithdrawn == false, "Already withdrawn");

        uint256 amountWithdrawing = p.amountBought;
        totalToWithdraw = totalToWithdraw.add(amountWithdrawing);

        p.areTokensWithdrawn = true;

        if(totalToWithdraw > 0) {
            // Transfer tokens to user
            sale.saleToken.transfer(msg.sender, totalToWithdraw);
            // Trigger an event
            emit TokensWithdrawn(msg.sender, totalToWithdraw);
        }
    }

    function editMaxAndMinParticipation(uint256 _maxP, uint256 _minP) external onlyAdmin{
        require(block.timestamp < saleStartTime, "Sale already started");
        minParticipation = _minP;
        maxParticipation = _maxP;
    }

    function finishSale() public onlyAdmin{
        require(block.timestamp >= sale.saleEnd, "Sale is not finished yet");
        if(sale.totalERC20Raised >= sale.softCap){
            isSaleSuccessful = true;
            saleFinished = true;
        } else{
            isSaleSuccessful = false;
            saleFinished = true;
        }
        emit LogFinishSale(isSaleSuccessful);
    }

    function withdrawUserFundsIfSaleCancelled() external{
        require(saleFinished == true && isSaleSuccessful == false, "Sale wasn't cancelled.");
        require(isParticipated[msg.sender], "Did not participate.");
        require(block.timestamp >= sale.saleEnd, "Sale running");
        // Retrieve participation from storage
        Participation storage p = userToParticipation[msg.sender];
        uint256 amountERC20Withdrawing = p.amountERC20Paid;
        safeTransferERC20(msg.sender, amountERC20Withdrawing);
        emit LogwithdrawUserFundsIfSaleCancelled(msg.sender, amountERC20Withdrawing);
    }

    function withdrawDepositedTokensIfSaleCancelled() external onlySaleOwner{
        require(saleFinished == true && isSaleSuccessful == false, "Sale wasn't cancelled");
        require(block.timestamp >= sale.saleEnd, "Sale running");
        require(saleCancelledTokensWithdrawn == false, "Already withdrawn");
        require(sale.saleTokensDeposited == true, "Tokens were not deposited.");
        saleCancelledTokensWithdrawn = true;
        // Perform safe transfer
        sale.saleToken.transfer(
            msg.sender,
            sale.hardCap 
        );
        emit LogWithdrawDepositedTokensIfSaleCancelled(msg.sender, sale.hardCap);
    }

    // Internal function to handle safe transfer
    function safeTransferERC20(address to, uint256 value) internal {
        (bool success) = IERC20(tokenERC20).transfer(to, value);
        require(success);
    }

    // Function to withdraw all the earnings and the leftover of the sale contract.
    function withdrawEarningsAndLeftover() external onlySaleOwner {
        withdrawEarningsInternal();
        withdrawLeftoverInternal();
    }

    // Function to withdraw only earnings
    function withdrawEarnings() external onlySaleOwner {
        withdrawEarningsInternal();
    }

    // Function to withdraw only leftover
    function withdrawLeftover() external onlySaleOwner {
        withdrawLeftoverInternal();
    }

    // Function to withdraw earnings
    function withdrawEarningsInternal() internal  {
        require(saleFinished == true && isSaleSuccessful == true, "Sale was cancelled");
        // Make sure sale ended
        require(block.timestamp >= sale.saleEnd,"Sale Running");

        // Make sure owner can't withdraw twice
        require(!sale.earningsWithdrawn,"Can't withdraw twice");
        sale.earningsWithdrawn = true;
        // Earnings amount of the owner in ERC20
        uint256 totalProfit = sale.totalERC20Raised;
        uint256 totalFee = _calculateServiceFee(totalProfit);
        uint256 saleOwnerProfit = totalProfit.sub(totalFee);

        safeTransferERC20(msg.sender, saleOwnerProfit);
        safeTransferERC20(feeAddr, totalFee);
    }

    // Function to withdraw leftover
    function withdrawLeftoverInternal() internal {
        require(saleFinished == true && isSaleSuccessful == true, "Sale wasn cancelled");
        // Make sure sale ended
        require(block.timestamp >= sale.saleEnd);

        // Make sure owner can't withdraw twice
        require(!sale.leftoverWithdrawn,"can't withdraw twice");
        sale.leftoverWithdrawn = true;

        // Amount of saleTokens which are not sold
        uint256 leftover = sale.hardCap.sub(sale.totalSaleTokensSold);

        if (leftover > 0) {
            sale.saleToken.transfer(msg.sender, leftover);
        }
    }

    // Function where admin can withdraw all unused funds.
    function withdrawUnusedFunds() external onlyAdmin {
        uint256 balanceERC20 = IERC20(tokenERC20).balanceOf(address(this));

        uint256 totalReservedForRaise = sale.earningsWithdrawn ? 0 : sale.totalERC20Raised;

        safeTransferERC20(
            msg.sender,
            balanceERC20.sub(totalReservedForRaise)
        );
    }

    /// @notice     Function to get participation for passed user address
    function getParticipation(address _user)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        Participation memory p = userToParticipation[_user];
        return (
            p.amountBought,
            p.amountERC20Paid,
            p.tierId,
            p.areTokensWithdrawn
        );
    }

    /// @notice     Function to remove stuck tokens from sale contract
    function removeStuckTokens(
        address token,
        address beneficiary
    )
        external
        onlyAdmin
    {
        // Require that token address does not match with sale token
        require(token != address(sale.saleToken), "Can't withdraw sale token.");
        // Safe transfer token from sale contract to beneficiary
        IERC20(token).transfer(beneficiary, IERC20(token).balanceOf(address(this)));
    }

    /// @notice     Setting rounds for sale.
    function setRounds(
        uint256[] calldata startTimes
    )
        external
        onlyAdmin
    {
        require(sale.isCreated);
        require(tierIds.length == 0, "Rounds set already.");
        require(startTimes.length == 5, "Should be 5 tiers");
        require(publicRoundStartDelta + startTimes[4] < sale.saleEnd, "Public round should start befire sale end");

        uint256 lastTimestamp = 0;

        require(startTimes[0] >= block.timestamp);

        for (uint256 i = 0; i < startTimes.length; i++) {
            require(startTimes[i] < sale.saleEnd, "Start time should be before sale end");
            require(startTimes[i] > lastTimestamp, "Start time should be after last start time");
            lastTimestamp = startTimes[i];

            // Compute round Id
            uint256 tierId = i + 1;

            // Push id to array of ids
            tierIds.push(tierId);


            // Map round id to round
            tierIdToTierStartTime[tierId] = startTimes[i];

            // Fire event
            emit RoundAdded(tierId, startTimes[i]);
        }
    }

    /// @notice     Get current round in progress.
    ///             If 0 is returned, means sale didn't start or it's ended.
    function getCurrentRound() public view returns (uint256) {
        uint256 i = 0;
        if (block.timestamp < tierIdToTierStartTime[tierIds[0]]) {
            return 0; // Sale didn't start yet.
        }

        while (
            (i + 1) < tierIds.length &&
            block.timestamp > tierIdToTierStartTime[tierIds[i + 1]]
        ) {
            i++;
        }

        if (block.timestamp >= sale.saleEnd) {
            return 0; // Means sale is ended
        }

        return tierIds[i];
    }

    function getNumberOfRegisteredUsers() external view returns(uint256) {
        return numberOfParticipants;
    }

    function _calculateServiceFee(uint256 _amount)
        public
        view
        returns (uint256)
    {

        return _amount.mul(serviceFee).div(10**4);
    }

    // Function to act as a fallback and handle receiving BNB.
    receive() external payable {}
}