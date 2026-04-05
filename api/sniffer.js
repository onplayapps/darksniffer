const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    const { targetUrl } = req.query;
    const proxyUrl = process.env.PROXY_URL; 
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Referer': 'https://redecanaistv.ooo/',
        'Origin': 'https://redecanaistv.ooo'
    };

    try {
        // PASSO 1: Pega a página da Rede Canais
        const step1 = await axios.get(targetUrl, { 
            httpAgent: agent, httpsAgent: agent, headers, timeout: 10000 
        });
        
        const html1 = step1.data;
        
        // Procura por Iframes ou links de Players (padrão comum da Rede Canais)
        const playerRegex = /<iframe.*?src=["'](.*?)["']/i;
        const playerMatch = html1.match(playerRegex);

        let finalM3U8 = null;

        // Se achou um Iframe, vamos entrar nele
        if (playerMatch) {
            let playerUrl = playerMatch[1];
            if (playerUrl.startsWith('//')) playerUrl = 'https:' + playerUrl;

            // PASSO 2: Entra no link do player
            const step2 = await axios.get(playerUrl, { 
                httpAgent: agent, httpsAgent: agent, 
                headers: { ...headers, 'Referer': targetUrl }, 
                timeout: 10000 
            });

            const html2 = step2.data;

            // Busca agressiva por m3u8 dentro do player
            const m3u8Regex = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
            const matches = html2.match(m3u8Regex);

            if (matches) {
                finalM3U8 = matches[0].replace(/\\/g, '');
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
            message: "Link não encontrado. O site pode estar usando tokens dinâmicos via JS."
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: "Erro de conexão com o site da Rede Canais." });
    }
            }
