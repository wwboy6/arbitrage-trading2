import env from './env'
import { Hash, Log, PublicClient, createPublicClient, formatEther, webSocket } from 'viem'
import { getPublicBscChain } from "./bc-helper/chain";
import { SwapEvent } from './abi/PancakeV3Pool'
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { bsc } from 'viem/chains';
import { throttledHttp } from './bc-helper/throttled-http';
import { LogType, SwapEventListener } from './bc-helper/event-watcher';

const { ZAN_API_KEY, PROXY_URL } = env

if (PROXY_URL) {
  // FIXME: NO_PROXY
  // Corporate proxy uses CA not in undici's certificate store
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  const dispatcher = new ProxyAgent({uri: new URL(PROXY_URL).toString() }) // TODO: apply https_proxy no_proxy
  setGlobalDispatcher(dispatcher)
}

async function main() {
  console.log("start")
  const chain = getPublicBscChain(ZAN_API_KEY)
  const poolAddresses: Hash[] = ['0x172fcd41e0913e95784454622d1c3724f546f849']
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
  const eventListener = new SwapEventListener({
    chainClientFactory: (isHttp: boolean): PublicClient => {
      if (isHttp) return createPublicClient({
        chain,
        transport,
        batch: {
          multicall: {
            batchSize: 2**10, // TODO: determine optimal batch size
          }
        },
      }) as PublicClient
      else return createPublicClient({
        chain,
        transport: webSocket(chain.rpcUrls.default.webSocket[0], { reconnect: false, retryCount: 0 }),
      })
    },
    poolAddresses,
    onLogs: (logs: LogType[]) => {
      logs.forEach((log) => {
        const { logIndex, transactionIndex, blockNumber } = log
        const { amount0, amount1, tick } = log.args;
        console.warn(`Swap Event on Pool ${poolAddresses[0]}:`, blockNumber, logIndex, tick, formatEther(amount0!), formatEther(amount1!))
      })
    }
  })

  await eventListener.start()

  // // const chain = {
  // //   ...bsc,
  // //   rpcUrls: {
  // //     default: {
  // //       http: [`https://bsc-mainnet.infura.io/v3/05c1dbfaa33f43268f953de9e26bef0d`],
  // //       webSocket: [`wss://bsc-mainnet.infura.io/ws/v3/05c1dbfaa33f43268f953de9e26bef0d`]
  // //     },
  // //   },
  // // }
  // const chain = getPublicBscChain(ZAN_API_KEY)
  // const wssChainClient: PublicClient = createPublicClient({
  //   chain,
  //   transport: webSocket(chain.rpcUrls.default.webSocket[0], {
  //     reconnect: {
  //       attempts: 2,
  //       delay: 1000,
  //     },
  //     retryCount: 0,
  //     // retryDelay: 1000,
  //   }),
  // })
  // const address = '0x172fcd41e0913e95784454622d1c3724f546f849' // wbnb 100 usdt
  // wssChainClient.watchEvent({
  //   address,
  //   event: SwapEvent,
  //   onLogs: (logs) => {
  //     logs.forEach((log) => {
  //       const { amount0, amount1, tick } = log.args;
  //       console.warn(`Swap Event on Pool ${address}:`, tick, amount0, amount1)
  //     })
  //   },
  //   onError: (error) => console.error('Error:', error.message),
  // })
}

main()
