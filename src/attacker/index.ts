import { PoolType } from '@pancakeswap/smart-router'
import { constructPathData, SwapProviderIndex, TradeRoute, tradeRouteToString } from '../bc-helper/route'
import universalArbitrageAbi from '../../contract/UniversalArbitrage.abi.json'
import { Account, Hash, PublicClient, WalletClient, parseEther, createWalletClient, parseGwei, encodeFunctionData, formatUnits } from 'viem'
import { Token } from '@pancakeswap/sdk'
import { bscTokens } from '@pancakeswap/tokens'
import { bigIntMin } from '../lib/bigint'
import { AbiCoder, ethers, solidityPacked } from 'ethers'
import { CommandType } from '../bc-helper/universal-router'
import { getFileLogger } from '../lib/file-logger'
import { printGwei } from '../bc-helper/wei'

export type ArbitrageAttackerOptions = {
  chainClient: PublicClient,
  account: Account,
  universalArbitrageAddress: Hash,
  walletClient: WalletClient,
  gasPerLoop: bigint,
}

export type ArbitrageAttackerPlan = {
  routes: TradeRoute[],
  // TODO: for caching intermediate data
  swaps?: any[], // TODO: typing
  targetAmounts?: bigint[],
}

function planToString(plan: ArbitrageAttackerPlan) {
  return plan.routes.map(tradeRouteToString).join('+')
}

export type ArbitrageAttackerAttackOptions = {
  plans: ArbitrageAttackerPlan[],
}

const wbnbAddress = bscTokens.wbnb.address

export class ArbitrageAttacker {
  chainClient: PublicClient
  universalArbitrageAddress: Hash
  account: Account
  walletClient: WalletClient
  gasPerLoop: bigint

  public balance: bigint = 0n
  public gasPrice: bigint = parseGwei('5')
  public profitablePercentage = 110n
  lastBlockNumber = 0n

  // TODO:
  transactionCostReserve: bigint = parseEther('0.001')
  
  constructor(options: ArbitrageAttackerOptions) {
    this.chainClient = options.chainClient
    this.account = options.account
    this.universalArbitrageAddress = options.universalArbitrageAddress
    this.walletClient = options.walletClient
    this.gasPerLoop = options.gasPerLoop
  }

  getTargetAmounts(plan: ArbitrageAttackerPlan) {
    // TODO: config different amount scales for different pools
    return [
      parseEther('6'),
      parseEther('24'),
      parseEther('96'),
      parseEther('384'),
      parseEther('1536'),
    ]
  }

  constructSwaps(plan: ArbitrageAttackerPlan) {
    return plan.routes.map(route => {
      let comandType: string
      switch(route.type) {
        case PoolType.V2:
          comandType = CommandType.V2_SWAP_EXACT_IN
        case PoolType.V3:
          comandType = CommandType.V3_SWAP_EXACT_IN
          break;
        default:
          throw new Error(`unknown command type ${(route as any).type}`)
      }
      return {
        swapProviderIndex: SwapProviderIndex.PancakeSwap,
        command: comandType,
        path: constructPathData(route),
      }
    })
  }

  filterPlans(plans: ArbitrageAttackerPlan[]) {
    const { valid, invalid } = Object.groupBy(plans, plan => {
      const lastRoute = plan.routes[plan.routes.length-1]
      const lastToken: any = lastRoute.path[lastRoute.path.length-1]
      return plan.routes[0].path[0].address === lastToken.address ? 'valid' : 'invalid'
    })
    if (invalid && invalid.length) {
      for (const plan of invalid) {
        console.log('invalid path', plan.routes.map(tradeRouteToString).join(' '))
      }
    }
    return valid
  }

