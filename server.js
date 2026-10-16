
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({ configured: Boolean(API_KEY) });
});

app.post("/api/chat", async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({
      error: "A IA ainda não está configurada. Verifique GEMINI_API_KEY no servidor."
    });
  }

  const {
    messages = [],
    level = "beginner",
    mode = "conversation",
    topic = "everyday"
  } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "Envie uma mensagem para começar."
    });
  }

  const safeMessages = messages
    .slice(-20)
    .filter(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string"
    )
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, 3000)
    }));

  if (!safeMessages.length) {
    return res.status(400).json({
      error: "Não foi encontrada uma mensagem válida."
    });
  }

  const levelText = {
    beginner: "iniciante absoluto; use frases curtas e vocabulário frequente",
    basic: "básico; use frases cotidianas e aumente a complexidade gradualmente",
    intermediate: "intermediário; incentive respostas completas e expressões naturais"
  }[level] || "iniciante absoluto; use frases curtas";

  const modeText = {
    conversation: "priorize uma conversa natural e corrija erros importantes sem interromper demais",
    correction: "corrija rigorosamente gramática, vocabulário e construção; explique em português",
    roleplay: "mantenha uma simulação realista da situação escolhida"
  }[mode] || "priorize conversa natural";

  const topicText = {
    everyday: "apresentações e rotina",
    travel: "viagem, aeroporto e hotel",
    restaurant: "restaurante e pedidos",
    shopping: "compras e lojas",
    work: "trabalho e ambiente profissional",
    free: "conversa livre"
  }[topic] || "conversa livre";

  const instructions = `Você é o English Partner, professor particular de inglês para um falante nativo de português brasileiro.

Nível: ${levelText}.
Modo de aula: ${modeText}.
Tema: ${topicText}.

REGRAS:
1. Converse principalmente em inglês e faça uma pergunta por vez.
2. Se o aluno escrever em português, explique em português como expressar a ideia naturalmente em inglês e depois retome a conversa.
3. Quando corrigir, mostre a frase original, a forma correta e uma explicação simples em português.
4. Diferencie erros gramaticais de frases apenas pouco naturais.
5. Não afirme que avaliou a pronúncia quando recebeu somente uma transcrição de texto.
6. Evite aulas longas e elogios vazios. Incentive o aluno a produzir inglês.
7. Mantenha o contexto das mensagens anteriores.
8. No início de uma conversa, cumprimente o aluno em inglês com uma frase simples e uma pergunta.
9. Responda em texto simples, sem JSON e sem markdown excessivo.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: instructions }]
          },
          contents: safeMessages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(502).json({
        error: data?.error?.message ||
          "Não foi possível obter resposta da IA. Verifique a chave, o modelo e os limites da API."
      });
    }

    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "A IA não retornou texto. Tente novamente."
      });
    }

    res.json({ reply });
  } catch (err) {
    console.error("Falha de conexão:", err);
    res.status(500).json({
      error: "Falha de conexão com o serviço de IA. Tente novamente."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`English Partner ativo na porta ${PORT}`);
});
