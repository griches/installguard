export type Word = {
  text: string
  start: number
  end: number
  isRedirect: boolean
  isDynamic: boolean
}

export type Command = {
  /** The executable's name, any folder before it dropped. */
  name: string
  args: string[]
  /** True when an argument is built at run time (`$VAR`, `$(...)`), so its text is not what runs. */
  hasDynamicArgs: boolean
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const WRAPPERS = new Set(['time', 'command', 'exec', 'env', 'nohup', 'sudo', 'caffeinate', '{', '!', 'if', 'then', 'else', 'do', 'while'])

const split = (command: string): Word[][] => {
  const segments: Word[][] = []
  let words: Word[] = []
  let word: Word | null = null
  const open = (at: number): Word => {
    word ??= { text: '', start: at, end: at, isRedirect: false, isDynamic: false }

    return word
  }
  const push = (at: number) => {
    if (word !== null) {
      word.end = at
      words.push(word)
      word = null
    }
  }
  const cut = (at: number) => {
    push(at)

    if (words.length > 0) {
      segments.push(words)
    }

    words = []
  }
  const size = command.length
  let i = 0

  while (i < size) {
    const c = command.charAt(i)
    const following = command.charAt(i + 1)

    if (c === '\\') {
      if (following !== '\n') {
        open(i).text += following
      }

      i += 2
    } else if (c === "'") {
      const close = command.indexOf("'", i + 1)
      const stop = close < 0 ? size : close
      open(i).text += command.slice(i + 1, stop)
      i = stop + 1
    } else if (c === '"') {
      const quoted = open(i)
      i += 1

      while (i < size && command.charAt(i) !== '"') {
        const inner = command.charAt(i)
        const escaped = command.charAt(i + 1)

        if (inner === '\\' && '\\"$`\n'.includes(escaped) && escaped !== '') {
          quoted.text += escaped === '\n' ? '' : escaped
          i += 2
        } else {
          quoted.isDynamic ||= inner === '$' || inner === '`'
          quoted.text += inner
          i += 1
        }
      }

      i += 1
    } else if (c === '$' && following === '(') {
      const substituted = open(i)
      let depth = 0
      let stop = i + 1

      for (; stop < size; stop += 1) {
        const inner = command.charAt(stop)
        depth += inner === '(' ? 1 : inner === ')' ? -1 : 0

        if (depth === 0) {
          break
        }
      }

      substituted.isDynamic = true
      substituted.text += command.slice(i, stop + 1)
      i = stop + 1
    } else if (c === '`') {
      const close = command.indexOf('`', i + 1)
      const stop = close < 0 ? size : close
      const substituted = open(i)
      substituted.isDynamic = true
      substituted.text += command.slice(i, stop + 1)
      i = stop + 1
    } else if (c === '#' && word === null) {
      const newline = command.indexOf('\n', i)
      i = newline < 0 ? size : newline
    } else if (c === ' ' || c === '\t') {
      push(i)
      i += 1
    } else if (c === '>' || c === '<') {
      const redirect = open(i)
      redirect.isRedirect = true
      redirect.text += c
      i += 1
    } else if (c === '&' && ('<>'.includes(command.charAt(i - 1) || ' ') || following === '>')) {
      const redirect = open(i)
      redirect.isRedirect = true
      redirect.text += c
      i += 1
    } else if (';\n|&()'.includes(c)) {
      cut(i)
      i += 1
    } else {
      const plain = open(i)
      plain.isDynamic ||= c === '$'
      plain.text += c
      i += 1
    }
  }

  cut(size)

  return segments
}

const analyse = (words: Word[]): Command | null => {
  let i = 0

  while (i < words.length) {
    const text = words[i]?.text ?? ''

    if (ASSIGNMENT.test(text)) {
      i += 1
    } else if (WRAPPERS.has(text)) {
      i += 1

      while (words[i]?.text.startsWith('-') === true) {
        i += 1
      }
    } else {
      break
    }
  }

  const head = words[i]

  if (head === undefined || head.isRedirect || head.isDynamic) {
    return null
  }

  const rest = words.slice(i + 1)
  const redirect = rest.findIndex(one => one.isRedirect)
  const args = redirect < 0 ? rest : rest.slice(0, redirect)

  return {
    name: head.text.slice(head.text.lastIndexOf('/') + 1),
    args: args.map(one => one.text),
    hasDynamicArgs: args.some(one => one.isDynamic),
  }
}

/**
 * The commands a Bash command line runs, in order.
 *
 * Only a command standing at a command position counts: one inside a quoted
 * string, a `$(...)` or a here-document is text, not something that runs here.
 */
export const commands = (command: string): Command[] =>
  command.includes('<<')
    ? []
    : split(command)
        .map(analyse)
        .filter(one => one !== null)
