export const undefinedError = new Error('value is undefined')

export function valueOrThrow<T>(value: T | undefined, undError: Error = undefinedError): T {
    if (value === undefined) throw undefinedError
    return value
}
