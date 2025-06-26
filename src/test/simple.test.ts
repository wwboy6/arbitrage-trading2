import { Address, Chain, createPublicClient, createWalletClient, getAddress, http } from 'viem'
import env from '../env'
import { getLocalChain, getPublicBscChain } from '../bc-helper/chain'
import { bscTokens } from '@pancakeswap/tokens'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc } from 'viem/chains'
// import { expect } from 'chai'
const { NODE_ENV, PROXY_URL, PRIVATE_KEY, ZAN_API_KEY } = env

// TODO: proxy

describe("Basic tests", function () {
  let chain: Chain
  if (NODE_ENV === 'production') {
    chain = getPublicBscChain(ZAN_API_KEY)
  } else {
    chain = getLocalChain()
  }
  const chainClient = createPublicClient({
    chain,
    transport: http(),
  })
  const account = privateKeyToAccount(PRIVATE_KEY)
  const walletClient = createWalletClient({
    chain,
    transport: http(),
    account, // Replace with your private key
  });
  it.only("simulate write contract", async function () {
    // PancakeSwap V2 Factory ABI (subset for createPair)
    const abi = [
      {
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
      },
    ];
    const busdAddress: Address = getAddress("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"); // BUSD (BSC mainnet)
    const spender: Address = getAddress("0x55d398326f99059fF775485246999027B3197955"); // USDT address as spender
    const { result } = await chainClient.simulateContract({
      address: busdAddress,
      abi,
      functionName: "approve",
      args: [spender, 1n],
      account,
    });
    console.log(result)
  })
})