import dotenv from 'dotenv'
dotenv.config()

import { Hash } from 'viem'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  HTTP_PROXY: z.string(),
  PRIVATE_KEY: z.string().startsWith("0x").transform<Hash>((s: any) => s),
  ZAN_API_KEY: z.string(),
  ARBITRAGE_CONTRACT_ADDRESS: z.string().startsWith('0x').transform<Hash>((s: any) => s),
  TOKEN0: z.string(),
  TOKEN1: z.string(),
  PREFERRED_TOKENS: z.string().transform(s => s.split(',')),
  LINKED_TOKEN_PICK: z.string().transform(s => Number(s)),
  PROFIT_THRESHOLD: z.string().transform(s => Number(s)),
})
export default envSchema.parse(process.env)
