import { marked } from 'marked'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'

// DOMPurify needs a DOM environment — use jsdom in Node.js
const { window } = new JSDOM('<!DOCTYPE html>')
const DOMPurify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0])

// Allowed HTML elements after markdown parsing.
// Raw HTML in the input is stripped before parsing — authors write markdown,
// not HTML. This list covers what marked legitimately produces.
const ALLOWED_TAGS = [
  'p', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'strong', 'em', 'del', 's',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr',
]

const ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'id', 'class',
]

// Converts markdown to sanitized HTML.
// Raw HTML blocks in the input are escaped by stripping angle brackets first,
// so <script> etc. never reach the parser.
export function markdownToHtml(markdown: string): string {
  // Strip raw HTML angle brackets before parsing so <script> becomes visible text
  const stripped = markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Re-allow markdown-style angle-bracket blockquotes: > text
  // (marked uses `>` prefix, not `<`, so this doesn't interfere)

  const rawHtml = marked.parse(stripped, { async: false }) as string

  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })

  return clean
}

// For use in <head> tags — strips all HTML, returns plain text
export function markdownToPlainText(markdown: string): string {
  const html = markdownToHtml(markdown)
  return html.replace(/<[^>]+>/g, '').trim()
}
