const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    const { targetUrl } = req.query;

    if (!targetUrl) {
        return res.status(400).json({ error: "URL alvo é obrigatória" });
    }

    const proxyUrl = process.env.PROXY_URL; 
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

    try {
        const response = await axios.get(targetUrl, {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 15000,
            headers: {
                // User-Agent de Android costuma "puxar" o m3u8 mais fácil que o de PC
                'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
                'Referer': targetUrl,
                'Accept': '*/*'
            }
        });

        const html = response.data;
        let foundLinks = [];

        // 1. Procura direta por .m3u8
        const regexM3U8 = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
        const matchesM3U8 = html.match(regexM3U8);
        if (matchesM3U8) foundLinks.push(...matchesM3U8);

        // 2. Procura por links de "playlist" (comum em alguns players)
        const regexPlaylist = /(https?:\/\/[^"']+\/playlist[^"']*)/gi;
        const matchesPlaylist = html.match(regexPlaylist);
        if (matchesPlaylist) foundLinks.push(...matchesPlaylist);

        // 3. Procura por links codificados em Base64 (O "pulo do gato")
        const base64Regex = /["'](aHR0c[a-zA-Z0-9+/]+={0,2})["']/g;
        let b64Match;
        while ((b64Match = base64Regex.exec(html)) !== null) {
            try {
                const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
                if (decoded.includes('.m3u8')) foundLinks.push(decoded);
            } catch (e) {}
        }

        if (foundLinks.length > 0) {
            const uniqueLinks = [...new Set(foundLinks)];
            const origin = new URL(targetUrl).origin;

            return res.status(200).json({
                success: true,
                stream_url: uniqueLinks[0],
                all_links: uniqueLinks,
                origin_referer: targetUrl,
                origin_domain: origin
            });
        }

        // Se falhar, retorna um pequeno pedaço do código para você analisar o que o site mandou
        return res.status(404).json({ 
            success: false, 
            message: "Link não encontrado. O site pode estar usando proteção pesada.",
            preview: html.substring(0, 300).replace(/<[^>]*>/g, '') 
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: "Erro de conexão. Verifique se o seu PROXY_URL está correto na Vercel." 
        });
    }
}
