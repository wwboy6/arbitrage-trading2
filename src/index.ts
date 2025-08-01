import { Chain, PublicClient, createPublicClient, createWalletClient, webSocket } from 'viem'
import env from './env'
import { bscTokens } from '@pancakeswap/tokens'
import { PoolType } from '@pancakeswap/smart-router'
import { getLocalChain, getPublicBscChain } from './bc-helper/chain'
// import { findTokenWithSymbol } from './bc-helper/coin'
import { setGlobalDispatcher, ProxyAgent } from "undici"
import pThrottle from 'p-throttle'
import pMemoize from 'p-memoize'
import { ArbitrageAttacker, ArbitrageAttackerPlan } from './attacker'
import { AttackPlanner } from './attack-planner'
import { defaultAttackerPlans } from './attack-planner/util'
import { SwapProviderIndex, TradeRoute } from './bc-helper/route'
import { throttledHttp } from './bc-helper/throttled-http'
import { privateKeyToAccount } from 'viem/accounts'
import { getFileLogger, setupFileLogger } from './lib/file-logger'
import ExpiryMap from 'expiry-map'

const { NODE_ENV, PROXY_URL, PRIVATE_KEY, ZAN_API_KEY, ARBITRAGE_CONTRACT_ADDRESS, PLAN_MAX, INTERVAL, GAS_PER_LOOP } = env

setupFileLogger('./data/log.txt')

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
      retryCount: 3, // FIXME:
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
  const wssChainClient: PublicClient = createPublicClient({
    chain,
    transport: webSocket(),
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
    gasPerLoop: GAS_PER_LOOP,
  })
  const attackPlanner = new AttackPlanner({
    wssChainClient,
  })
  return { chain, chainClient, account, attacker, attackPlanner }
}

async function main () {
  console.log('==== Blockchain Arbitrage Trading Bot ====')
  console.log(`NODE_ENV: ${NODE_ENV}`)
  // const
  const { chain, chainClient, account, attacker, attackPlanner } = setup()
  console.log(`Using chain: ${chain.name}`)
  // variables
  let plans = defaultAttackerPlans
  // TODO: verify plan: ending token should be the same as swap in
  
  // TODO: update gas config regularly
  const block = await chainClient.getBlock({ blockTag: 'latest' })
  const maxGasLimit = block.gasLimit
  console.log('chain maxGasLimit', maxGasLimit)
  attacker.balance = await chainClient.getBalance(account)

  const getGasPrice = pMemoize(async () => {
    const gasPrice = await chainClient.getGasPrice() 
    console.log('gasPrice', gasPrice)
    return gasPrice
  }, {cache: new ExpiryMap(60000)})

  // loop with throttle
  const loop = pThrottle({
    limit: 1,
    interval: INTERVAL,
  })(async () => {
    try {
      // update gas config regularly
      attacker.gasPrice = await getGasPrice()
      // TODO: update plans by attackPlanner
      // attempt attack
      const planIndex = await attacker.attack({
        plans: plans.slice(0, PLAN_MAX)
      })
      // TODO: repeat plans if planIndex >= 0
    } catch (e: any) {
      console.error(e)
      if (
        e.message.indexOf('The request took too long to respond') >= 0 ||
        e.message.indexOf('HTTP request failed') >= 0 ||
        e.message.indexOf('fetch failed') >= 0
      ) {
        // ignore
      } else {
        getFileLogger().log('error:', e.message)
      }
    }
  })
  while (true) {
    await loop()
  }
}

main()
