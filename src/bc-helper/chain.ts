import { bsc } from 'viem/chains'

export const getPublicBscChain = (ZAN_API_KEY: string) => ({
  ...bsc,
  rpcUrls: {
    default: {
      http: [`https://api.zan.top/node/v1/bsc/mainnet/${ZAN_API_KEY}`],
      webSocket: [`wss://api.zan.top/node/ws/v1/bsc/mainnet/${ZAN_API_KEY}`]
    },
  },
})

export const getLocalChain = (port: number = 8545) => ({
  ...bsc,
  name: 'Local Hardhat',
  network: 'hardhat',
  rpcUrls: {
    default: {
      http: [`http://127.0.0.1:${port}`],
    },
    public: {
      http: [`http://127.0.0.1:${port}`],
    },
  }
})
