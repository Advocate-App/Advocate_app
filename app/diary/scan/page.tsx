// Server-side wrapper just so this segment can be force-dynamic — the
// actual scanner (ScanClient) is a 'use client' component, and pdf-lib
// (used to assemble scanned pages into one PDF) touches browser-only APIs
// like DOMMatrix that don't exist during Next.js's build-time static
// prerendering. Route segment config like `dynamic` isn't allowed in a
// 'use client' file, hence the split.
export const dynamic = 'force-dynamic'

import ScanClient from './ScanClient'

export default function ScanPage() {
  return <ScanClient />
}
