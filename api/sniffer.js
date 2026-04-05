const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    const { targetUrl } = req.query;
    const proxyUrl = process.env.PROXY_URL; 
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Referer': targetUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1'
    };

    try {
        // Busca o HTML da página
        const response = await axios.get(targetUrl, { 
            httpAgent: agent, 
            httpsAgent: agent, 
            headers, 
            timeout: 12000 
        });

        let html = response.data;
        let linksEncontrados = [];

        // 1. Procura padrão M3U8 padrão
        const regM3U8 = /(https?:\/\/[^"']+\.m3u8[^"']*)/gi;
        const m1 = html.match(regM3U8);
        if (m1) linksEncontrados.push(...m1);

        // 2. Procura links dentro de Atob (Base64) que sites de embed usam muito
        const regB64 = /atob\(["']([a-zA-Z0-9+/=]+)["']\)/g;
        let b64Match;
        while ((b64Match = regB64.exec(html)) !== null) {
            try {
                let decoded = Buffer.from(b64Match[1], 'base64').toString();
                if (decoded.includes('http')) linksEncontrados.push(decoded);
            } catch(e){}
        }

        // 3. Procura por variáveis de Player (Ex: source: "...", file: "...")
        const regVars = /(?:file|source|src|url)["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|ts)[^"']*)["']/gi;
        let varMatch;
        while ((varMatch = regVars.exec(html)) !== null) {
            linksEncontrados.push(varMatch[1]);
        }

        if (linksEncontrados.length > 0) {
            // Filtra apenas o que parece ser o link real do vídeo
            const linkReal = linksEncontrados.find(l => l.includes('.m3u8')) || linksEncontrados[0];
            
            return res.status(200).json({
                success: true,
                stream_url: linkReal.startsWith('//') ? 'https:' + linkReal : linkReal,
                origin_referer: targetUrl
            });
        }

        // Se falhar, o site provavelmente exige um navegador real (Puppeteer)
        return res.status(404).json({ 
            success: false, 
            message: "O site usa proteção contra Sniffers simples. O link é gerado apenas no navegador."
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: "O site bloqueou a conexão do servidor Vercel." });
    }
                }
