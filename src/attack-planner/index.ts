import { PublicClient } from "viem"
import { ArbitrageAttackerPlan } from "../attacker"
import { defaultAttackerPlans } from "./util"
// import { SwapEvent } from '../abi/PancakeV3Pool'

export type AttackPlannerOptions = {
  wssChainClient: PublicClient
}

export class AttackPlanner {
  wssChainClient: PublicClient
  attackPlans: ArbitrageAttackerPlan[]
  constructor(options: AttackPlannerOptions) {
    this.wssChainClient = options.wssChainClient
    this.attackPlans = defaultAttackerPlans
    // // FIXME: this is not stable
    // const address = '0x172fcd41e0913e95784454622d1c3724f546f849' // wbnb 100 usdt
    // this.wssChainClient.watchEvent({
    //   address,
    //   event: SwapEvent,
    //   onLogs: (logs) => {
    //     logs.forEach((log) => {
    //       const { amount0, amount1, tick } = log.args;
    //       console.warn(`Swap Event on Pool ${address}:`, tick, amount0, amount1)
    //     })
    //   },
    //   onError: (error) => console.error('Error:', error.message),
    // })
  }
}
