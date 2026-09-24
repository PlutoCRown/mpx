export default function makeMap (str: string, expectsLowerCase?: boolean): (val: string) => boolean {
  const map = Object.create(null) as Record<string, boolean>
  const list = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i].trim()] = true
  }
  return expectsLowerCase ? (val: string) => !!map[val.toLowerCase()] : (val: string) => !!map[val]
}
