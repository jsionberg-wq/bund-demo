const https = require("https");

const SYSTEM = [
  "You are BUND - an intelligent AI shopping assistant for DEPO hardware stores in the Baltics.",
  "You speak 5 languages: Estonian (eesti), Latvian (latviesu), Lithuanian (lietuviu), Russian (russkiy), English.",
  "CRITICAL RULE: Always respond in the SAME language the user writes in.",
  "Your job: analyze the customer project, pick the most relevant products, ask a smart follow-up.",
  "",
  "For catalog-select tasks return ONLY this JSON (no extra text, no markdown):",
  '{"selected_ids":[1,2,3],"follow_up":"Your question here"}',
  "",
  "Rules:",
  "- Select 4-6 items that best fit the request",
  "- Never return empty selected_ids - always pick best matches from candidates",
  "- follow_up must be in the same language as the user request",
  "- follow_up should help narrow down what they need (style, budget, size, etc)",
  "- Be helpful and warm, like a knowledgeable store assistant"
].join("\n");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;
  const mode = body?.mode || "catalog-select";
  let userContent = "";

  if (mode === "catalog-select") {
    userContent = `Customer request: "${body.userMessage}"\nAvailable products: ${JSON.stringify(body.candidatePool || [])}\nReturn JSON only: {"selected_ids":[numbers],"follow_up":"string"}`;
  } else if (mode === "catalog-select-more") {
    userContent = `Customer request: "${body.userMessage}"\nAlready shown: ${(body.existingNames || []).join(", ")}\nAvailable products: ${JSON.stringify(body.candidatePool || [])}\nReturn JSON with 4-6 NEW different ids: {"selected_ids":[numbers],"follow_up":"string"}`;
  } else {
    const msgs = body.messages || [{ role: "user", content: body.userMessage || "" }];
    userContent = msgs[msgs.length - 1]?.content || body.userMessage || "";
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: SYSTEM + "\n\n" + userContent }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 500, responseMimeType: "application/json" }
  });

  const options = {
    hostname: "generativelanguage.googleapis.com",
    path: "/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey,
    method: "POST",
    headers: { "Content-Type": "application/json" }
  };

  return new Promise((resolve) => {
    const apiReq = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => { data += chunk; });
      apiRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (apiRes.statusCode !== 200) {
            res.status(apiRes.statusCode).json({ error: parsed?.error?.message || "API error" });
          } else {
            let text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            text = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
            res.status(200).json({ text });
          }
        } catch { res.status(500).json({ error: "Parse error" }); }
        resolve();
      });
    });
    apiReq.on("error", (e) => { res.status(500).json({ error: e.message }); resolve(); });
    apiReq.write(geminiBody);
    apiReq.end();
  });
};