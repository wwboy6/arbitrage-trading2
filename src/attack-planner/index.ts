import { parseAbiItem, PublicClient } from "viem"
import { ArbitrageAttackerPlan } from "../attacker"
import { defaultAttackerPlans } from "./util"
import { getFileLogger } from "../lib/file-logger"

export type AttackPlannerOptions = {
  wssChainClient: PublicClient
}

export class AttackPlanner {
  wssChainClient: PublicClient
  attackPlans: ArbitrageAttackerPlan[]
  constructor(options: AttackPlannerOptions) {
    this.wssChainClient = options.wssChainClient
    this.attackPlans = defaultAttackerPlans
    // FIXME: seems this would distrub http call
    // const address = '0x172fcd41e0913e95784454622d1c3724f546f849' // wbnb 100 usdt
    // this.wssChainClient.watchEvent({
    //   address,
    //   event: parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'), // TODO:
    //   onLogs: (logs) => {
    //     logs.forEach((log) => {
    //       const { amount0, amount1, tick } = log.args;
    //       getFileLogger().log(`Swap Event on Pool ${address}:`, tick, amount0, amount1)
    //     })
    //   },
    //   onError: (error) => console.error('Error:', error.message),
    // })
  }
}
