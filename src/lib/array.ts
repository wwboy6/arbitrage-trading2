export const itemNotFoundError = new Error('item not found')

// TODO: handle array that have different type for each item
export function arrayFindOrThrow<T>(array: T[], determinant: (item: T)=>boolean, notFoundE: Error = itemNotFoundError) : T {
    const result = array.find(determinant)
    if (result === undefined) throw notFoundE
    return result
}
