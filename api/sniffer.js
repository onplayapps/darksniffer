const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

export default async function handler(req, res) {
    const { targetUrl } = req.query;
    const proxyUrl = process.env.PROXY_URL; 
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': targetUrl,
        'Accept': '*/*'
    };

    try {
        const response = await axios.get(targetUrl, { 
            httpAgent: agent, httpsAgent: agent, headers, timeout: 15000 
        });

        let html = response.data;
        let foundLinks = [];

        // 1. TENTA DESEMPACOTAR JS (P.A.C.K.E.R)
        // Muitos sites PHP usam eval(function(p,a,c,k,e,d)...)
        if (html.includes('eval(function(p,a,c,k,e,d)')) {
            const packerRegex = /eval\(function\(p,a,c,k,e,d\).+?\.split\(['"]\|['"]\)\)\)/g;
            const packed = html.match(packerRegex);
            if (packed) {
                // Aqui simulamos o unpacker básico procurando por strings de URL dentro do bloco
                const urlInPacker = /https?:\/\/[^"']+\.m3u8[^"']*/gi;
                const matches = html.match(urlInPacker);
                if (matches) foundLinks.push(...matches);
            }
        }

        // 2. BUSCA POR HEXADECIMAL OU UNICODE (\x68\x74\x74\x70...)
        // Links em PHP as vezes são injetados assim para enganar sniffers
        const hexRegex = /\\x[0-9a-fA-F]{2}/g;
        if (hexRegex.test(html)) {
            const decodedHex = html.replace(/\\x([0-9a-fA-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16)));
            const m3u8InHex = decodedHex.match(/https?:\/\/[^"']+\.m3u8[^"']*/gi);
            if (m3u8InHex) foundLinks.push(...m3u8InHex);
        }

        // 3. BUSCA PADRÃO CLÁSSICO (Caso a criptografia tenha falhado em esconder tudo)
        const classic = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/gi);
        if (classic) foundLinks.push(...classic);

        if (foundLinks.length > 0) {
            const cleanLink = [...new Set(foundLinks)][0];
            return res.status(200).json({
                success: true,
                stream_url: cleanLink.replace(/\\/g, ''), // Limpa barras invertidas de escape
                origin: targetUrl
            });
        }

        return res.status(404).json({ 
            success: false, 
            message: "Link em PHP com criptografia avançada. Requer processamento de navegador (Puppeteer)."
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: "Erro ao acessar o arquivo PHP." });
    }
}
