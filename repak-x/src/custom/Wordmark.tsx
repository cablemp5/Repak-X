// repakxtra: the app's name as its logo image ("repak" in white, "xtra" in blue dots), cut from
// .github/brand/repakxtralogo-source.png by scripts/make-icon.py. The light theme shows the ink copy, and the test and
// dev copies turn the dots green or amber (theme.css, .wordmark).
import dark from '../assets/brand/wordmark.png'
import ink from '../assets/brand/wordmark-ink.png'

export default function Wordmark({ height, className = '' }: { height: number; className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      <img className="wm-dark" src={dark} alt="repakxtra" height={height} draggable={false} />
      <img className="wm-ink" src={ink} alt="repakxtra" height={height} draggable={false} />
    </span>
  )
}
