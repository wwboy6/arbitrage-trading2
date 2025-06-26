import { Chain, PublicClient, createPublicClient, createWalletClient } from 'viem'
import env from './env'
import { bscTokens } from '@pancakeswap/tokens'
import { PoolType } from '@pancakeswap/smart-router'
import { getLocalChain, getPublicBscChain } from './bc-helper/chain'
// import { findTokenWithSymbol } from './bc-helper/coin'
import { setGlobalDispatcher, ProxyAgent } from "undici"
import pThrottle from 'p-throttle'
import { ArbitrageAttacker, ArbitrageAttackerPlan } from './attacker'
import { SwapProviderIndex, TradeRoute } from './bc-helper/route'
import { throttledHttp } from './bc-helper/throttled-http'
import { privateKeyToAccount } from 'viem/accounts'

const { NODE_ENV, PROXY_URL, PRIVATE_KEY, ZAN_API_KEY, ARBITRAGE_CONTRACT_ADDRESS, PLAN_MAX, INTERVAL, PROFIT_THRESHOLD } = env

if (PROXY_URL) {
  // FIXME: NO_PROXY
  // Corporate proxy uses CA not in undici's certificate store
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  const dispatcher = new ProxyAgent({uri: new URL(PROXY_URL).toString() }) // TODO: apply https_proxy no_proxy
  setGlobalDispatcher(dispatcher)
}

function setup () {
  let chain: Chain
  if (NODE_ENV === 'production') {
    chain = getPublicBscChain(ZAN_API_KEY)
  } else {
    chain = getLocalChain()
  }
  const transport = throttledHttp(
    chain.rpcUrls.default.http[0],
    {
      retryCount: Infinity, // FIXME:
      retryDelay: 1 * 1000,
    } as any, // TODO:
    {
      limit: 19, // TODO: this depends on rpc server
      interval: 1000
    }
  )
  const chainClient: PublicClient = createPublicClient({
    chain,
    transport,
    batch: {
      multicall: {
        batchSize: 2**10, // TODO: determine optimal batch size
      }
    },
  })
  const account = privateKeyToAccount(PRIVATE_KEY)
  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  })
  const attacker = new ArbitrageAttacker({
    chainClient,
    account,
    universalArbitrageAddress: ARBITRAGE_CONTRACT_ADDRESS,
    walletClient,
  })
  return { chain, chainClient, account, attacker }
}

async function main () {
  console.log('==== Blockchain Arbitrage Trading Bot ====')
  console.log(`NODE_ENV: ${NODE_ENV}`)
  // const
  const { chain, chainClient, account, attacker } = setup()
  console.log(`Using chain: ${chain.name}`)
  // variables
  let plans: ArbitrageAttackerPlan[] = [
    {
      routes: [
        {
          swapProvider: SwapProviderIndex.PancakeSwap,
          type: PoolType.V3,
          swapFrom: bscTokens.wbnb,
          path: [
            {
              swapTo: bscTokens.usdt,
              fee: 100
            },
            {
              swapTo: bscTokens.usd1,
              fee: 100
            },
            {
              swapTo: bscTokens.wbnb,
              fee: 500
            },
          ]
        },
      ]
    },
  ]
  
  // TODO: update gas config regularly
  const block = await chainClient.getBlock({ blockTag: 'latest' })
  const maxGasLimit = block.gasLimit
  console.log('maxGasLimit', maxGasLimit)
  // TODO: make a discount in case this would be changed
  attacker.maxGasLimit = maxGasLimit * 9n / 10n
  const gasPrice = await chainClient.getGasPrice()
  console.log('gasPrice', gasPrice)
  attacker.gasPrice = gasPrice

  // loop with throttle
  const loop = pThrottle({
    limit: 1,
    interval: INTERVAL,
  })(async () => {
    // TODO: update gas config regularly
    // TODO: update plans
    // attempt attack
    await attacker.attack({
      plans: plans.slice(0, PLAN_MAX)
    })
  })
  while (true) {
    await loop()
  }
}

main()
