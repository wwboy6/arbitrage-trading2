import { PoolType } from '@pancakeswap/smart-router'
import { SwapProviderIndex, TradeRoute } from '../bc-helper/route'
import universalArbitrageAbi from '../../contract/UniversalArbitrage.abi.json'
import { Account, Hash, PublicClient, WalletClient, parseEther, createWalletClient, parseGwei } from 'viem'
import { Token } from '@pancakeswap/sdk'
import { bscTokens } from '@pancakeswap/tokens'
import { bigIntMin } from '../lib/bigint'
import { AbiCoder, solidityPacked } from 'ethers'
import { CommandType } from '../bc-helper/universal-router'

export type ArbitrageAttackerOptions = {
  chainClient: PublicClient,
  account: Account,
  universalArbitrageAddress: Hash,
  walletClient: WalletClient,
}

export type ArbitrageAttackerPlan = {
  routes: TradeRoute[],
}

export type ArbitrageAttackerAttackOptions = {
  plans: ArbitrageAttackerPlan[],
}

export class ArbitrageAttacker {
  chainClient: PublicClient
  universalArbitrageAddress: Hash
  account: Account
  walletClient: WalletClient
  public maxGasLimit: bigint = 30000000n
  public gasPrice: bigint = parseGwei('5')

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
      parseEther('16'),
      parseEther('64'),
      parseEther('256'),
      parseEther('1024'),
    ]
  }

  constructSwaps(plan: ArbitrageAttackerPlan) {
    return plan.routes.map(route => {
      let path: any
      let comandType: string
      switch(route.type) {
        case PoolType.V2:
          comandType = CommandType.V2_SWAP_EXACT_IN
          path = AbiCoder.defaultAbiCoder().encode(['address[]'], [[route.swapFrom.address, ...route.path.map(t => t.address)]])
          break;
        case PoolType.V3:
          comandType = CommandType.V3_SWAP_EXACT_IN
          const { types, args } = route.path.reduce((result, next) => {
            result.types = [...result.types, 'uint24', 'address']
            result.args = [...result.args, next.fee, next.swapTo.address]
            return result
          }, {
            types: ['address'],
            args: [route.swapFrom.address] as any[]
          })
          path = solidityPacked(types, args)
      }
      return {
        swapProviderIndex: SwapProviderIndex.PancakeSwap,
        command: CommandType.V3_SWAP_EXACT_IN,
        path
      }
    })
  }

  async attack(options: ArbitrageAttackerAttackOptions) {
    const { plans } = options
    // TODO: check if approve is required
    // TODO: or approve contract daily
    // const { request: req0 } = await this.chainClient.simulateContract({
    //   address: swapFrom.address,
    //   abi: ERC20.abi,
    //   functionName: 'approve',
    //   args: [this.pancakeswapArbitrageAddress, 2n**256n-1n],
    //   account: this.account,
    // })
    // TODO: cache balance somewhere?
    const balance = await this.chainClient.getBalance(this.account)
    for (const plan of plans) {
      // TODO: construct args
      // loop with different amount
      const swapFrom = plan.routes[0].swapFrom
      const targetAmounts = this.getTargetAmounts(swapFrom)
      const swaps = this.constructSwaps(plan)
      // TODO: attackWithAmounts
      for (const targetAmount of targetAmounts) {
        const value = swapFrom.address === bscTokens.wbnb.address ? bigIntMin(targetAmount, balance - this.transactionCostReserve) : 0n
        const deadline = Math.floor(Date.now() / 1000) + 60 // Deadline set to 1 minute from now. this don't acutally affect attack
        try {
          // TODO: test if this is working
          const result = await this.chainClient.simulateContract({
            address: this.universalArbitrageAddress,
            abi: universalArbitrageAbi,
            functionName: 'attack',
            args: [
              swapFrom.address,
              targetAmount,
              swaps,
              deadline
            ],
            account: this.account,
            value,
            // TODO: use stateOverride to let contract know it is a simulation
          })
          console.log(result.result)
          // TODO: adjust maxPriorityFeePerGas
          const maxPriorityFeePerGas = this.gasPrice // double the gas price
          const hash = await this.walletClient.writeContract({
            ...result.request,
            gas: this.maxGasLimit,
            maxPriorityFeePerGas, // FIXME: double check this
            maxFeePerGas: this.gasPrice + maxPriorityFeePerGas,
          } as any)
          console.log(hash)
        } catch (e) {
          // TODO: detect which error it is
          // console.log(e)
          break
        }
      }
    }

  }
}
