import { Token } from '@pancakeswap/sdk'
import { PoolType } from '@pancakeswap/smart-router'

export enum SwapProviderIndex {
  PancakeSwap,
  Uniswap,
}

type TradeRouteBase = {
  swapProvider: SwapProviderIndex,
  type: PoolType,
  swapFrom: Token,
}

export type TradeRouteV2 = TradeRouteBase & {
  type: PoolType.V2,
  path: Token[],
}

export type V3PoolConfig = {
  swapTo: Token,
  fee: Number,
}

export type TradeRouteV3 = TradeRouteBase & {
  type: PoolType.V3,
  path: V3PoolConfig[],
}

export type TradeRoute = TradeRouteV2 | TradeRouteV3

export function tradeRouteToString(route: TradeRoute) {
  switch (route.type) {
    case PoolType.V2: return `V2(${route.path.map(t => t.symbol).join('-')})`
    case PoolType.V3: return `V3(${route.path.map(p => `${p.swapTo.symbol}[${p.fee}]`).join('-')})`
  }
}
