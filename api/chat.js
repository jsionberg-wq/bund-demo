const https = require("https");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;
  const mode = body?.mode || "catalog-select";

  let messages;
  if (mode === "catalog-select") {
    messages = [{
      role: "user",
      content: `User request: "${body.userMessage}". Candidate catalog items: ${JSON.stringify(body.candidatePool || [])}. Return STRICT JSON only with selected_ids and follow_up. Choose 4 to 6 items only from candidate ids.`
    }];
  } else if (mode === "catalog-select-more") {
    messages = [{
      role: "user",
      content: `User request: "${body.userMessage}". Already shown: ${(body.existingNames || []).join(", ")}. Candidate catalog items: ${JSON.stringify(body.candidatePool || [])}. Return STRICT JSON only with selected_ids and follow_up. Choose 4 to 6 DIFFERENT items only from candidate ids.`
    }];
  } else {
    messages = body.messages || [{ role: "user", content: body.userMessage || "" }];
  }

  const payload = JSON.stringify({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 500,
    system: body.system,
    messages,
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
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
            res.status(200).json({ text: parsed.content?.[0]?.text || "" });
          }
        } catch {
          res.status(500).json({ error: "Parse error" });
        }
        resolve();
      });
    });
    apiReq.on("error", (e) => { res.status(500).json({ error: e.message }); resolve(); });
    apiReq.write(payload);
    apiReq.end();
  });
};
