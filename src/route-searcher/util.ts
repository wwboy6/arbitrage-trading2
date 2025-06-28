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
        swapFrom: bscTokens.wbnb,
        path: [
          { swapTo: bscTokens.usdt, fee: 100 },
          { swapTo: bscTokens.usd1, fee: 100 },
          { swapTo: bscTokens.wbnb, fee: 500 },
        ]
      },
    ]
  },
]
