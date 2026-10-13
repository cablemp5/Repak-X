// caleb fork: adapters so Lucide icons accept the props upstream passes to react-icons and MUI icons.
import { forwardRef, type ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'

type Lucide = ComponentType<LucideProps>
const STROKE = 1.75

// react-icons default to 1em, so icons follow the surrounding text size
export const riIcon = (Icon: Lucide) =>
  forwardRef<SVGSVGElement, any>(({ size, title, ...rest }, ref) => (
    <Icon ref={ref} size={size ?? '1em'} strokeWidth={STROKE} aria-label={title} {...rest} />
  ))

const MUI_SIZE: Record<string, number | string> = { small: 20, medium: 24, large: 35, inherit: '1em' }

export const muiIcon = (Icon: Lucide) =>
  forwardRef<SVGSVGElement, any>(({ fontSize = 'medium', sx, htmlColor, titleAccess, style, ...rest }, ref) => {
    const sxStyle = sx && typeof sx === 'object' && !Array.isArray(sx) ? sx : {}
    const size = sxStyle.fontSize ?? style?.fontSize ?? MUI_SIZE[fontSize] ?? 24
    return (
      <Icon ref={ref} size={size} color={htmlColor} strokeWidth={STROKE} aria-label={titleAccess}
        style={{ ...sxStyle, ...style }} {...rest} />
    )
  })
