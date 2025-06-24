const { expect } = require('chai')
const { ethers } = require('hardhat')

const { bscTokens } = require('@pancakeswap/tokens')
const IERC20 = require('@openzeppelin/contracts/build/contracts/IERC20.json')

const { abi: IUniversalRouterAbi } = require("@uniswap/universal-router/out/IUniversalRouter.sol/IUniversalRouter.json");

const { CommandType, pancakeswapUniversalRouter, uniswapUniversalRouter } = require('./universal-router');
const { loanPoolProvider } = require('./aave');

const SwapProviderIndexPancakeSwap = 0
const SwapProviderIndexUniSwap = 1

describe('Setup market', function () {
  const wbnb = bscTokens.wbnb
  const wbnbContract = new ethers.Contract(wbnb.address, IERC20.abi, ethers.provider)

  let abitrage, abitrageAddress

  const swapTo1 = bscTokens.usdt
  const swapPoolFeeLoopback = 100
  const v2SwapTo1 = swapTo1
  
  it('deploys contract', async function () {
    // const [owner, addr1] = await ethers.getSigners();
    const [,,owner] = await ethers.getSigners();
    const UniversalArbitrage = await ethers.getContractFactory('UniversalArbitrage')
    abitrage = (await UniversalArbitrage.connect(owner).deploy(
      pancakeswapUniversalRouter,
      uniswapUniversalRouter,
      loanPoolProvider,
    )).connect(owner)
    abitrageAddress = await abitrage.getAddress()

    await wbnbContract.connect(owner).approve(abitrageAddress, ethers.MaxUint256)
    const balance = await wbnbContract.connect(owner).balanceOf(owner.address)
    if (balance < ethers.parseEther('2000')) {
      await owner.sendTransaction({
        to: wbnb.address,
        value: ethers.parseEther('2000'),
      })
    }
  })
  
  it('buys a lot token from target pancake v3 pools', async function () {
    // transfering 1 large amount is too time consuming that may timeout
    for (let i = 0; i < 5; ++i) {
      const amount = ethers.parseEther('100')
      const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
      await abitrage.executeMultipleSwaps(
        wbnb.address,
        amount,
        [
          {
            swapProviderIndex: SwapProviderIndexPancakeSwap,
            command: CommandType.V3_SWAP_EXACT_IN,
            path: ethers.solidityPacked(
              ["address", "uint24", "address"],
              [wbnb.address, swapPoolFeeLoopback, swapTo1.address],
            ),
          }
        ],
        deadline
      )
    }
  })
  it('buys a lot token from target uni v3 pools', async function () {
    const amount = ethers.parseEther('100')
    // transfering 1 large amount is too time consuming that may timeout
    for (let i = 0; i < 5; ++i) {
      const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
      await abitrage.executeMultipleSwaps(
        wbnb.address,
        amount,
        [
          {
            swapProviderIndex: SwapProviderIndexUniSwap,
            command: CommandType.V3_SWAP_EXACT_IN,
            path: ethers.solidityPacked(
              ["address", "uint24", "address"],
              [wbnb.address, swapPoolFeeLoopback, swapTo1.address],
            ),
          }
        ],
        deadline
      )
    }
  })
  it('buys a lot token from target pancake v2 pools', async function () {
    const amount = ethers.parseEther('500')
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    await abitrage.executeMultipleSwaps(
      wbnb.address,
      amount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[wbnb.address, v2SwapTo1.address]])
        }
      ],
      deadline
    )
  })
  it('buys a lot token from target uni v2 pools', async function () {
    const amount = ethers.parseEther('500')
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    await abitrage.executeMultipleSwaps(
      wbnb.address,
      amount,
      [
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[wbnb.address, v2SwapTo1.address]])
        }
      ],
      deadline
    )
  })
})
