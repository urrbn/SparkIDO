const hre = require("hardhat");

async function main() {
  
  this.Admin = await hre.ethers.getContractFactory("Admin");
  this.NormalSaleFactory = await hre.ethers.getContractFactory("NormalSaleFactory");
  this.ERC20SaleFactory = await hre.ethers.getContractFactory("ERC20SaleFactory");
  
  this.admin = await Admin.deploy(['0x3825A87A33b0BC4d98F61B52F9caF2C0041Fb752']);
  await this.admin.deployed();
  
  this.normalSaleFactory = await NormalSaleFactory.deploy(this.admin.address);
  await this.normalSaleFactory.deployed();

  this.erc20SaleFactory = await ERC20SaleFactory.deploy(this.admin.address);
  await this.erc20SaleFactory.deployed();

  console.log("admin deployed to:", this.admin.address);
  console.log("normalSaleFactory deployed to:", this.normalSaleFactory.address);
  console.log("erc20SaleFactory deployed to:", this.erc20SaleFactory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});