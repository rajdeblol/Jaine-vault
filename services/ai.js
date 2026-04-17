const axios = require('axios');

function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function resolveEndpoint() {
  return {
    provider: 'openai',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    url: 'https://api.openai.com/v1/chat/completions',
    key: process.env.OPENAI_API_KEY
  };
}

async function generateStrategy({ context, userRequest }) {
  if (!isAiConfigured()) {
    return null;
  }

  const endpoint = resolveEndpoint();
  const systemPrompt = process.env.SYSTEM_PROMPT || `You are the "Grandmaster of Yield," an eccentric, theatrical, and exceptionally brilliant DeFi strategist. You don't just give financial advice; you narrate epic sagas of wealth creation.
Your goal is to provide a uniquely stylized DeFi strategy framework based on the user's risk profile and the live market data provided.
You MUST invent a cool, dramatic name for the strategy (e.g., "The Obsidian Phalanx", "The Whispering Viper Matrix") and present your analysis with flair and mystique, while still grounding your final recommendations in the concrete numbers provided in the context.

Respond ONLY with a valid JSON object matching this structure (no markdown code blocks, just raw JSON):
{
  "summary": "Start with the strategy name followed by a captivating, dramatic paragraph summarizing the approach.",
  "actions": [
    "A list of highly actionable, concrete steps to take in the markets..."
  ],
  "risks": [
    "Theatrical warnings about potential downfalls (impermanent loss, low TVL)..."
  ],
  "opportunities": [
    "Highlighting the most lucrative pools and how to exploit them..."
  ],
  "confidence": 0.0 to 1.0 representing your mystical certainty
}`;

  const prompt = `Context: ${JSON.stringify(context, null, 2)}\nUser Request: ${userRequest}\nAnalyze the provided market summary, wallet snapshot, and risk profile. Embody the Grandmaster of Yield and deliver your JSON strategy!`;

  try {
    const response = await axios.post(
      endpoint.url,
      {
        model: endpoint.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${endpoint.key}`
        }
      }
    );

    const resultText = response.data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(resultText);
      return parsed;
    } catch (parseError) {
      // Fallback if the AI messes up the exact JSON format somehow
      return {
        summary: "The Grandmaster has spoken, but alas, the mystical runes were garbled. Here is a deciphered attempt.",
        actions: ["Review the market directly, as the vision was clouded."],
        risks: ["The AI response could not be parsed as pure JSON."],
        opportunities: [],
        confidence: 0.1
      };
    }
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const err = new Error('Rate limit exceeded');
      err.response = { status: 429 };
      throw err;
    }
    throw error;
  }
}

module.exports = {
  isAiConfigured,
  resolveEndpoint,
  generateStrategy
};
