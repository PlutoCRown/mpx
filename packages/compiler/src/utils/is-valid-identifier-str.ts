export default function isValidIdentifierStr (str: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(str)
}
