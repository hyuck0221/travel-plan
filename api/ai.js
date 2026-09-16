import { fetchNvidiaUpstream } from '../server/aiProxy.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = await fetchNvidiaUpstream(req.body || {})
    return res.status(200).json(payload)
  } catch (error) {
    const payload = error?.payload && typeof error.payload === 'object'
      ? error.payload
      : { error: { message: error?.message || 'NVIDIA API 요청에 실패했습니다.' } }
    return res.status(error?.statusCode || 500).json(payload)
  }
}
