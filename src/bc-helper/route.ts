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
