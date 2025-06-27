const { expect } = require('chai')
const { ethers } = require('hardhat')

const { bscTokens } = require('@pancakeswap/tokens')
// const IERC20 = require('@openzeppelin/contracts/build/contracts/IERC20.json')

// const { abi: IUniversalRouterAbi } = require("@uniswap/universal-router/out/IUniversalRouter.sol/IUniversalRouter.json");
const IERC20Wrapped = require("../artifacts/contracts/IERC20Wrapped.sol/IERC20Wrapped.json")

const { CommandType, pancakeswapUniversalRouter, uniswapUniversalRouter } = require('../include/universal-router');
const { loanPoolProvider } = require('../include/aave');

const SwapProviderIndexPancakeSwap = 0
const SwapProviderIndexUniSwap = 1

describe('Setup market', function () {
  const wbnb = bscTokens.wbnb
  const wbnbContract = new ethers.Contract(wbnb.address, IERC20Wrapped.abi, ethers.provider)

  let abitrage, abitrageAddress

  const swapTo1 = bscTokens.usd1
  const swapPoolFeeLoopback = 500
  const v2SwapTo1 = swapTo1
  
  it('deploys contract', async function () {
    // const [owner, addr1] = await ethers.getSigners();
    const [,,owner] = await ethers.getSigners();

    // FIXME:
    const nonce = await ethers.provider.getTransactionCount(owner.address, "pending");
    console.log("Current Nonce:", nonce);
    owner.nonce = nonce

    // await publicClient.request({
    //   method: "anvil_impersonateAccount",
    //   params: [owner.address],
    // });
    await ethers.provider.send("anvil_setBalance", [
      owner.address,
      "0x10000000000000000000000"
    ]);
    wbnbContract.connect(owner).deposit({value: ethers.parseEther("3000")})

    const UniversalArbitrage = await ethers.getContractFactory('UniversalArbitrage')
    abitrage = (await UniversalArbitrage.connect(owner).deploy(
      pancakeswapUniversalRouter,
      uniswapUniversalRouter,
      loanPoolProvider,
      wbnb.address,
    )).connect(owner)
    abitrageAddress = await abitrage.getAddress()

    await wbnbContract.connect(owner).approve(abitrageAddress, ethers.MaxUint256)
  })
  
  it('buys a lot token from target pancake v3 pools', async function () {
    // transfering 1 large amount is too time consuming that may timeout
    for (let i = 0; i < 5; ++i) {
      const amount = ethers.parseEther('100')
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
        ]
      )
    }
  })
  xit('buys a lot token from target uni v3 pools', async function () {
    const amount = ethers.parseEther('100')
    // transfering 1 large amount is too time consuming that may timeout
    for (let i = 0; i < 5; ++i) {
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
        ]
      )
    }
  })
  xit('buys a lot token from target pancake v2 pools', async function () {
    const amount = ethers.parseEther('500')
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
    )
  })
  xit('buys a lot token from target uni v2 pools', async function () {
    const amount = ethers.parseEther('500')
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
    )
  })
})
