export function printGwei(wei: bigint) {
    return `${(wei / 10n**9n).toLocaleString('en-US')}gwei`
}
