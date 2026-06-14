import OpenAI from "openai";

let client;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return client;
}

export async function callJsonAgent({ name, system, payload, schema }) {
  const openai = getOpenAIClient();

  if (!openai) {
    return null;
  }

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: system
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema
      }
    }
  });

  return JSON.parse(response.output_text);
}
