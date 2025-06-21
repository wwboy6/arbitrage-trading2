const { expect } = require('chai')
const { ethers } = require('hardhat')

const { bscTokens } = require('@pancakeswap/tokens')
const IERC20 = require('@openzeppelin/contracts/build/contracts/IERC20.json')

const SwapProviderIndexPancakeSwap = 0
const SwapProviderIndexUniSwap = 1

// const PANCAKESWAP_UNIVERSAL_ROUTER = 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB;
// const UNISWAP_UNIVERSAL_ROUTER = 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07;

describe.only('Universal Arbitrage', function () {
  const swapFrom = bscTokens.wbnb
  const swapPoolFee0 = 100
  const swapTo0 = bscTokens.busd
  const swapPoolFee1 = 100
  const swapTo1 = bscTokens.usdt
  
  const v2SwapTo0 = bscTokens.busd

  const swapPoolFeeBack = 100

  let owner, addr1, abitrage, abitrageAddress
  let swapFromContract
  let swapTo0Contract

  beforeEach(async function() {
    [owner, addr1] = await ethers.getSigners();
    swapFromContract = new ethers.Contract(swapFrom.address, IERC20.abi, ethers.provider).connect(owner)
    swapTo0Contract = new ethers.Contract(swapTo0.address, IERC20.abi, ethers.provider).connect(owner)
  })
  it('funds tokens', async function () {
    let balance = await swapFromContract.balanceOf(owner.address)
    if (balance < ethers.parseEther('5')) {
      // transfer fund
      await addr1.sendTransaction({
        to: owner.address,
        value: ethers.parseEther('11'),
      })
      // buy swapFrom
      await owner.sendTransaction({
        to: swapFrom.address,
        value: ethers.parseEther('10'),
        // gasLimit
      })
    }
    balance = await swapFromContract.balanceOf(owner.address)
    expect(balance).greaterThan(ethers.parseEther('5'))
  })
  it('deploys contract', async function () {
    const UniversalArbitrage = await ethers.getContractFactory('UniversalArbitrage')
    abitrage = (await UniversalArbitrage.deploy()).connect(owner)
    abitrageAddress = await abitrage.getAddress()
  })
  it('approve contract', async function () {
    await swapFromContract.approve(abitrageAddress, ethers.MaxUint256)
  })
  xit('performs 1 simple pancake swaps', async function () {
    // clear contract balance
    let amount = swapTo0Contract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapTo0.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 5 second from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          path: ethers.solidityPacked(
            ["address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        }
      ],
      deadline
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    expect(balance0 - balance1).equal(swapInAmount)
    amount = await swapTo0Contract.balanceOf(abitrageAddress)
    expect(amount).greaterThan(0)
    console.log(amount)
    await abitrage.withdrawTokens(swapTo0.address, amount)
  })
  xit('performs 1 simple uni swaps', async function () {
    // clear contract balance
    let amount = swapTo0Contract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapTo0.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 5 second from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          path: ethers.solidityPacked(
            ["address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        }
      ],
      deadline
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    expect(balance0 - balance1).equal(swapInAmount)
    amount = await swapTo0Contract.balanceOf(abitrageAddress)
    expect(amount).greaterThan(0)
    console.log(amount)
    await abitrage.withdrawTokens(swapTo0.address, amount)
  })
  xit('performs complex swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 5 second from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          path: ethers.solidityPacked(
            ["address", "uint24", "address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          path: ethers.solidityPacked(
            ["address", "uint24", "address", "uint24", "address"],
            [swapTo1.address, swapPoolFee0, swapTo0.address, swapPoolFeeBack, swapFrom.address],
          ),
        }
      ],
      deadline
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    console.log(balance0 - balance1)
    amount = await swapFromContract.balanceOf(abitrageAddress)
    console.log(amount)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    await abitrage.withdrawTokens(swapFrom.address, amount)
  })
  it('performs loopback pancake swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 5 second from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          path: ethers.solidityPacked(
            ["address", "uint24", "address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee0, swapFrom.address],
          ),
        }
      ],
      deadline
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    amount = await swapFromContract.balanceOf(abitrageAddress)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    console.log(amount)
    await abitrage.withdrawTokens(swapFrom.address, amount)
  })
})
