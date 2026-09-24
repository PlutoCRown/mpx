const hasOwnProperty = Object.prototype.hasOwnProperty

export default function hasOwn (obj: Record<string, unknown>, key: string): boolean {
  return hasOwnProperty.call(obj, key)
}
