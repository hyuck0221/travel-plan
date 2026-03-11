import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) }
    })
  })
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // .env.local 포함 전체 로드

  return {
    plugins: [
      react(),
      {
        name: 'local-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.method !== 'POST' || !req.url.startsWith('/api/')) return next()

            const body = await readBody(req)
            res.setHeader('Content-Type', 'application/json')

            try {
              if (req.url === '/api/search') {
                const { query } = body
                const r = await fetch(
                  `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`,
                  {
                    headers: {
                      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
                      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
                    },
                  }
                )
                const data = await r.json()
                const items = (data.items || []).map(item => ({
                  title: item.title.replace(/<[^>]+>/g, ''),
                  category: item.category,
                  address: item.address,
                  roadAddress: item.roadAddress,
                  lng: parseInt(item.mapx, 10) / 1e7,
                  lat: parseInt(item.mapy, 10) / 1e7,
                }))
                res.end(JSON.stringify({ items }))

              } else if (req.url === '/api/shorten') {
                const { url } = body
                const r = await fetch('https://apisis.dev/api/url/short/apisis', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-API-Key': env.APISIS_API_KEY },
                  body: JSON.stringify({ url }),
                })
                const data = await r.json()
                res.end(JSON.stringify({ shortUrl: data?.payload?.url || url }))

              } else if (req.url === '/api/qr') {
                const { url } = body
                // 단축 URL 생성 후 QR 생성
                let qrTargetUrl = url
                try {
                  const sr = await fetch('https://apisis.dev/api/url/short/apisis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-API-Key': env.APISIS_API_KEY },
                    body: JSON.stringify({ url }),
                  })
                  if (sr.ok) {
                    const sd = await sr.json()
                    qrTargetUrl = sd?.payload?.url || url
                  }
                } catch { /* fallback */ }
                const r = await fetch('https://apisis.dev/api/url/qr', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-API-Key': env.APISIS_API_KEY },
                  body: JSON.stringify({ url: qrTargetUrl, x: 300, y: 300 }),
                })
                const data = await r.json()
                res.end(JSON.stringify({ image: data?.payload?.imageBase64 }))

              } else {
                next()
              }
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err.message }))
            }
          })
        },
      },
    ],
  }
})
