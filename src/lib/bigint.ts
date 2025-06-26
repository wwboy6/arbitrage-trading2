export const bigIntMin = (...args: bigint[]) => args.reduce((m, e) => e < m ? e : m)
