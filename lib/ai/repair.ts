/**
 * Reparación de JSON devuelto por modelos de lenguaje.
 *
 * Los modelos fallan de formas muy predecibles: envuelven el JSON en ```json,
 * escriben una frase antes, meten una coma de más al cerrar. Todo eso se arregla
 * con código, sin gastar una segunda llamada (PLAN.md §12).
 *
 * Solo si esto falla se reintenta contra el modelo.
 */

/** Quita vallas de código markdown: ```json … ``` */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/)
  return fenced?.[1] ?? text
}

/**
 * Extrae el primer objeto o array JSON equilibrado, ignorando texto alrededor.
 * Cuenta llaves respetando cadenas y escapes, para no cortar en `{` dentro de un string.
 */
function extractBalanced(text: string): string | null {
  const start = text.search(/[[{]/)
  if (start === -1) return null

  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Elimina comas colgantes antes de `}` o `]`. */
function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * Intenta obtener un valor JSON a partir de texto de modelo.
 * Devuelve `null` si no hay nada recuperable; nunca lanza.
 */
export function repairJson(raw: string): unknown | null {
  if (!raw || !raw.trim()) return null

  const candidates: string[] = []
  const unfenced = stripCodeFence(raw).trim()

  candidates.push(unfenced)

  const balanced = extractBalanced(unfenced)
  if (balanced) candidates.push(balanced)

  candidates.push(removeTrailingCommas(unfenced))
  if (balanced) candidates.push(removeTrailingCommas(balanced))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // siguiente intento
    }
  }
  return null
}
