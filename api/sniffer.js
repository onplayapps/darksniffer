const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    const { targetUrl } = req.query;

    if (!targetUrl) {
        return res.status(400).json({ error: "URL alvo é obrigatória" });
    }

    // A Vercel pegará isso das Environment Variables que você configurar no painel
    const proxyUrl = process.env.PROXY_URL; 
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

    try {
        const response = await axios.get(targetUrl, {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
                'Referer': targetUrl,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            }
        });

        const html = response.data;
        // Regex para capturar links m3u8
        const m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
        const matches = html.match(m3u8Regex);

        if (matches && matches.length > 0) {
            const uniqueLinks = [...new Set(matches)];
            const origin = new URL(targetUrl).origin;

            return res.status(200).json({
                success: true,
                stream_url: uniqueLinks[0],
                origin_referer: targetUrl,
                origin_domain: origin
            });
        }

        return res.status(404).json({ success: false, message: "Link m3u8 não encontrado no código." });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: "Erro na captura. O site pode estar bloqueando o IP ou o Proxy está offline." 
        });
    }
}
