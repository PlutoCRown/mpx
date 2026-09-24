export function isCapital (c: string): boolean {
  return /[A-Z]/.test(c)
}

export function isMustache (str: string): boolean {
  return /\{\{((?:.|\n|\r)+?)\}\}(?!})/.test(str)
}

export function capitalToHyphen (v: string): string {
  let ret = ''
  for (let i = 0; i < v.length; i++) {
    let c = v[i]
    if (isCapital(c)) {
      if (i === 0) {
        c = c.toLowerCase()
      } else {
        c = '-' + c.toLowerCase()
      }
    }
    ret += c
  }
  return ret
}

export function trimBlankRow (str: string): string {
  return str.replace(/^\s*[\r\n]/gm, '')
}

export function parseValues (str: string, char = ' '): string[] {
  let stack = 0
  let temp = ''
  const result: string[] = []
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') {
      stack++
    } else if (str[i] === ')') {
      stack--
    }
    if (stack !== 0 || str[i] !== char) {
      temp += str[i]
    }
    if ((stack === 0 && str[i] === char) || i === str.length - 1) {
      result.push(temp.trim())
      temp = ''
    }
  }
  return result
}
