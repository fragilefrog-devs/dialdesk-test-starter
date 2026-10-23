/** A template remounts on every navigation, which replays the short page-enter animation. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
