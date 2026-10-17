// repakxtra: the app's name as its logo: "repak" in Geist 800 (the same letter shapes as the README banner), "xtra" as
// hand-drawn blue dots, 7 to the x-height with 2-dot stems. The dots pulse like the MatrixLoader while the app is working
// (mods loading or installing, previews generating) and on hover; never with Animations off or reduced motion
// (theme.css, .wm). The light theme draws "repak" in ink; dev and test copies turn the dots amber and green.
import { usePreviewBatch } from './previews'

/** "repak": [x offset, path] per letter, in font units (baseline at 0, y up) */
const REPAK: [number, string][] = [
  [0, 'M56 0V540H244L250 370L236 372Q251 462 284 501Q317 540 377 540H423V386H375Q332 386 304 378Q277 369 264 348Q250 327 250 289V0Z'],
  [395, 'M321 -12Q234 -12 169 23Q104 58 68 122Q32 185 32 270Q32 355 68 418Q104 481 169 516Q234 552 321 552Q408 552 472 516Q535 479 569 412Q603 345 603 254V220H232Q234 171 260 148Q285 124 325 124Q354 124 374 135Q395 146 404 174L596 164Q574 77 500 32Q426 -12 321 -12ZM232 324H409Q408 371 384 396Q360 420 321 420Q284 420 260 394Q235 368 232 324Z'],
  [1000, 'M56 -150V540H245L249 427L236 432Q256 490 300 521Q344 552 404 552Q476 552 526 516Q576 480 602 416Q628 353 628 270Q628 188 602 124Q575 60 524 24Q474 -12 402 -12Q364 -12 331 2Q298 17 274 44Q249 71 237 108L250 112V-150ZM339 127Q381 127 405 166Q429 204 429 270Q429 336 405 374Q381 413 339 413Q311 413 291 397Q271 381 260 349Q250 317 250 270Q250 223 260 191Q271 159 291 143Q311 127 339 127Z'],
  [1630, 'M227 -12Q142 -12 87 27Q32 66 32 136Q32 208 80 246Q127 285 215 304L377 338Q377 380 359 402Q341 424 309 424Q275 424 256 408Q238 391 233 359L41 365Q57 463 126 508Q195 552 309 552Q441 552 506 495Q571 438 571 322V164Q571 138 580 130Q588 122 603 122H614V0Q605 -3 585 -6Q565 -8 546 -8Q517 -8 486 2Q455 12 434 40Q413 69 413 124L427 108Q416 71 391 44Q366 17 326 2Q285 -12 227 -12ZM281 110Q308 110 330 121Q351 132 364 154Q377 177 377 212V230L289 208Q264 202 248 188Q231 175 231 154Q231 133 243 122Q255 110 281 110Z'],
  [2225, 'M56 0V710H250V364L410 540H636L428 322L640 0H434L304 218L250 160V0Z'],
]

/** "xtra" as dots, rows top to bottom, the last on the baseline; t rises 2 rows above the x-height */
const LETTERS = [
  ['XX...XX', 'XX...XX', '.XX.XX.', '..XXX..', '.XX.XX.', 'XX...XX', 'XX...XX'],
  ['.XX..', '.XX..', 'XXXXX', '.XX..', '.XX..', '.XX..', '.XX..', '.XX..', '..XXX'],
  ['XX.XXX', 'XXXXXX', 'XXX...', 'XX....', 'XX....', 'XX....', 'XX....'],
  ['.XXXX.', 'XX..XX', '....XX', '.XXXXX', 'XX..XX', 'XX..XX', '.XXXXX'],
]
const PITCH = 540 / 7          // Geist 800's x-height (540 units) in 7 dots
const DOT = PITCH * 0.9
const LEFT = 40, TOP = 725, W = 4977, H = 890   // the viewBox: x from 40, 725 units above the baseline to 165 below

/** Every dot: its top-left in viewBox units, one of 4 shades (texture, like the source logo) and its pulse offset. */
const DOTS = (() => {
  const out: { x: number; y: number; shade: number; delay: number }[] = []
  let x0 = 2905   // clear of the k's right leg (it ends at 2865)
  for (const rows of LETTERS) {
    rows.forEach((line, r) => [...line].forEach((v, c) => {
      if (v !== 'X') return
      const n = out.length
      const up = rows.length - 1 - r
      out.push({
        x: x0 + (c + 0.5) * PITCH - DOT / 2 - LEFT,
        y: TOP - (up + 0.5) * PITCH - DOT / 2,
        shade: [0, 0, 0, 0, 0, 0, 0, 1, 2, 3][(n * 7 + c * 3 + r * 5) % 10],
        delay: -((n * 0.618034) % 1) * 1.4,   // golden-ratio steps: a scattered order, fixed so it never re-renders
      })
    }))
    x0 += (rows[0].length + 1) * PITCH   // one empty column between letters
  }
  return out
})()

/** `height` in px; `busy`: the app is working (the header passes its mods-loading state; preview runs count anywhere). */
export default function Wordmark({ height, busy = false, className = '' }: { height: number; busy?: boolean; className?: string }) {
  const live = busy || usePreviewBatch() !== null
  return (
    <svg className={`wm${live ? ' is-live' : ''} ${className}`} viewBox={`0 0 ${W} ${H}`} height={height} width={(height * W) / H}
      role="img" aria-label="repakxtra">
      <g className="wm-repak" transform={`translate(${-LEFT} ${TOP}) scale(1 -1)`}>
        {REPAK.map(([x, d]) => <path key={x} transform={`translate(${x} 0)`} d={d} />)}
      </g>
      <g className="wm-dots">
        {DOTS.map((d, i) => (
          <rect key={i} className={`s${d.shade}`} x={d.x.toFixed(1)} y={d.y.toFixed(1)} width={DOT.toFixed(1)} height={DOT.toFixed(1)}
            rx={(DOT * 0.25).toFixed(1)} style={{ animationDelay: `${d.delay.toFixed(2)}s` }} />
        ))}
      </g>
    </svg>
  )
}
