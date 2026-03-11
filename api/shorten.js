export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'url is required' })
  }

  const apiKey = process.env.APISIS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  try {
    const response = await fetch('https://apisis.dev/api/url/short/apisis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ url }),
    })

    if (!response.ok) {
      throw new Error(`APIsis error: ${response.status}`)
    }

    const data = await response.json()
    // APIsis wraps response in { payload: { url: "..." }, ... }
    const shortUrl = data?.payload?.url || url

    return res.status(200).json({ shortUrl })
  } catch (err) {
    console.error('shorten error:', err)
    return res.status(500).json({ error: err.message })
  }
}
