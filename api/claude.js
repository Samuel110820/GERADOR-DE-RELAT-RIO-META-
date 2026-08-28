// Função de servidor da Vercel. A chave da API fica aqui, nunca no navegador.
// Configure ANTHROPIC_API_KEY em Settings > Environment Variables.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Use POST." } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: { message: "A variável ANTHROPIC_API_KEY não está configurada no projeto da Vercel." },
    });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const dados = await r.json();
    return res.status(r.status).json(dados);
  } catch (e) {
    return res.status(502).json({
      error: { message: "Não consegui falar com a API da Anthropic: " + e.message },
    });
  }
}
