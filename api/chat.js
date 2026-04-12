const https = require("https");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;
  const mode = body?.mode || "catalog-select";
  let userContent = "";

  if (mode === "catalog-select") {
    userContent = "User request (may be in any language - Estonian, Russian, Latvian, Lithuanian, English): \"" + body.userMessage + "\". " +
      "Candidate catalog items: " + JSON.stringify(body.candidatePool || []) + ". " +
      "IMPORTANT: Translate the user request to English internally, then select the most relevant items. " +
      "Return STRICT JSON only: {\"selected_ids\":[numbers],\"follow_up\":\"string\"}. " +
      "Select 4 to 6 item ids. If the request is vague, select the most popular/relevant items.";
  } else if (mode === "catalog-select-more") {
    userContent = "User request: \"" + body.userMessage + "\". Already shown: " + (body.existingNames || []).join(", ") + ". " +
      "Candidates: " + JSON.stringify(body.candidatePool || []) + ". " +
      "Return STRICT JSON only: {\"selected_ids\":[numbers],\"follow_up\":\"string\"}. " +
      "Choose 4 to 6 DIFFERENT item ids not already shown.";
  } else {
    const msgs = body.messages || [{ role: "user", content: body.userMessage || "" }];
    userContent = msgs[msgs.length - 1]?.content || body.userMessage || "";
  }

  const apiKey = "AIzaSyCfVE29ThscdDmxB_2qz81PgRBr9QLjhKY";
  const systemPrompt = body.system || "You are BUND, an AI shopping assistant for DEPO hardware stores in the Baltics. You understand Estonian, Russian, Latvian, Lithuanian and English. Always return valid JSON.";
  
  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: systemPrompt + "\n\n" + userContent }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
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