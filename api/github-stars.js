const REPOSITORY_URL = 'https://github.com/hyuck0221/travel-plan'
const BADGE_URL = 'https://img.shields.io/github/stars/hyuck0221/travel-plan?style=flat'

let cached = { stars: null, expiresAt: 0 }

function parseRepositoryStars(html) {
  const match = html.match(/aria-label=["']([\d,]+)\s+users starred/i)
  return match ? Number(match[1].replace(/,/g, '')) : null
}

function parseBadgeStars(svg) {
  const values = [...svg.matchAll(/<text[^>]*>([\d,.]+)<\/text>/g)]
    .map(match => Number(match[1].replace(/,/g, '')))
    .filter(Number.isFinite)
  return values.at(-1) ?? null
}

async function fetchStars() {
  const repositoryResponse = await fetch(REPOSITORY_URL, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Travelink GitHub Star Counter',
    },
  })
  if (repositoryResponse.ok) {
    const stars = parseRepositoryStars(await repositoryResponse.text())
    if (stars !== null) return stars
  }

  const badgeResponse = await fetch(BADGE_URL, { headers: { Accept: 'image/svg+xml' } })
  if (!badgeResponse.ok) throw new Error(`GitHub badge request failed: ${badgeResponse.status}`)
  const stars = parseBadgeStars(await badgeResponse.text())
  if (stars === null) throw new Error('GitHub Star count was not found')
  return stars
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (cached.stars !== null && cached.expiresAt > Date.now()) {
    return res.status(200).json({ stars: cached.stars })
  }

  try {
    const stars = await fetchStars()
    cached = { stars, expiresAt: Date.now() + 15 * 60 * 1000 }
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400')
    return res.status(200).json({ stars })
  } catch (error) {
    if (cached.stars !== null) return res.status(200).json({ stars: cached.stars, stale: true })
    return res.status(502).json({ error: error.message })
  }
}
