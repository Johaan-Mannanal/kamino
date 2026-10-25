import './brand.css'

/** The accessible home-link name stays stable when a narrow header uses only the mark. */
export function brandLink(href: '/' | '#home' = '/'): string {
  return `<a class="brand kamino-brand" href="${href}" aria-label="Kamino home"><img class="kamino-brand-lockup" src="/brand/kamino-lockup-on-dark.svg" width="132" height="35" alt="" decoding="async"><img class="kamino-brand-mark" src="/brand/kamino-mark-blue.svg" width="32" height="34" alt="" decoding="async"></a>`
}
