const https = require("https");

const SYSTEM_PROMPT = `You are BUND, an AI shopping assistant for DEPO hardware stores in the Baltics.
You help customers find the right products for their home improvement projects.
You understand Estonian, Russian, Latvian, Lithuanian and English - respond in the same language the user writes in.

When given a catalog-select task:
- Carefully analyze the user's project/request
- Select the MOST RELEVANT items from the candidate pool
- Always return STRICT JSON with no extra text: {"selected_ids":[numbers],"follow_up":"friendly question in user's language"}
- The follow_up should ask a helpful follow-up question to refine recommendations
- Select 4-6 items that best match the request
- If user writes in Russian, follow_up must be in Russian
- If user writes in Estonian, follow_up must be in Estonian
- Never return empty selected_ids - always pick the best matches`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;
  const mode = body?.mode || "catalog-select";
  let userContent = "";

  if (mode === "catalog-select") {
    userContent = `User request: "${body.userMessage}"
Candidate products: ${JSON.stringify(body.candidatePool || [])}
Return ONLY valid JSON: {"selected_ids":[numbers],"follow_up":"string"}`;
  } else if (mode === "catalog-select-more") {
    userContent = `User request: "${body.userMessage}"
Already shown: ${(body.existingNames || []).join(", ")}
Candidate products: ${JSON.stringify(body.candidatePool || [])}
Return ONLY valid JSON with 4-6 DIFFERENT ids: {"selected_ids":[numbers],"follow_up":"string"}`;
  } else {
    const msgs = body.messages || [{ role: "user", content: body.userMessage || "" }];
    userContent = msgs[msgs.length - 1]?.content || body.userMessage || "";
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const fullPrompt = SYSTEM_PROMPT + "\n\n" + userContent;

  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
  });

  const path = "/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
  const options = {
    hostname: "generativelanguage.googleapis.com",
    path, method: "POST",
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