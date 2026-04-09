const https = require("https");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;
  const mode = body?.mode || "catalog-select";

  let userContent = "";
  if (mode === "catalog-select") {
    userContent = `User request: "${body.userMessage}". Candidate catalog items: ${JSON.stringify(body.candidatePool || [])}. Return STRICT JSON only with selected_ids and follow_up. Choose 4 to 6 items only from candidate ids.`;
  } else if (mode === "catalog-select-more") {
    userContent = `User request: "${body.userMessage}". Already shown: ${(body.existingNames || []).join(", ")}. Candidate catalog items: ${JSON.stringify(body.candidatePool || [])}. Return STRICT JSON only with selected_ids and follow_up. Choose 4 to 6 DIFFERENT items only from candidate ids.`;
  } else {
    const msgs = body.messages || [{ role: "user", content: body.userMessage || "" }];
    userContent = msgs[msgs.length - 1]?.content || body.userMessage || "";
  }

  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: body.system + "\n\n" + userContent }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
  });

  const apiKey = process.env.GEMINI_API_KEY;
  const path = `/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${apiKey}`;

  const options = {
    hostname: "generativelanguage.googleapis.com",
    path: path,
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            res.status(200).json({ text });
          }
        } catch {
          res.status(500).json({ error: "Parse error" });
        }
        resolve();
      });
    });
    apiReq.on("error", (e) => { res.status(500).json({ error: e.message }); resolve(); });
    apiReq.write(geminiBody);
    apiReq.end();
  });
};
