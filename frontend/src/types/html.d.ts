// Type declarations for deprecated HTML elements used for retro styling

declare namespace JSX {
  interface IntrinsicElements {
    marquee: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLMarqueeElement> & {
        behavior?: 'scroll' | 'slide' | 'alternate'
        direction?: 'left' | 'right' | 'up' | 'down'
        scrollAmount?: number
        scrollDelay?: number
        loop?: number
      },
      HTMLMarqueeElement
    >
  }
}

interface HTMLMarqueeElement extends HTMLElement {
  behavior: string
  direction: string
  scrollAmount: number
  scrollDelay: number
  loop: number
  start(): void
  stop(): void
}
