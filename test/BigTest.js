const { ethers } = require("hardhat");
const { expect } = require("chai");
const ethUtil = require("ethereumjs-util")
const {BigNumber} = require("ethers");

describe("SparklaunchSale", function() {

  let Admin;
  let SparklaunchSale;
  let SaleToken;
  let SalesFactory;
  let deployer, alice, bob, cedric;
  let ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  let ONE_ADDRESS = "0x0000000000000000000000000000000000000001";

  const DECIMALS = 18; // Working with non-18 decimals
  const MULTIPLIER = (10 ** DECIMALS).toString();
  const REV = (10 ** (18-DECIMALS)).toString();


  const TOKEN_PRICE_IN_BNB = (10 ** DECIMALS).toString();
  const AMOUNT_OF_TOKENS_TO_SELL = 1000;
  const SALE_END_DELTA = 130;
  const TOKENS_UNLOCK_TIME_DELTA = 150;
  const ROUNDS_START_DELTAS = [50, 70, 90, 100, 110];
  const SOFT_CAP = 100;
  const HARD_CAP = 1000;
  const FIRST_ROUND = 1;
  const MIDDLE_ROUND = 2;
  const LAST_ROUND = 3;
  const PARTICIPATION_AMOUNT = 150 * REV;
  const PARTICIPATION_ROUND = 1;
  const PARTICIPATION_VALUE = 150 * REV;


  function firstOrDefault(first, key, def) {
    if (first && first[key] !== undefined) {
      return first[key];
    }
    return def;
  }


  function participate(params) {
    const registrant = firstOrDefault(params, 'sender', deployer);

    const userAddress = registrant.address;
    const participationAmount = firstOrDefault(params, 'participationAmount', PARTICIPATION_AMOUNT);
    const participationRound = firstOrDefault(params, "participationRound", PARTICIPATION_ROUND);
    const value = firstOrDefault(params, "participationValue", PARTICIPATION_VALUE);
    return SparklaunchSale.connect(registrant).participate(participationRound, {value: value});
  }

  async function getCurrentBlockTimestamp() {
    return (await ethers.provider.getBlock('latest')).timestamp;
  }

  async function setSaleParams(params) {
    const blockTimestamp = await getCurrentBlockTimestamp();
    const saleStart = await getCurrentBlockTimestamp() + 10;
    const publicRound = 10;
    const token = firstOrDefault(params, 'token', SaleToken.address);
    const saleOwner = firstOrDefault(params, 'saleOwner', deployer.address);
    const tokenPriceInBNB = firstOrDefault(params, 'tokenPriceInBNB', TOKEN_PRICE_IN_BNB);
    const softCap = firstOrDefault(params, 'softCap', SOFT_CAP);
    const hardCap = firstOrDefault(params, 'hardCap', HARD_CAP);
    const saleEnd = blockTimestamp + firstOrDefault(params, 'saleEndDelta', SALE_END_DELTA);

    return await SparklaunchSale.setSaleParams(
        token, saleOwner, tokenPriceInBNB, saleEnd,saleStart, publicRound, 
        hardCap, softCap
    );
  }

  async function setRounds(params) {
    const blockTimestamp = await getCurrentBlockTimestamp();

    const startTimes = firstOrDefault(params, 'startTimes', ROUNDS_START_DELTAS).map((s) => blockTimestamp+s);

    return SparklaunchSale.setRounds(startTimes);
  }

  async function grantTiers() {
    const tiers = [FIRST_ROUND, FIRST_ROUND, LAST_ROUND]
    const addys = [deployer.address, alice.address, bob.address]
    return SparklaunchSale.grantATierMultiply(addys, tiers);
  }

  async function depositTokens() {
    await SaleToken.approve(SparklaunchSale.address, HARD_CAP);
    await SparklaunchSale.depositTokens();
  }

  async function runFullSetupNoDeposit(params) {
    await setSaleParams(params);
    await setRounds(params);
    await grantTiers();
  }

  async function runFullSetup(params) {
    await setSaleParams(params);
    await setRounds(params);
    await depositTokens();
    await grantTiers();
  }


  beforeEach(async function() {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    cedric = accounts[3];

    const SaleTokenFactory = await ethers.getContractFactory("SaleToken");
    SaleToken = await SaleTokenFactory.deploy();

    const AdminFactory = await ethers.getContractFactory("Admin");
    Admin = await AdminFactory.deploy([deployer.address, alice.address, bob.address]);

    const SalesFactoryFactory = await ethers.getContractFactory("SalesFactory");
    SalesFactory = await SalesFactoryFactory.deploy(Admin.address);


    const saleContract = await ethers.getContractFactory("SparklaunchSale");
    await SalesFactory.setFeeAddr(cedric.address);
    await SalesFactory.setServiceFee(100);
    await SalesFactory.deployNormalSale(100, 200, 1);
    const SparklaunchSaleFactory = await ethers.getContractFactory("SparklaunchSale");
    SparklaunchSale = SparklaunchSaleFactory.attach(await SalesFactory.allSales(0));
  });

  context.only("Setup", async function() {
    it("Should setup the token correctly", async function() {
      // Given
      let admin = await SparklaunchSale.admin();
      
      // Then
      expect(admin).to.equal(Admin.address);
    });

    describe("Set sale parameters", async function() {
      it("Should set the sale parameters", async function() {
        // Given
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        const saleStart = await getCurrentBlockTimestamp() + 10;
        const publicRound = 10;
        const token = SaleToken.address;
        const saleOwner = deployer.address;
        const tokenPriceInBNB = TOKEN_PRICE_IN_BNB;
        const hardCap = HARD_CAP;
        const softCap = SOFT_CAP;
        const saleEnd = blockTimestamp + SALE_END_DELTA;


        // When
        await SparklaunchSale.setSaleParams(
            token, saleOwner, tokenPriceInBNB, saleEnd, saleStart, publicRound, 
            hardCap, softCap
        );

        // Then
        const sale = await SparklaunchSale.sale();
        expect(sale.token).to.equal(token);
        expect(sale.isCreated).to.be.true;
        expect(sale.saleOwner).to.equal(saleOwner);
        expect(sale.tokenPriceInBNB).to.equal(tokenPriceInBNB);
        expect(sale.hardCap).to.equal(hardCap);
        expect(sale.softCap).to.equal(softCap);
        expect(sale.saleEnd).to.equal(saleEnd);

        // Deprecated checks

        // expect(await SalesFactory.saleOwnerToSale(saleOwner)).to.equal(SparklaunchSale.address);
        // expect(await SalesFactory.tokenToSale(token)).to.equal(SparklaunchSale.address);
      });

      it("Should not allow non-admin to set sale parameters", async function() {
        // Given
        await Admin.removeAdmin(deployer.address);

        // Then
        await expect(setSaleParams()).to.be.revertedWith('Only admin can call this function.');
      });

      it("Should emit SaleCreated event when parameters are set", async function() {
        // Given
        const blockTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
        const token = SaleToken.address;
        const saleOwner = deployer.address;
        const tokenPriceInBNB = TOKEN_PRICE_IN_BNB;
        const hardCap = HARD_CAP;
        const softCap = SOFT_CAP;
        const saleEnd = blockTimestamp + SALE_END_DELTA;
        const saleStart = await getCurrentBlockTimestamp() + 10;
        const publicRound = 10;
        

        // When
        expect(await SparklaunchSale.setSaleParams(
            token, saleOwner, tokenPriceInBNB, saleEnd, saleStart, publicRound,
            hardCap, softCap
        )).to.emit(SparklaunchSale, "SaleCreated")
        .withArgs(saleOwner, tokenPriceInBNB, saleEnd, hardCap, softCap);
      });

      it("Should not set sale parameters if sale is already created", async function() {
        // Given
        await setSaleParams();

        // Then
        await expect(setSaleParams()).to.be.revertedWith("Sale already created.");
      });


      it("Should not set sale parameters if token address is the zero address", async function() {
        // Then
        await expect(setSaleParams({token: ZERO_ADDRESS})).to.be.revertedWith("setSaleParams: Token address can not be 0.");
      });

      it("Should not set sale parameters if sale owner is the zero address", async function() {
        // Then
        await expect(setSaleParams({saleOwner: ZERO_ADDRESS})).to.be.revertedWith("Invalid sale owner address.");
      });

      it("Should not set sale parameters if token price is 0", async function() {
        // Then
        await expect(setSaleParams({tokenPriceInBNB: 0})).to.be.revertedWith("Invalid input.");
      });

      it("Should not set sale parameters if token amount is 0", async function() {
        // Then
        await expect(setSaleParams({hardCap: 0})).to.be.revertedWith("Invalid input.");
        await expect(setSaleParams({softCap: 0})).to.be.revertedWith("Invalid input.");
      });

      it("Should not set sale parameters if sale end date is in the past", async function() {
        // Then
        await expect(setSaleParams({saleEndDelta: -100})).to.be.revertedWith("Invalid input.");
      });

    });


    describe("Edge Cases & Miscellaneous", async function () {
      

      it("Remove stuck tokens", async () => {
        // Given
        const TokenFactory = await ethers.getContractFactory("TestToken");
        const testToken = await TokenFactory.deploy();

        // When
        const val = 1000;
        await testToken.transfer(SparklaunchSale.address, val);

        // Then
        await SparklaunchSale.removeStuckTokens(testToken.address, alice.address);

        expect(await testToken.balanceOf(alice.address)).to.equal(val);
      });

      it("Should not remove SaleToken using removeStuckTokens", async () => {
        await setSaleParams();

        await expect(SparklaunchSale.removeStuckTokens(SaleToken.address, alice.address))
          .to.be.revertedWith("Can't withdraw sale token.");
      });
    });

    describe("Set sale rounds", async function() {
      it("Should set sale rounds", async function() {
        // Given
        const blockTimestamp = await getCurrentBlockTimestamp();
        const startTimes = ROUNDS_START_DELTAS.map((s) => blockTimestamp+s);
        
        await setSaleParams();
        

        // When
        await SparklaunchSale.setRounds(startTimes);

        // Then
        for (let i = 0; i < startTimes.length; i++) {
          expect(await SparklaunchSale.tierIds(i)).to.equal(i+1);
          expect((await SparklaunchSale.tierIdToTierStartTime(i+1))).to.equal(startTimes[i]);
        }
      });

      it("Should not allow non-admin to set sale rounds", async function() {
        // Given
        await setSaleParams();
        await Admin.removeAdmin(deployer.address);

        // Then
        await expect(setRounds()).to.be.revertedWith("Only admin can call this function.");
      });

      it("Should not set sale rounds if rounds are already set", async function() {
        // Given
        await setSaleParams();
        await setRounds();

        // Then
        await expect(setRounds()).to.be.revertedWith("Rounds set already");
      });


      it("Should not set sale rounds if round start times are not sorted", async function() {
        // Given
        await setSaleParams();

        // Then
        await expect(setRounds({startTimes: [50, 45, 60, 70, 80]})).to.be.reverted;
      });

      it("Should not set sale rounds if 0 rounds are provided", async function() {
        // Given
        await setSaleParams();

        // Then
        await expect(setRounds({startTimes: [], maxParticipations: []})).to.be.reverted;
      });

      it("Should not set sale rounds if start times are in the past", async function() {
        // Given
        await setSaleParams();

        // Then
        await expect(setRounds({startTimes: [-20, 0, 10, 10, 10]})).to.be.reverted;
      });

      it("Should not set sale rounds if start times are after sale end date", async function() {
        // Given
        await setSaleParams();

        // Then
        await expect(setRounds({startTimes: [SALE_END_DELTA-10, SALE_END_DELTA, SALE_END_DELTA+10, SALE_END_DELTA+10, SALE_END_DELTA+10]})).to.be.reverted;
      });

      it("Should not set sale rounds if sale not created", async function() {
        // Then
        await expect(setRounds()).to.be.reverted;
      });

      it("Should emit RoundAdded event", async function() {
        // Given
        const blockTimestamp = await getCurrentBlockTimestamp();
        const startTimes = ROUNDS_START_DELTAS.map((s) => blockTimestamp+s);
        await setSaleParams();

        // Then
        await expect(SparklaunchSale.setRounds(startTimes))
          .to.emit(SparklaunchSale, "RoundAdded")
          .withArgs(1, startTimes[0]);
      });

    });
  });



    describe.only("Deposit tokens", async function() {
      it("Should allow sale owner to deposit tokens", async function() {
        // Given
        await runFullSetupNoDeposit();
        await SaleToken.approve(SparklaunchSale.address, HARD_CAP);

        // When
        await SparklaunchSale.depositTokens();
        // Then
        const balance = await SaleToken.balanceOf(SparklaunchSale.address);
        expect(balance).to.equal(HARD_CAP);
      });

      it("Should not allow non-sale owner to deposit tokens", async function() {
        // Given
        await runFullSetupNoDeposit({saleOwner: bob.address});
        await SaleToken.approve(SparklaunchSale.address, HARD_CAP);

        // Then
        await expect(SparklaunchSale.depositTokens()).to.be.revertedWith("Restricted to sale owner.");
      });
      
    });
  


  context.only("Participation", async function() {
    describe("Participate", async function() {
      it("Should allow user to participate", async function() {
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");


        // When
        await participate();

        // Then
        const sale = await SparklaunchSale.sale();
        const isParticipated = await SparklaunchSale.isParticipated(deployer.address);
        const participation = await SparklaunchSale.userToParticipation(deployer.address);


        expect(sale.totalTokensSold).to.equal(Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER));
        expect(sale.totalBNBRaised).to.equal(PARTICIPATION_VALUE);
        expect(isParticipated).to.be.true;
        expect(participation.amountBought).to.equal(Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER));
        expect(participation.tierId).to.equal(PARTICIPATION_ROUND);
        expect(await SparklaunchSale.getNumberOfRegisteredUsers()).to.equal(1);
      });

      it("Should allow multiple users to participate", async function() {
        // Given
        await runFullSetup();
        const blockTimestamp = await getCurrentBlockTimestamp();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2] + blockTimestamp]);
        await ethers.provider.send("evm_mine");

        // When
        await participate();
        await participate({sender: alice});

        // Then
        const sale = await SparklaunchSale.sale();
        const isParticipatedDeployer = await SparklaunchSale.isParticipated(deployer.address);
        const isParticipatedAlice = await SparklaunchSale.isParticipated(alice.address);
        const participationDeployer = await SparklaunchSale.userToParticipation(deployer.address);
        const participationAlice = await SparklaunchSale.userToParticipation(alice.address);

        expect(sale.totalTokensSold).to.equal(Math.floor(2 * PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER));
        expect(sale.totalBNBRaised).to.equal(BigNumber.from(PARTICIPATION_VALUE).mul(2));
        expect(isParticipatedDeployer).to.be.true;
        expect(isParticipatedAlice).to.be.true;
        expect(participationDeployer.amountBought).to.equal(Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER));
        expect(participationDeployer.tierId).to.equal(PARTICIPATION_ROUND);
        // expect(participationDeployer.isWithdrawn).to.be.false;
        expect(participationAlice.amountBought).to.equal(Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER));
        expect(participationAlice.tierId).to.equal(PARTICIPATION_ROUND);
        // expect(participationAlice.isWithdrawn).to.be.false;
      });


      it("Should not participate twice", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate();

        // Then
        await expect(participate())
          .to.be.revertedWith("Already participated.");
      });



      it("Should not participate in a round that has not started", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[5] + 10]);
        await ethers.provider.send("evm_mine");

        SparklaunchSale.connect(cedric).participate(0, {value: 150});

      });


      it("Should emit TokensSold event", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        // Then
        await expect(participate()).to.emit(SparklaunchSale, "TokensSold").withArgs(deployer.address, Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER));
      });

      
      it("Should not participate if tokens have not been deposited", async function() {
        // Given
        await setSaleParams();
        await setRounds();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        // Then
        await expect(participate()).to.be.reverted;
      });

      it("Should fail if buying 0 tokens", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        // Then
        await expect(participate({participationValue: 0})).to.be.reverted;
      });
    });

    describe("Withdraw tokens", async function() {
      it("Should withdraw user's tokens", async function() {
        // Given
        await runFullSetup();
        const withdrawAmount = (PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB)  * MULTIPLIER;
        console.log(withdrawAmount)
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");

        await SparklaunchSale.finishSale();

        // console.log(await SparklaunchSale.getParticipation(deployer.address));

        await SaleToken.transfer(SparklaunchSale.address, "10000000000000000000");
        const previousBalance = ethers.BigNumber.from(await SaleToken.balanceOf(deployer.address));

        // When
        await SparklaunchSale.withdraw();

        // Then
        const currentBalance = ethers.BigNumber.from(await SaleToken.balanceOf(deployer.address));
        // console.log(parseInt(currentBalance))
        
        // console.log(withdrawAmount)
        expect(currentBalance).to.equal(previousBalance.add(Math.floor(withdrawAmount)));
      });


      it("Should not withdraw twice", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");

        await SparklaunchSale.finishSale()

        await SaleToken.transfer(SparklaunchSale.address, "10000000000000000000");
        await SparklaunchSale.withdraw();

        
        await expect(SparklaunchSale.withdraw()).to.be.revertedWith("Already withdrawn");
      });

      it("Should not withdraw before sale end", async function() {
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate();


        // Then
        await expect(SparklaunchSale.withdraw()).to.be.revertedWith("Sale is running");
      });

      it("Should emit TokensWithdrawn event", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate();
        await SaleToken.transfer(SparklaunchSale.address, "10000000000000000000");

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");

        await SparklaunchSale.finishSale();

        // Then
        await expect(SparklaunchSale.withdraw()).to.emit(SparklaunchSale, "TokensWithdrawn").withArgs(deployer.address, Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB  * MULTIPLIER));
      });

    });

    describe("Withdraw earnings and leftover", async function() {
      it("Should withdraw sale owner's earnings and leftovers", async function() {
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        const sale = await SparklaunchSale.sale();
        // console.log(parseInt(sale.amountOfTokensToSell), parseInt(sale.totalTokensSold));
        await SparklaunchSale.finishSale()
        // When
        await SparklaunchSale.withdrawEarningsAndLeftover();

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);

        // TODO:
        expect(currentBalance).to.equal(previousBalance.add(PARTICIPATION_VALUE));
        expect(currentTokenBalance).to.equal(previousTokenBalance.add((AMOUNT_OF_TOKENS_TO_SELL - PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB)));
        expect(contractBalance).to.equal(0);
        expect(contractTokenBalance).to.equal(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB);
      });

      it("Should withdraw sale owner's earnings and leftovers separately", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");
        
        await SparklaunchSale.finishSale();

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        const sale = await SparklaunchSale.sale();
        console.log(parseInt(sale.hardCap), parseInt(sale.totalTokensSold));

        // When
        await SparklaunchSale.withdrawEarnings();

        await SparklaunchSale.withdrawLeftover();

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);

        // TODO:
         expect(currentBalance).to.equal(previousBalance.add(PARTICIPATION_VALUE));
         expect(currentTokenBalance).to.equal(previousTokenBalance.add((AMOUNT_OF_TOKENS_TO_SELL - PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB)));
         expect(contractBalance).to.equal(0);
         expect(contractTokenBalance).to.equal(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB);
      });

      it("Should not withdraw twice", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await SparklaunchSale.finishSale();

        await SparklaunchSale.withdrawEarningsAndLeftover();

        // Then
        await expect(SparklaunchSale.withdrawEarningsAndLeftover()).to.be.reverted;
      });

      it("Should not withdraw before sale ended", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0] - 15]);
        await ethers.provider.send("evm_mine");

        // Then
        await expect(SparklaunchSale.withdrawEarningsAndLeftover()).to.be.reverted;
      });

      it("Should not allow non-sale owner to withdraw", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await SparklaunchSale.finishSale();

        // Then
        await expect(SparklaunchSale.connect(bob).withdrawEarningsAndLeftover()).to.be.revertedWith("Restricted to sale owner.");
      });

      //TODO:
      it("Should burn leftover if requested", async function() {
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        // When
        await SparklaunchSale.finishSale();
        await SparklaunchSale.withdrawEarningsAndLeftover();

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);
        const burnedTokenBalance = await SaleToken.balanceOf(ONE_ADDRESS);

        expect(currentBalance).to.equal(previousBalance.add(PARTICIPATION_VALUE));
        expect(currentTokenBalance).to.equal(previousTokenBalance);
        expect(contractBalance).to.equal(0);
        expect(contractTokenBalance).to.equal(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB);
        expect(burnedTokenBalance).to.equal(AMOUNT_OF_TOKENS_TO_SELL - PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB);
      });

      //TODO:
      it("Should not crash if leftover is 0", async function() {
        // Given
        await runFullSetup({hardCap: Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER)});

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        // When
        await SparklaunchSale.finishSale();
        await SparklaunchSale.withdrawEarningsAndLeftover();

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);

        expect(currentBalance).to.equal(previousBalance.add(PARTICIPATION_VALUE));
        expect(currentTokenBalance).to.equal(previousTokenBalance);
        expect(contractBalance).to.equal(0);
        expect(contractTokenBalance).to.equal(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER);
      });

      //TODO:
      it("Should not crash if leftover is 0 and burn is requested", async function() {
        // Given
        await runFullSetup({hardCap: Math.floor(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER)});


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        // When
        await SparklaunchSale.finishSale();
        await SparklaunchSale.withdrawEarningsAndLeftover();

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);
        const burnedTokenBalance = await SaleToken.balanceOf(ONE_ADDRESS);

        expect(currentBalance).to.equal(previousBalance.add(PARTICIPATION_VALUE));
        expect(currentTokenBalance).to.equal(previousTokenBalance);
        expect(contractBalance).to.equal(0);
        expect(contractTokenBalance).to.equal(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB * MULTIPLIER);
        expect(burnedTokenBalance).to.equal(0);
      });

      //TODO:
      xit("Should not crash if earnings are 0", async function() {
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        // When
        await SparklaunchSale.finishSale();
        await SparklaunchSale.withdrawEarningsAndLeftover();

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);

        expect(currentBalance).to.equal(previousBalance);
        expect(currentTokenBalance).to.equal(previousTokenBalance.add(AMOUNT_OF_TOKENS_TO_SELL));
        expect(contractBalance).to.equal(0);
        expect(contractTokenBalance).to.equal(0);
      });

    });

    describe("Get current round", async function() {
      it("Should return 0 if sale didn't start yet", async function() {
        // Given
        await runFullSetup();

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(0);
      });

      it("Should return correct roundId at very beginning of first round", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(1);
      });

      it("Should return correct roundId at very beginning of middle round", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[1]]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(2);
      });

      it("Should return correct roundId at very beginning of last round", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2]]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(3);
      });

      it("Should return correct roundId if first round is active", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0] + 5]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(1);
      });

      it("Should return correct roundId if middle round is active", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[1] + 5]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(2);
      });

      it("Should return correct roundId if last round is active", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2] + 1]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(3);
      });

      it("Should return 0 if sale already ended", async function() {
        // Given
        await runFullSetup();

        // When
        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");

        // Then
        expect(await SparklaunchSale.getCurrentRound()).to.equal(0);
      });
    });
 });

  context("Finish Sale", async function(){

    describe("Finish sale", async function(){
       
      it("Make sure sale get’s cancelled when soft cap not reached", async function(){
         // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");

        // When
        await SparklaunchSale.finishSale();
        expect(await SparklaunchSale.isSaleSuccessful()).to.be.false;
        expect(await SparklaunchSale.saleFinished()).to.be.true;

      });

      it("Make sure sale doesn’t get cancelled when soft cap reached", async function(){
        // Given
       await runFullSetup();

       await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2]]);
       await ethers.provider.send("evm_mine");

       participate({participationAmount: 100 * REV})

       await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
       await ethers.provider.send("evm_mine");

       // When
       await SparklaunchSale.finishSale();
       expect(await SparklaunchSale.isSaleSuccessful()).to.be.true;
       expect(await SparklaunchSale.saleFinished()).to.be.true;

     });
    });

    describe("Withdraw after finish sale if sale successful", async function(){
       
      it("Make sure if sale successful users can withdraw sale tokens", async function(){
         // Given
        const withdrawAmount = (PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB)  * MULTIPLIER;
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2]]);
        await ethers.provider.send("evm_mine");

        participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");

        await SparklaunchSale.finishSale();
        await SaleToken.transfer(SparklaunchSale.address, "10000000000000000000");
        const previousBalance = ethers.BigNumber.from(await SaleToken.balanceOf(deployer.address));
        console.log(parseInt(previousBalance))

        // When
        await SparklaunchSale.withdraw();

        // Then
        const currentBalance = ethers.BigNumber.from(await SaleToken.balanceOf(deployer.address));
        console.log(parseInt(currentBalance))
        
         console.log(withdrawAmount)
        expect(currentBalance).to.equal(previousBalance.add(Math.floor(withdrawAmount)));
      });

      it("Make sure if sale successful sale owner can withdraw earnings+leftover", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});
        await participate({participationAmount: 1000 * REV});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalance = await ethers.provider.getBalance(deployer.address);
        const previousBalanceCedric = await ethers.provider.getBalance(cedric.address);
        console.log(previousBalanceCedric)
        const previousTokenBalance = await SaleToken.balanceOf(deployer.address);

        const sale = await SparklaunchSale.sale();
        await SparklaunchSale.finishSale();
        // When
        await SparklaunchSale.withdrawEarnings();

        let addr = await SparklaunchSale.feeAddr();
        let fee = await SparklaunchSale.serviceFee();
        console.log(addr, fee);

        // Then
        const currentBalance = await ethers.provider.getBalance(deployer.address);
        const currentBalanceCedric = await ethers.provider.getBalance(cedric.address);
        console.log(currentBalanceCedric)
        const contractBalance = await ethers.provider.getBalance(SparklaunchSale.address);
        const currentTokenBalance = await SaleToken.balanceOf(deployer.address);
        const contractTokenBalance = await SaleToken.balanceOf(SparklaunchSale.address);

        // TODO:
        expect(currentBalance).to.equal(previousBalance.add(PARTICIPATION_VALUE));
        expect(currentTokenBalance).to.equal(previousTokenBalance.add((AMOUNT_OF_TOKENS_TO_SELL - PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB)));
        expect(contractBalance).to.equal(0);
        expect(contractTokenBalance).to.equal(PARTICIPATION_VALUE / TOKEN_PRICE_IN_BNB);

  
      });

      it("When withdrawing earnings should take fee", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        await participate({sender: alice});
        await participate({participationAmount: 1000 * REV});

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        const previousBalanceCedric = await ethers.provider.getBalance(cedric.address);
        console.log(previousBalanceCedric)

        await SparklaunchSale.finishSale();
        // When
        await SparklaunchSale.withdrawEarnings();

        let addr = await SparklaunchSale.feeAddr();
        let fee = await SparklaunchSale.serviceFee();
        console.log(addr, fee);

        // Then
        const currentBalanceCedric = await ethers.provider.getBalance(cedric.address);
        console.log(currentBalanceCedric)
  
      });

      it("Make sure if sale successful users can not withdraw deposited bnb", async function(){
      
        // Given
        await runFullSetup();

        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2]]);
        await ethers.provider.send("evm_mine");
 
        participate({participationAmount: 100 * REV})
 
        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
        await ethers.provider.send("evm_mine");
 
        // When
        await SparklaunchSale.finishSale();
        await SparklaunchSale.withdrawUserFundsIfSaleCancelled()
        expect(await SparklaunchSale.isSaleSuccessful()).to.be.false;
        expect(await SparklaunchSale.saleFinished()).to.be.true;
        await expect(SparklaunchSale.withdrawUserFundsIfSaleCancelled()).to.be.revertedWith("Sale wasn't cancelled.");
  
      });

      it("Make sure if sale successful sale owner can not withdraw deposited tokens", async function(){
       // Given
       await runFullSetup();

       await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[2]]);
       await ethers.provider.send("evm_mine");

       participate({participationAmount: 100 * REV})

       await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA]);
       await ethers.provider.send("evm_mine");

       // When
       await SparklaunchSale.finishSale();
       await SparklaunchSale.withdrawDepositedTokensIfSaleCancelled()
       expect(await SparklaunchSale.isSaleSuccessful()).to.be.false;
       expect(await SparklaunchSale.saleFinished()).to.be.true;
       await expect(SparklaunchSale.withdrawDepositedTokensIfSaleCancelled()).to.be.revertedWith("Sale wasn't cancelled.");

  
      });
    });

    describe("Withdraw after finish sale if sale cancelled", async function(){

      it("Make sure if sale cancelled sale owner can not withdraw earnings+leftover", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

    
        await SparklaunchSale.finishSale();
        // When
        await expect(SparklaunchSale.withdrawEarnings()).to.be.reverted;

 
   
      });

      it("Make sure if sale cancelled users can withdraw deposited bnb", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

    
        await SparklaunchSale.finishSale();

        await expect(SparklaunchSale.withdrawUserFundsIfSaleCancelled()).to.be.not.reverted;
 
   
      });

      it("Make sure if sale cancelled sale owner can withdraw deposited tokens", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

    
        await SparklaunchSale.finishSale();
        const balance = await SaleToken.balanceOf(SparklaunchSale.address);
        console.log(balance);
        const sale = await SparklaunchSale.sale();
        console.log(sale.hardCap)

        await expect(SparklaunchSale.withdrawDepositedTokensIfSaleCancelled()).to.be.not.reverted;
 
   
      });

      it("Make sure only admin can call finish sale function", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

    

        await expect(SparklaunchSale.connect(cedric).finishSale()).to.be.reverted;
 
   
      });

      it("Make sure finish sale can be called only after saleEnd", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

  
        await expect(SparklaunchSale.connect(cedric).finishSale()).to.be.reverted;
 
      });

      it("Make sure if sale cancelled sale owner can’t withdraw deposited tokens if tokens were not deposited", async function(){
        // Given
        await runFullSetupNoDeposit();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

    
        await SparklaunchSale.finishSale();
        const balance = await SaleToken.balanceOf(SparklaunchSale.address);
        console.log(balance);
        const sale = await SparklaunchSale.sale();
        console.log(sale.hardCap)

        await expect(SparklaunchSale.withdrawDepositedTokensIfSaleCancelled()).to.be.revertedWith('Sale tokens were not deposited');
 
   
      });

      it("Make sure only the user who have participated can call withdrawUserFundsIfSaleCancelled", async function(){
        // Given
        await runFullSetup();


        await ethers.provider.send("evm_increaseTime", [ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

        
        await participate();

        await ethers.provider.send("evm_increaseTime", [SALE_END_DELTA - ROUNDS_START_DELTAS[0]]);
        await ethers.provider.send("evm_mine");

    
        await SparklaunchSale.finishSale();

        await expect(SparklaunchSale.connect(alice).withdrawUserFundsIfSaleCancelled()).to.be.reverted;
 
   
      })
    });
      
  });
});