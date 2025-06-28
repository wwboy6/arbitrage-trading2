import { Token } from '@pancakeswap/sdk'
import { PoolType } from '@pancakeswap/smart-router'
import { AbiCoder, solidityPacked } from 'ethers';

export enum SwapProviderIndex {
  PancakeSwap,
  Uniswap,
}

type TradeRouteBase = {
  swapProvider: SwapProviderIndex,
  type: PoolType,
}

export type TradeRouteV2 = TradeRouteBase & {
  type: PoolType.V2,
  path: Token[],
}

type TradeRouteV3Path =
  | [Token] // length 1
  | [Token, number, Token] // length 3
  | [Token, number, Token, number, Token] // length 5
  | [Token, number, Token, number, Token, number, Token] // length 7
  // Add more as needed for longer arrays
  | [Token, number, Token, number, Token, number, Token, number, Token]; // length 9

export type TradeRouteV3 = TradeRouteBase & {
  type: PoolType.V3,
  path: TradeRouteV3Path,
}

export type TradeRoute = TradeRouteV2 | TradeRouteV3

export function tradeRouteToString(route: TradeRoute) {
  switch (route.type) {
    case PoolType.V2: return `V2(${route.path.map(t => t.symbol).join('-')})`
    case PoolType.V3:
      let result = route.path[0].symbol
      let p: any[] = route.path
      for (let i = 1; i < p.length; i+=2) {
        result += `-${p[i]}-${p[i+1].symbol}`
      }
      return result
  }
}

export function constructPathData(route: TradeRoute) {
  switch (route.type) {
    case PoolType.V2: return AbiCoder.defaultAbiCoder().encode(['address[]'], [route.path.map(p => p.address)])
    case PoolType.V3:
      let args = [route.path[0].address]
      let p: any[] = route.path
      let types = ["address"]
      for (let i = 1; i < p.length; i+=2) {
        args = [...args, p[i], p[i+1].address]
        types = [...types, 'uint24', 'address']
      }
      return solidityPacked(types, args)
  }
}
