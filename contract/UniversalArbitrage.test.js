const { expect } = require('chai')
const chai = require('chai')
chai.use(require('chai-bignumber')())

const { ethers } = require('hardhat')

const { bscTokens } = require('@pancakeswap/tokens')
const IERC20 = require('@openzeppelin/contracts/build/contracts/IERC20.json')
const wbnbAbi = [
  ...IERC20.abi,
  {
    'inputs': [
      {
        'internalType': 'uint256',
        'name': 'wad',
        'type': 'uint256'
      }
    ],
    'name': 'withdraw',
    'outputs': [],
    'stateMutability': 'public',
    'type': 'function'
  }
]

const { CommandType, pancakeswapUniversalRouter, uniswapUniversalRouter } = require('../include/universal-router')
const { loanPoolProvider } = require('../include/aave')

const SwapProviderIndexPancakeSwap = 0
const SwapProviderIndexUniSwap = 1

describe('Universal Arbitrage', function () {
  const swapFrom = bscTokens.wbnb
  const swapPoolFee0 = 100
  const swapTo0 = bscTokens.usdt
  const swapPoolFee1 = 100
  const swapTo1 = bscTokens.usd1
  const swapPoolFeeLoopback = 500
  
  const v2SwapTo0 = swapTo0
  const v2SwapTo1 = swapTo1

  const swapPoolFeeBack = 100

  let owner, addr1, UniversalArbitrage, arbitrage, arbitrageAddress
  let swapFromContract
  let swapTo0Contract
  let v2SwapTo0Contract

  beforeEach(async function() {
    [owner, addr1] = await ethers.getSigners()
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
    UniversalArbitrage = await ethers.getContractFactory('UniversalArbitrage')
    arbitrage = (await UniversalArbitrage.deploy(
      pancakeswapUniversalRouter,
      uniswapUniversalRouter,
      loanPoolProvider,
      bscTokens.wbnb.address,
    )).connect(owner)
    arbitrageAddress = await arbitrage.getAddress()
  })
  it('funds tokens', async function () {
    const [owner, addr1] = await ethers.getSigners()
    // await ethers.provider.send('anvil_setBalance', [
    //   addr1.address,
    //   '0x10000000000000000000000'
    // ])
    let balance = await swapFromContract.balanceOf(owner.address)
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    if (bnbBalance0 < ethers.parseEther('7')) {
      // transfer fund
      await addr1.sendTransaction({
        to: owner.address,
        value: ethers.parseEther('12'),
      })
    }
    if (balance < ethers.parseEther('2')) {
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
    await swapFromContract.approve(arbitrageAddress, ethers.MaxUint256)
  })
  xit('performs 1 simple pancake swaps', async function () {
    // clear contract balance
    let amount = swapTo0Contract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapTo0.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        }
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    expect(balance0 - balance1).equal(swapInAmount)
    amount = await swapTo0Contract.balanceOf(arbitrageAddress)
    expect(amount).greaterThan(0)
    console.log(amount)
    await arbitrage.withdrawTokens(swapTo0.address, amount)
  })
  xit('performs 1 simple uni swaps', async function () {
    // clear contract balance
    let amount = swapTo0Contract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapTo0.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        }
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    expect(balance0 - balance1).equal(swapInAmount)
    amount = await swapTo0Contract.balanceOf(arbitrageAddress)
    expect(amount).greaterThan(0)
    console.log(amount)
    await arbitrage.withdrawTokens(swapTo0.address, amount)
  })
  xit('performs complex swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address', 'uint24', 'address'],
            [swapTo1.address, swapPoolFee0, swapTo0.address, swapPoolFeeBack, swapFrom.address],
          ),
        }
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    console.log(balance0 - balance1)
    amount = await swapFromContract.balanceOf(arbitrageAddress)
    console.log(amount)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
  })
  xit('performs loopback pancake swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee0, swapFrom.address],
          ),
        }
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    amount = await swapFromContract.balanceOf(arbitrageAddress)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    console.log(amount)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
  })
  xit('performs simple v2 pancake swaps', async function () {
    // clear contract balance
    let amount = v2SwapTo0Contract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(v2SwapTo0.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [[swapFrom.address, v2SwapTo0.address]])
        }
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    amount = await v2SwapTo0Contract.balanceOf(arbitrageAddress)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    console.log(amount)
    await arbitrage.withdrawTokens(v2SwapTo0.address, amount)
  })
  xit('performs v3 - v2 - v3 pancake swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [[swapTo0.address, v2SwapTo0.address]])
        },
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [v2SwapTo0.address, swapPoolFee0, swapFrom.address],
          ),
        },
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    amount = await swapFromContract.balanceOf(arbitrageAddress)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    console.log(amount)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
  })
  xit('performs v3 - v2 - v3 uni swaps', async function () {
    // clear contract balance
    let amount = swapFromContract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    await arbitrage.executeMultipleSwaps(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address],
          ),
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [[swapTo0.address, v2SwapTo0.address]])
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address'],
            [v2SwapTo0.address, swapPoolFee0, swapFrom.address],
          ),
        },
      ],
    )
    const balance1 = await swapFromContract.balanceOf(owner.address)
    amount = await swapFromContract.balanceOf(arbitrageAddress)
    expect(balance0 - balance1).equal(swapInAmount)
    expect(amount).greaterThan(0)
    console.log(amount)
    await arbitrage.withdrawTokens(swapFrom.address, amount)
  })
  xit('performs attack with bnb only', async function () {
    // clear contract balance
    await arbitrage.withdrawBalance()
    //
    const balance0 = await swapFromContract.balanceOf(owner.address)
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    const profitMin = ethers.parseUnits('200000', 'gwei')
    await arbitrage.attack(
      swapFrom.address,
      swapInAmount,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
          ),
        }
      ],
      profitMin,
      {
        value: swapInAmount,
      }
    )

    console.log('attack success')
    
    const balance1 = await swapFromContract.balanceOf(owner.address)
    expect(balance1).equal(balance0)
    const bnbBalance1 = await ethers.provider.getBalance(owner.address)
    expect(bnbBalance1).greaterThanOrEqual(bnbBalance0)
    const balanceGain = bnbBalance1 - bnbBalance0
    console.log('balanceGain', balanceGain)
    expect(balanceGain).greaterThan(0)
  })
  it('simulate swap', async function () {
    await arbitrage.executeMultipleSwaps.staticCall(
      bscTokens.wbnb.address,
      ethers.parseEther('0.1'),
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V2_SWAP_EXACT_IN,
          path: ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [[bscTokens.wbnb.address, bscTokens.usdt.address]])
        },
        {
          swapProviderIndex: SwapProviderIndexUniSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(['address', 'uint24', 'address'], [bscTokens.usdt.address, 100, bscTokens.wbnb.address])
        },
      ]
    )
  })
  xit('simulate attack with too many value transferred', async function () {
    const profitMin = ethers.parseUnits('200000', 'gwei')
    const result = await arbitrage.attack.staticCall(
      swapFrom.address,
      ethers.parseEther('0.1'),
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
          ),
        }
      ],
      profitMin,
      {
        value: ethers.parseEther('2')
      }
    )
    // console.log(ethers.formatUnits(result, 'gwei'))
    expect(result.toString()).to.be.bignumber.greaterThan(0)
  })
  xit('performs attack with flash loan', async function () {
    // clear contract balance
    await arbitrage.withdrawBalance()
    const temp = await swapFromContract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapFrom.address, temp)
    // keep no wbnb and use bnb only
    let balance0 = await swapFromContract.balanceOf(owner.address)
    await swapFromContract.connect(owner).withdraw(balance0)
    //
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    const swapInAmount = ethers.parseEther('0.1')
    const targetAmount = ethers.parseEther('0.101') // loan for 0.001
    const profitMin = ethers.parseUnits('200000', 'gwei')
    //
    try {
      await arbitrage.attack(
        swapFrom.address,
        targetAmount,
        [
          {
            swapProviderIndex: SwapProviderIndexPancakeSwap,
            command: CommandType.V3_SWAP_EXACT_IN,
            path: ethers.solidityPacked(
              ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
              [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
            ),
          }
        ],
        profitMin,
        {
          value: swapInAmount,
        }
      )

      console.log('attack success')
      
      const balance1 = await swapFromContract.balanceOf(owner.address)

      expect(balance1).equal(0) // no change in wbnb
      const bnbBalance1 = await ethers.provider.getBalance(owner.address)
      expect(bnbBalance1).greaterThanOrEqual(bnbBalance0) // increase in bnb
      
      // resume wbnb balance
      await owner.sendTransaction({
        to: swapFrom.address,
        value: balance0,
      })
    } catch (e) {
      // resume wbnb balance
      await owner.sendTransaction({
        to: swapFrom.address,
        value: balance0,
      })
      //
      console.error(e)
      const iface = new ethers.Interface(['error Error(string)'])
      if (e.data) {
        try {
          // Decode the revert data
          const decoded = iface.parseError(e.data)
          console.log(decoded.name)
          console.log(decoded.args)
        } catch (e) {
          console.error('Failed to decode:', e.data)
        }
      }
      expect(e.message).equal('execution reverted: not profitible')
    }
  })
  xit('performs profitable attack with attackWithAmounts and flash loan', async function () {
    // clear contract balance
    await arbitrage.withdrawBalance()
    const temp = await swapFromContract.balanceOf(arbitrageAddress)
    await arbitrage.withdrawTokens(swapFrom.address, temp)
    // keep no wbnb and use bnb only
    let balance0 = await swapFromContract.balanceOf(owner.address)
    await swapFromContract.connect(owner).withdraw(balance0)
    //
    const bnbBalance0 = await ethers.provider.getBalance(owner.address)
    const swapInAmount = ethers.parseEther('5') // swap in large amount
    const targetAmounts = [
      ethers.parseEther('0.101'),
      ethers.parseEther('0.102'),
      ethers.parseEther('10'),
    ]
    const profitMin = ethers.parseUnits('200000', 'gwei')
    //
    const tx = await arbitrage.attackWithAmounts(
      swapFrom.address,
      targetAmounts,
      [
        {
          swapProviderIndex: SwapProviderIndexPancakeSwap,
          command: CommandType.V3_SWAP_EXACT_IN,
          path: ethers.solidityPacked(
            ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
            [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
          ),
        }
      ],
      profitMin,
      {
        value: swapInAmount,
      }
    )

    console.log('attack success')

    // check gas consumed
    const receipt = await tx.wait()
    // Extract gas used and effective gas price
    const gasUsed = receipt.gasUsed
    console.log('gasUsed', gasUsed)
    const effectiveGasPrice = receipt.gasPrice 
    // Get base fee from the block
    const block = await ethers.provider.getBlock(receipt.blockNumber)
    const baseFeePerGas = block.baseFeePerGas || 0n
    // Calculate priority fee
    const priorityFeePerGas = effectiveGasPrice - baseFeePerGas
    console.log('priorityFeePerGas', ethers.formatUnits(priorityFeePerGas, 'gwei'))
    // Calculate total gas cost
    const totalGasCost = gasUsed * effectiveGasPrice
    console.log('totalGasCost', ethers.formatUnits(totalGasCost, 'gwei'))
    
    const balance1 = await swapFromContract.balanceOf(owner.address)
    expect(balance1).equal(0) // no change in wbnb
    const bnbBalance1 = await ethers.provider.getBalance(owner.address)
    expect(bnbBalance1).greaterThanOrEqual(bnbBalance0) // increase in bnb
    
    // resume wbnb balance
    await owner.sendTransaction({
      to: swapFrom.address,
      value: balance0,
    })
  })
  xit('simulates batch call of attacks and check which one is profitable', async function () {
    const profitMin = ethers.parseUnits('200000', 'gwei')
    const results = await arbitrage.callAndReturnAnySuccess.staticCall([
      // this one should fail
      UniversalArbitrage.interface.encodeFunctionData(
        'attack',
        [
          swapFrom.address,
          ethers.parseEther('0.1'), // targetAmount
          [
            {
              swapProviderIndex: SwapProviderIndexPancakeSwap,
              command: CommandType.V3_SWAP_EXACT_IN,
              path: ethers.solidityPacked(
                ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
                [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, 100, swapFrom.address], // using another loopback that is not set as profitable
              ),
            }
          ],
          profitMin,
        ]
      ),
      // this one should success
      UniversalArbitrage.interface.encodeFunctionData(
        'attack',
        [
          swapFrom.address,
          ethers.parseEther('0.1'), // targetAmount
          [
            {
              swapProviderIndex: SwapProviderIndexPancakeSwap,
              command: CommandType.V3_SWAP_EXACT_IN,
              path: ethers.solidityPacked(
                ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
                [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
              ),
            }
          ],
          profitMin,
        ]
      ),
      // this one should be skipped
      UniversalArbitrage.interface.encodeFunctionData(
        'attack',
        [
          swapFrom.address,
          ethers.parseEther('0.1'), // targetAmount
          [
            {
              swapProviderIndex: SwapProviderIndexPancakeSwap,
              command: CommandType.V3_SWAP_EXACT_IN,
              path: ethers.solidityPacked(
                ['address', 'uint24', 'address', 'uint24', 'address', 'uint24', 'address'],
                [swapFrom.address, swapPoolFee0, swapTo0.address, swapPoolFee1, swapTo1.address, swapPoolFeeLoopback, swapFrom.address],
              ),
            }
          ],
          profitMin,
        ]
      ),
    ], {value: ethers.parseEther('5')}) // value is very large
    const [ index, success, returnData ] = results
    const amountGain = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], returnData)
    expect(index).equal(1)
    expect(success).equal(true)
    expect(amountGain.toString()).to.be.bignumber.greaterThan(0)
  })
})