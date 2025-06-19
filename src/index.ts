import { Chain } from 'viem'
import env from './env'
import { getLocalChain, getPublicBscChain } from './bc-helper/chain'
import { findTokenWithSymbol } from './bc-helper/coin'
import z from 'zod'

const { NODE_ENV, HTTP_PROXY, PRIVATE_KEY, ZAN_API_KEY, ARBITRAGE_CONTRACT_ADDRESS, TOKEN0, TOKEN1, PREFERRED_TOKENS, LINKED_TOKEN_PICK, PROFIT_THRESHOLD } = env

function setup () {
  let chain: Chain
  if (NODE_ENV) {
    chain = getPublicBscChain(ZAN_API_KEY)
  } else {
    chain = getLocalChain()
  }
  const tokenPairKey = `${TOKEN0.toLowerCase()}-${TOKEN1.toLowerCase()}`
  const swapFrom = findTokenWithSymbol(TOKEN0)
  const swapTo = findTokenWithSymbol(TOKEN1)
  const swapTokenAddresses = [swapFrom, swapTo].map(t => t.address)
  return { chain, tokenPairKey, swapFrom, swapTo, swapTokenAddresses }
}

async function main () {
  console.log('==== Blockchain Arbitrage Trading Bot ====')
  console.log(`NODE_ENV: ${NODE_ENV}`)
  const { chain, tokenPairKey } = setup()
  console.log(`Using chain: ${chain.name}`)
}

main()
