// @ts-nocheck — extracted rule table; keep shapes loose
export default function changeKey (input: Record<string, unknown>, srcKey: string, targetKey: string): Record<string, unknown> {
  const value = input[srcKey]
  delete input[srcKey]
  input[targetKey] = value
  return input
}
