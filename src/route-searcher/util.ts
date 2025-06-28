import { PoolType } from "@pancakeswap/smart-router";
import { ArbitrageAttackerPlan } from "../attacker";
import { SwapProviderIndex, TradeRoute } from "../bc-helper/route";
import { bscTokens } from "@pancakeswap/tokens";

export const defaultAttackerPlan: ArbitrageAttackerPlan[] = [
  {
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.usdt, 100, bscTokens.usd1, 500, bscTokens.wbnb]
      },
    ]
  },
]
