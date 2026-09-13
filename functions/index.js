const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

const PROMPT = `Du kigger på et foto af et bilhjul (dæk + fælg), som en privatperson vil sælge på en dansk markedsplads for brugte hjulsæt.
Vurder det du faktisk kan se på billedet, og vær forsigtig med at gætte på ting du ikke tydeligt kan se — især mønsterdybde, som er svær at vurdere præcist fra et foto uden målepind.
Svar KUN med et JSON-objekt, ingen forklaring udenfor, ingen markdown-kodeblok. Brug præcis disse felter:
{
  "dimension": string eller null,
  "brand": string eller null,
  "dot_code": string eller null,
  "condition_grade": "A" | "B" | "C",
  "visible_damage": kort dansk sætning,
  "tread_note": kort forsigtig dansk sætning med forbehold,
  "price_low": tal i DKK for hele sættet,
  "price_high": tal i DKK for hele sættet,
  "confidence": "lav" | "mellem" | "høj",
  "notes": kort dansk sætning med forbehold til sælger
}`;

// Deploy with: firebase deploy --only functions:analyzeWheel
// Requires: firebase functions:secrets:set ANTHROPIC_API_KEY
exports.analyzeWheel = onRequest(
  { secrets: [anthropicKey], cors: true, region: "europe-west1", memory: "256MiB" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { base64, mediaType } = req.body || {};
    if (!base64 || !mediaType) {
      res.status(400).json({ error: "Mangler billeddata (base64/mediaType)" });
      return;
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
         model: "claude-sonnet-5",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT }
            ]
          }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic API error:", response.status, errText);
        res.status(502).json({ error: "AI-tjenesten svarede ikke korrekt" });
        return;
      }

      const data = await response.json();
      const textBlocks = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const clean = textBlocks.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      res.json(parsed);
    } catch (err) {
      console.error("analyzeWheel error:", err);
      res.status(500).json({ error: "Kunne ikke analysere billedet" });
    }
  }
);
