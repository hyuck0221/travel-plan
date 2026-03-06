export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query } = req.body
  if (!query?.trim()) {
    return res.status(400).json({ error: 'query is required' })
  }

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API credentials not configured' })
  }

  try {
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`
    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    })

    if (!response.ok) {
      throw new Error(`Naver API error: ${response.status}`)
    }

    const data = await response.json()
    // mapx = 경도*10^7 (정수), mapy = 위도*10^7 (정수)
    const items = (data.items || []).map(item => ({
      title: item.title.replace(/<[^>]+>/g, ''), // HTML 태그 제거
      category: item.category,
      address: item.address,
      roadAddress: item.roadAddress,
      lng: parseInt(item.mapx, 10) / 1e7,
      lat: parseInt(item.mapy, 10) / 1e7,
    }))

    return res.status(200).json({ items })
  } catch (err) {
    console.error('search error:', err)
    return res.status(500).json({ error: err.message })
  }
}