  async attack(options: ArbitrageAttackerAttackOptions) {
    const { plans: _plans } = options
    const plans = this.filterPlans(_plans)
    if (!plans || !plans.length) return
    // TODO: check if approve is required
    // TODO: or approve contract daily
    // const { request: req0 } = await this.chainClient.simulateContract({
    //   address: swapFrom.address,
    //   abi: ERC20.abi,
    //   functionName: 'approve',
    //   args: [this.pancakeswapArbitrageAddress, 2n**256n-1n],
    //   account: this.account,
    // })
    const originalBalance = this.balance
    const profitMin = this.gasPerLoop * this.gasPrice * this.profitablePercentage / 100n
    console.log('profitMin', ethers.formatUnits(profitMin, 'gwei'))
    let value = 0n
    const callDatas = plans.map(plan => {
      if (!plan.targetAmounts) plan.targetAmounts = this.getTargetAmounts(plan)
      if (!plan.swaps) plan.swaps = this.constructSwaps(plan)
      if (plan.routes[0].path[0].address === wbnbAddress) value = this.balance - this.transactionCostReserve
      return encodeFunctionData({
        abi: universalArbitrageAbi,
        functionName: 'attack',
        args: [
          plan.routes[0].path[0].address,
          plan.targetAmounts[0],
          plan.swaps,
          profitMin,
        ]
      })
    })
    console.time("callAndReturnAnySuccess")
    const result = await this.chainClient.simulateContract({
      address: this.universalArbitrageAddress,
      abi: universalArbitrageAbi,
      functionName: 'callAndReturnAnySuccess',
      args: [callDatas],
      account: this.account,
      value,
      // TODO: use stateOverride to let contract know it is a simulation
    })
    console.timeEnd("callAndReturnAnySuccess")
    const {index: planIndex, success, returnData} = result.result as any
    if (planIndex >= plans.length || !success) {
      /*
      if (value) {
        // test with enough eth
        // do these tests in same block
        const blockNumber = await this.chainClient.getBlockNumber()
        if (blockNumber > this.lastBlockNumber) {
          this.lastBlockNumber = blockNumber
          for (const amountStr of ['1', '6', '9', '12', '18', '24']) {
            const amount = ethers.parseEther(amountStr)
            const callDatas = plans.map(plan => {
              plan.targetAmounts = this.getTargetAmounts(plan)
              plan.swaps = this.constructSwaps(plan)
              if (plan.routes[0].path[0].address === wbnbAddress) value = this.balance - this.transactionCostReserve
              return encodeFunctionData({
                abi: universalArbitrageAbi,
                functionName: 'attack',
                args: [
                  plan.routes[0].path[0].address,
                  amount,
                  plan.swaps,
                  profitMin,
                ]
              })
            })
            const result = await this.chainClient.simulateContract({
              blockNumber,
              address: this.universalArbitrageAddress,
              abi: universalArbitrageAbi,
              functionName: 'callAndReturnAnySuccess',
              args: [callDatas],
              account: this.account,
              value: amount,
              // TODO: use stateOverride to let contract know it is a simulation
              stateOverride: [
                {
                  address: this.account.address,
                  balance: amount + ethers.parseEther('1') // enough amount to pay value + gas
                }
              ]
            })
            if ((result.result as any).success) {
              const {index: planIndex, success, returnData} = result.result as any
              const amountGain = AbiCoder.defaultAbiCoder().decode(['uint256'], returnData)[0]
              await getFileLogger().log('plan found with enough eth block:', blockNumber, ' amount:', amountStr, printGwei(amountGain), planToString(plans[planIndex]))
            }
          }
        }
      }
        */
      return -1
    }
    console.log('plan found', planToString(plans[planIndex]))
    const amountGain = AbiCoder.defaultAbiCoder().decode(['uint256'], returnData)[0]
    console.log('amountGain', printGwei(amountGain))
    // TODO: update amounts to estimated OIA w.r.t. amount gain
    const plan = plans[planIndex]
    getFileLogger().log('plan found', planIndex, printGwei(amountGain), planToString(plan))
    let hasSuccessfulAttack = false
    const swapFrom = plan.routes[0].path[0]
    // TODO: strategy for piority fee
    // const maxPriorityFeePerGas = this.gasPrice // double the gas price
    // const transactionCostReserve = this.maxGasLimit * (maxPriorityFeePerGas + this.gasPrice)
    const amountCount = BigInt(plan.targetAmounts!.length)
    const maxGasLimit = this.gasPerLoop * amountCount
    const maxFeePerGasLimit = this.balance / maxGasLimit
    console.log('maxFeePerGasLimit', printGwei(maxFeePerGasLimit))
    getFileLogger().log('maxFeePerGasLimit', printGwei(maxFeePerGasLimit))
    // if there are more than 1 amounts, the second loop must run after the first one success
    const minLoop = amountCount > 1n ? 2n : 1n
    const profitableFeePerGas = amountGain * 9n / 10n / minLoop / this.gasPerLoop
    console.log('profitableFeePerGas', printGwei(profitableFeePerGas))
    getFileLogger().log('profitableFeePerGas', printGwei(profitableFeePerGas))
    const maxFeePerGas = profitableFeePerGas > maxFeePerGasLimit ? maxFeePerGasLimit : profitableFeePerGas
    console.log('maxFeePerGas', printGwei(maxFeePerGas))
    getFileLogger().log('maxFeePerGas', printGwei(maxFeePerGas))
    const maxPriorityFeePerGas = maxFeePerGas - this.gasPrice
    value = swapFrom.address === bscTokens.wbnb.address ? this.balance - maxGasLimit * maxFeePerGas : 0n
    console.log('value', printGwei(value))
    getFileLogger().log('value', printGwei(value))
    try {
      // call attackWithAmounts without other rpc call
      // TODO: adjust maxPriorityFeePerGas
      const hash = await this.walletClient.writeContract({
        address: this.universalArbitrageAddress,
        abi: universalArbitrageAbi,
        functionName: 'attackWithAmounts',
        args: [
          swapFrom.address,
          plan.targetAmounts,
          plan.swaps,
          profitMin,
        ],
        value,
        gas: maxGasLimit,
        maxPriorityFeePerGas,
        maxFeePerGas,
      } as any)
      hasSuccessfulAttack = true
      const reportPromise = this.reportAttack(hash)
      console.log('attack finish')
      this.balance = await this.chainClient.getBalance(this.account)
      console.log('balance', this.balance)
      reportPromise.then(() => {
        getFileLogger().log('balance', this.balance, this.balance - originalBalance)
      })
    } catch (e: any) {
      // TODO: check error
      console.log(e.message)
      console.log('attack failed')
      // TODO: use another client with less retry and delay
      this.balance = await this.chainClient.getBalance(this.account)
      getFileLogger().log('attack failed')
        .then(() => getFileLogger().log('balance', this.balance, this.balance - originalBalance))
      // TODO: cancel transection
      // break
    }
    return hasSuccessfulAttack ? planIndex : -1
  }

  async reportAttack(hash: Hash) {
    console.log(hash)
    getFileLogger().log('hash', hash)
    // Get transaction receipt
    const receipt = await this.chainClient.waitForTransactionReceipt({ hash })

    // Extract gas used and effective gas price
    const gasUsed = receipt.gasUsed
    const effectiveGasPrice = receipt.effectiveGasPrice

    // Get base fee from the block
    const block = await this.chainClient.getBlock({ blockNumber: receipt.blockNumber })
    const baseFeePerGas = block.baseFeePerGas || 0n // Fallback for non-EIP-1559

    // Calculate priority fee
    const priorityFeePerGas = effectiveGasPrice - baseFeePerGas
    console.log('priorityFeePerGas', priorityFeePerGas)

    // Calculate total gas cost
    const totalGasCost = gasUsed * effectiveGasPrice
    console.log('totalGasCost', totalGasCost)

    await getFileLogger().log('priorityFeePerGas', priorityFeePerGas)
    await getFileLogger().log('totalGasCost', totalGasCost)
  }
}
