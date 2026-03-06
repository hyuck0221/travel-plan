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
    // 1. 단축 URL 생성 (실패해도 원본 URL로 fallback)
    let qrTargetUrl = url
    try {
      const shortenRes = await fetch('https://apisis.dev/api/url/short', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ url }),
      })
      if (shortenRes.ok) {
        const shortenData = await shortenRes.json()
        qrTargetUrl = shortenData?.payload?.url || url
      }
    } catch { /* fallback to original url */ }

    // 2. 단축 URL로 QR 생성
    const response = await fetch('https://apisis.dev/api/url/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ url: qrTargetUrl, x: 300, y: 300 }),
    })

    if (!response.ok) {
      throw new Error(`APIsis error: ${response.status}`)
    }

    const data = await response.json()
    return res.status(200).json({ image: data?.payload?.imageBase64 })
  } catch (err) {
    console.error('qr error:', err)
    return res.status(500).json({ error: err.message })
  }
}
