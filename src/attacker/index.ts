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

export type ArbitrageAttackerOptions = {
  chainClient: PublicClient,
  account: Account,
  universalArbitrageAddress: Hash,
  walletClient: WalletClient,
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

  public balance: bigint = 0n
  // public maxGasLimit: bigint = 30000000n
  // TODO: setup config
  public gasPrice: bigint = parseGwei('5')
  estimatedGasCostPerTrade = 200000n
  tradeCountMax = 6n
  maxGasLimit = this.estimatedGasCostPerTrade * this.tradeCountMax
  public avgerageGasCostRatioPercentage = 150n

  // TODO:
  transactionCostReserve: bigint = parseEther('0.001')
  
  constructor(options: ArbitrageAttackerOptions) {
    this.chainClient = options.chainClient
    this.account = options.account
    this.universalArbitrageAddress = options.universalArbitrageAddress
    this.walletClient = options.walletClient
  }

  getTargetAmounts(token: Token) {
    // TODO: config different amount scales for different swapFrom
    return [
      parseEther('1'),
      parseEther('4'),
      parseEther('16'),
      parseEther('64'),
      parseEther('256'),
      parseEther('1024'),
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
    const profitMin = this.estimatedGasCostPerTrade * this.gasPrice * this.avgerageGasCostRatioPercentage / 100n
    console.log('profitMin', ethers.formatUnits(profitMin, 'gwei'))
    let value = 0n
    const callDatas = plans.map(plan => {
      plan.targetAmounts = this.getTargetAmounts(plan.routes[0].path[0])
      plan.swaps = this.constructSwaps(plan)
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
      if (value) {
        // TODO: test with enough eth
        const amount = this.getTargetAmounts(bscTokens.wbnb)[0]
        const result = await this.chainClient.simulateContract({
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
              balance: amount * 2n
            }
          ]
        })
        if ((result.result as any).success) {
          const {index: planIndex, success, returnData} = result.result as any
          const amountGain = AbiCoder.defaultAbiCoder().decode(['uint256'], returnData)[0]
          await getFileLogger().log('plan found with enough eth', planIndex, amountGain)
        }
      }
      return -1
    }
    console.log('plan found', planIndex)
    const amountGain = AbiCoder.defaultAbiCoder().decode(['uint256'], returnData)[0]
    console.log('amountGain', ethers.formatUnits(amountGain, 'gwei'))
    const plan = plans[planIndex]
    getFileLogger().log('plan found', amountGain, planToString(plan))
    let hasSuccessfulAttack = false
    const swapFrom = plan.routes[0].path[0]
    const maxPriorityFeePerGas = this.gasPrice // double the gas price
    const transactionCostReserve = this.maxGasLimit * (maxPriorityFeePerGas + this.gasPrice)
    value = swapFrom.address === bscTokens.wbnb.address ? this.balance - transactionCostReserve : 0n
    // TODO: keep attack until it fails
    // while(true) {
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
          gas: this.maxGasLimit,
          maxPriorityFeePerGas,
          maxFeePerGas: this.gasPrice + maxPriorityFeePerGas,
        } as any)
        hasSuccessfulAttack = true
        const reportPromise = this.reportAttack(hash)
        console.log('attack success')
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
    // }
    return hasSuccessfulAttack ? planIndex : -1
  }

  async reportAttack(hash: Hash) {
    console.log(hash)
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

    await getFileLogger().log('hash', hash)
    await getFileLogger().log('priorityFeePerGas', priorityFeePerGas)
    await getFileLogger().log('totalGasCost', totalGasCost)
  }
}
