const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    const { targetUrl } = req.query;
    const proxyUrl = process.env.PROXY_URL; 
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

    const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
        'Accept': '*/*',
        'Referer': 'https://google.com'
    };

    try {
        // PASSO 1: Acessar a página inicial para achar o IFRAME ou o PLAYER
        const step1 = await axios.get(targetUrl, { 
            httpAgent: agent, httpsAgent: agent, 
            headers: commonHeaders, timeout: 10000 
        });
        
        let content = step1.data;
        let finalM3U8 = null;

        // Regex para achar links m3u8 ou links de iframes que podem conter o vídeo
        const m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
        const iframeRegex = /src=["']((https?:)?\/\/embed[^"']+)["']/i;

        let matches = content.match(m3u8Regex);

        if (matches) {
            finalM3U8 = matches[0];
        } else {
            // PASSO 2: Se não achou o m3u8, procura o link do IFRAME do player
            const iframeMatch = content.match(iframeRegex);
            if (iframeMatch) {
                let iframeUrl = iframeMatch[1];
                if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;

                // Entra no link do player para "snifar" lá dentro
                const step2 = await axios.get(iframeUrl, { 
                    httpAgent: agent, httpsAgent: agent, 
                    headers: { ...commonHeaders, 'Referer': targetUrl }, 
                    timeout: 10000 
                });
                
                const matchesStep2 = step2.data.match(m3u8Regex);
                if (matchesStep2) finalM3U8 = matchesStep2[0];
            }
        }

        if (finalM3U8) {
            return res.status(200).json({
                success: true,
                stream_url: finalM3U8,
                origin_referer: targetUrl
            });
        }

        return res.status(404).json({ 
            success: false, 
            message: "Link protegido ou dinâmico. O site exige um navegador real para gerar o token."
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: "Erro ao acessar o site. O Proxy pode estar sendo bloqueado." });
    }
}
