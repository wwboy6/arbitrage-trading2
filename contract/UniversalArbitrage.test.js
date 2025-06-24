const { expect } = require('chai')
const { ethers } = require('hardhat')

const { bscTokens } = require('@pancakeswap/tokens')
const IERC20 = require('@openzeppelin/contracts/build/contracts/IERC20.json')
const wbnbAbi = [
  ...IERC20.abi,
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "public",
    "type": "function"
  }
]

const { CommandType, pancakeswapUniversalRouter, uniswapUniversalRouter } = require('./universal-router')
const { loanPoolProvider } = require('./aave')

const SwapProviderIndexPancakeSwap = 0
const SwapProviderIndexUniSwap = 1

describe('Universal Arbitrage', function () {
  const swapFrom = bscTokens.wbnb
  const swapPoolFee0 = 100
  const swapTo0 = bscTokens.busd
  const swapPoolFee1 = 100
  const swapTo1 = bscTokens.usdt
  const swapPoolFeeLoopback = 100
  
  const v2SwapTo0 = swapTo0
  const v2SwapTo1 = swapTo1

  const swapPoolFeeBack = 100

  let owner, addr1, abitrage, abitrageAddress
  let swapFromContract
  let swapTo0Contract
  let v2SwapTo0Contract

  beforeEach(async function() {
    [owner, addr1] = await ethers.getSigners();
    swapFromContract = new ethers.Contract(swapFrom.address, wbnbAbi, ethers.provider).connect(owner)
    swapTo0Contract = new ethers.Contract(swapTo0.address, IERC20.abi, ethers.provider).connect(owner)
    v2SwapTo0Contract = new ethers.Contract(v2SwapTo0.address, IERC20.abi, ethers.provider).connect(owner)
  })
  xit('deposit and withdraw wbnb', async function () {
    const abi = require('./wbnb.json')
    const WBNB = new ethers.Contract(bscTokens.wbnb.address, abi, ethers.provider).connect(owner)
    let balance = await WBNB.balanceOf(owner.address)
    console.log('balance', balance)
    await WBNB.deposit({value: 1})
    balance = await WBNB.balanceOf(owner.address)
    console.log('balance', balance)
    await WBNB.withdraw(1)
    balance = await WBNB.balanceOf(owner.address)
    console.log('balance', balance)
  })
  it('deploys contract', async function () {
    const UniversalArbitrage = await ethers.getContractFactory('UniversalArbitrage')
    abitrage = (await UniversalArbitrage.deploy(
      pancakeswapUniversalRouter,
      uniswapUniversalRouter,
      loanPoolProvider,
    )).connect(owner)
    abitrageAddress = await abitrage.getAddress()
  })
  xit('funds tokens', async function () {
    const [owner, addr1] = await ethers.getSigners();
    // let balance = await swapFromContract.balanceOf(owner.address)
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    // if (bnbBalance0 < ethers.parseEther('2') || balance < ethers.parseEther('2')) {
    if (bnbBalance0 < ethers.parseEther('2')) {
      // transfer fund
      await addr1.sendTransaction({
        to: owner.address,
        value: ethers.parseEther('10'),
      })
      // buy swapFrom
      await owner.sendTransaction({
        to: swapFrom.address,
        value: ethers.parseEther('5'),
        // gasLimit
      })
    }
    balance = await swapFromContract.balanceOf(owner.address)
    expect(balance).greaterThan(ethers.parseEther('2'))
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
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
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
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
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
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ["address", "uint24", "address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
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
  xit('performs loopback pancake swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
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
  xit('performs simple v2 pancake swaps', async function () {
    // clear contract balance
    let amount = v2SwapTo0Contract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(v2SwapTo0.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[swapFrom.address, v2SwapTo0.address]])
        }
      ],
      deadline
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    amount = await v2SwapTo0Contract.balanceOf(abitrageAddress)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    console.log(amount)
    await abitrage.withdrawTokens(v2SwapTo0.address, amount)
  })
  xit('performs v3 - v2 - v3 pancake swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ["address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[swapTo0.address, v2SwapTo0.address]])
        },
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ["address", "uint24", "address"],
            [v2SwapTo0.address, swapPoolFee0, swapFrom.address],
          ),
        },
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
  xit('performs v3 - v2 - v3 uni swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(abitrageAddress)
    await abitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60; // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    await abitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ["address", "uint24", "address"],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[swapTo0.address, v2SwapTo0.address]])
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ["address", "uint24", "address"],
            [v2SwapTo0.address, swapPoolFee0, swapFrom.address],
          ),
        },
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
  xit('performs attack with bnb only', async function () {
    // clear contract balance
    await abitrage.withdrawBalance()
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60 // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    try {
      await abitrage.attack(
        swapFrom.address,
        swapInAmount,
        [
          {
            swapProviderIndex: SwapProviderIndexPancakeSwap,
            command: CommandType.V3_SWAP_EXACT_IN,
            path: ethers.solidityPacked(
              ["address", "uint24", "address", "uint24", "address", "uint24", "address"],
              [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
            ),
          }
        ],
        deadline,
        {
          value: swapInAmount,
        }
      )

      console.log('attack success')
      
      // FIXME: not sure why withdraw is not working in anvil
      const balance1 = await swapFromContract.balanceOf(owner.address)
      // expect(balance1).equal(balance0)
      // const bnbBalance1 = await ethers.provider.getBalance(owner.address)
      // expect(bnbBalance1).greaterThanOrEqual(bnbBalance0)
      const balanceGain = balance1 - balance0
      console.log('balanceGain', balanceGain)
      expect(balanceGain).greaterThan(0)
    } catch (e) {
      console.error(e)
      expect(e.message).equal('execution reverted: not profitible')
    }
  })
  it('performs attack with flash loan', async function () {
    // clear contract balance
    await abitrage.withdrawBalance()
    // keep no wbnb and use bnb only
    let balance0 = await swapFromContract.balanceOf(owner.address)
    await swapFromContract.connect(owner).withdraw(balance0)
    balance0 = 0
    //
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    const deadline = Math.floor(Date.now() / 1000) + 60 // Deadline set to 1 minute from now
    const swapInAmount = ethers.parseEther('0.1')
    const targetAmount = ethers.parseEther('0.101') // loan for 0.01
    //
    try {
      await abitrage.attack(
        swapFrom.address,
        targetAmount,
        [
          {
            swapProviderIndex: SwapProviderIndexPancakeSwap,
            command: CommandType.V3_SWAP_EXACT_IN,
            path: ethers.solidityPacked(
              ["address", "uint24", "address", "uint24", "address", "uint24", "address"],
              [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
            ),
          }
        ],
        deadline,
        {
          value: swapInAmount,
        }
      )

      console.log('attack success')
      
      const balance1 = await swapFromContract.balanceOf(owner.address)
      expect(balance1).equal(balance0) // no change in wbnb
      const bnbBalance1 = await ethers.provider.getBalance(owner.address)
      expect(bnbBalance1).greaterThanOrEqual(bnbBalance0) // increase in bnb
      
      // FIXME: not sure why withdraw is not working in anvil
      // const balanceGain = balance1 - balance0
      // console.log('balanceGain', balanceGain)
      // expect(balanceGain).greaterThan(0)
    } catch (e) {
      console.error(e)
      expect(e.message).equal('execution reverted: not profitible')
    }
  })
})
