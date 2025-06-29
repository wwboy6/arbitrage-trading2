import { PoolType } from "@pancakeswap/smart-router";
import { ArbitrageAttackerPlan } from "../attacker";
import { SwapProviderIndex, TradeRoute } from "../bc-helper/route";
import { bscTokens } from "@pancakeswap/tokens";

function buildRouteFowardAndReverse(plan: ArbitrageAttackerPlan): ArbitrageAttackerPlan[] {
  return [
    plan,
    {
      ...plan,
      routes: [...plan.routes].reverse().map(r => ({...r, path: [...r.path].reverse()}))
    } as any as ArbitrageAttackerPlan
  ]
}

export const defaultAttackerPlan: ArbitrageAttackerPlan[] = [
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.usdt, 100, bscTokens.usd1, 500, bscTokens.wbnb]
      }
    ]
  }),
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.Uniswap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.usdt, 100, bscTokens.usd1, 100, bscTokens.wbnb]
      }
    ]
  }),
  // 100 usdt   v2 usdc    v3 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.usdt]
      },
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V2,
        path: [bscTokens.usdt, bscTokens.usdc]
      },
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.usdc, 100, bscTokens.wbnb]
      },
    ]
  }),
  // // v2 usdt v3 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V2,
        path: [bscTokens.wbnb, bscTokens.usdt]
      },
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.usdt, 100, bscTokens.wbnb]
      },
    ]
  }),
  // v2 usdc v3 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V2,
        path: [bscTokens.wbnb, bscTokens.usdc]
      },
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.usdc, 100, bscTokens.wbnb]
      },
    ]
  }),
  // v2 usdt v3 500 eth 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V2,
        path: [bscTokens.wbnb, bscTokens.usdt]
      },
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.usdt, 500, bscTokens.eth, 100, bscTokens.wbnb]
      },
    ]
  }),
  // pan v3 100 usdt uni 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.usdt]
      },
      {
        swapProvider: SwapProviderIndex.Uniswap,
        type: PoolType.V3,
        path: [bscTokens.usdt, 100, bscTokens.wbnb]
      },
    ]
  }),
  // pan v3 100 usd1 uni 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.usd1]
      },
      {
        swapProvider: SwapProviderIndex.Uniswap,
        type: PoolType.V3,
        path: [bscTokens.usd1, 100, bscTokens.wbnb]
      },
    ]
  }),
  // pan v3 100 eth uni 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V3,
        path: [bscTokens.wbnb, 100, bscTokens.eth]
      },
      {
        swapProvider: SwapProviderIndex.Uniswap,
        type: PoolType.V3,
        path: [bscTokens.eth, 100, bscTokens.wbnb]
      },
    ]
  }),
  // pan v2 usdt uni v3 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V2,
        path: [bscTokens.wbnb, bscTokens.usdt]
      },
      {
        swapProvider: SwapProviderIndex.Uniswap,
        type: PoolType.V3,
        path: [bscTokens.usdt, 100, bscTokens.wbnb]
      },
    ]
  }),
  // pan v2 usdc uni v3 100
  ...buildRouteFowardAndReverse({
    routes: [
      {
        swapProvider: SwapProviderIndex.PancakeSwap,
        type: PoolType.V2,
        path: [bscTokens.wbnb, bscTokens.usdc]
      },
      {
        swapProvider: SwapProviderIndex.Uniswap,
        type: PoolType.V3,
        path: [bscTokens.usdc, 100, bscTokens.wbnb]
      },
    ]
  }),
]

console.log(defaultAttackerPlan)
