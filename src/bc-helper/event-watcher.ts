import { Hash, Log, PublicClient } from "viem"
import { SwapEvent } from '../abi/PancakeV3Pool'

type ChainClientFactory = (isHttp: boolean) => PublicClient
export type LogType = Log<bigint, number, false, typeof SwapEvent>
type onLogsEventListener = (logs: LogType[]) => void

type SwapEventListenerConfig = {
  chainClientFactory: ChainClientFactory
  poolAddresses: Hash[]
  onLogs: onLogsEventListener
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export interface SwapEventArgs {
  sender: Hash
  recipient: Hash
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
  liquidity: bigint
  tick: number
}

export class SwapEventListener {
  private chainClientFactory: ChainClientFactory
  private client: PublicClient
  private httpClient: PublicClient
  private poolAddresses: Hash[]
  private onLogs: onLogsEventListener
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private lastProcessedBlock: bigint | null = null
  private reconnectAttempts = 0
  private isRunning = false
  private isReconnecting = false
  private unsubscribe: (() => void) | null = null

  constructor(config: SwapEventListenerConfig) {
    this.chainClientFactory = config.chainClientFactory
    this.client = this.chainClientFactory(false)
    this.httpClient = this.chainClientFactory(true)
    this.poolAddresses = config.poolAddresses
    this.onLogs = config.onLogs
    this.reconnectInterval = config.reconnectInterval ?? 100
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? Infinity
  }

  async start() {
    if (this.isRunning) return
    this.isRunning = true
    this.reconnectAttempts = 0
    await this.subscribe()
  }

  stop() {
    this.isRunning = false
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }

  private async subscribe() {
    if (!this.isRunning) return

    // Get the latest block if not set
    if (this.lastProcessedBlock === null) {
      this.lastProcessedBlock = await this.httpClient.getBlockNumber()
    }

    // Subscribe to Swap events
    this.unsubscribe = this.client.watchEvent({
      address: this.poolAddresses[0], // TODO:
      event: SwapEvent,
      onLogs: (logs) => {
        this.onLogs(logs)
        // TODO:
        logs.forEach((log) => {
          // Update last processed block
          if (log.blockNumber && log.blockNumber > (this.lastProcessedBlock || 0n)) {
            this.lastProcessedBlock = log.blockNumber
          }
        })
      },
      onError: async (error) => {
        if (
          error.message.indexOf('The socket has been closed') >= 0 ||
          error.message.indexOf('Unexpected end of JSON input') >= 0
        ) {
          // ignore
        } else {
          console.error('WebSocket Error:', error)
        }
        await this.handleReconnect()
      },
    })
  }

  private async handleReconnect() {
    if (!this.isRunning || this.isReconnecting) return
    this.isReconnecting = true

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached. Stopping.')
      this.stop()
      return
    }

    // Exponential backoff
    const delay = this.reconnectInterval * 2 ** this.reconnectAttempts
    this.reconnectAttempts++
    console.log(`Reconnecting in ${delay}ms... Attempt ${this.reconnectAttempts}`)

    // Unsubscribe from previous subscription
    if (this.unsubscribe) {
      // this.unsubscribe() // TODO:
      this.unsubscribe = null
    }

    // Recover missed events
    await this.recoverMissedEvents()

    // Wait and retry
    await new Promise((resolve) => setTimeout(resolve, delay))

    // Reinitialize WebSocket client
    this.client = this.chainClientFactory(false)

    // Resubscribe
    await this.subscribe()
    this.isReconnecting = false
  }
  private async recoverMissedEvents() {
    if (this.lastProcessedBlock === null) return

    try {
      const currentBlock = await this.httpClient.getBlockNumber()
      if (currentBlock <= this.lastProcessedBlock) return

      console.log(`Recovering events from block ${this.lastProcessedBlock + 1n} to ${currentBlock}`)

      const logs = await this.httpClient.getLogs({
        address: this.poolAddresses[0], // TODO:
        event: SwapEvent,
        fromBlock: this.lastProcessedBlock + 1n,
        toBlock: currentBlock,
      })
      this.onLogs(logs)
      // TODO:
      logs.forEach((log) => {
        if (log.blockNumber && log.blockNumber > (this.lastProcessedBlock || 0n)) {
          this.lastProcessedBlock = log.blockNumber
        }
      })

      console.log(`Recovered ${logs.length} missed events`)
    } catch (error) {
      console.error('Error recovering events:', error)
    }
  }
}
