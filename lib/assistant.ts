export async function fetchAssistantContext(userInput: string): Promise<string> {
  console.log("Assistant API: Fetching context for input:", userInput); // Log the input

  const assistantId = process.env.OPENAI_ASSISTANT_ID;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!assistantId || !apiKey) {
    console.error("Assistant API: Missing credentials."); // Log missing credentials
    throw new Error("Assistant API credentials are missing.");
  }

  const response = await fetch(
    `https://api.openai.com/v1/assistants/${assistantId}/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: userInput,
        context: [], // Optional: Add previous conversation history if needed
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Assistant API Error:", errorText); // Log error details
    throw new Error("Failed to fetch context from Assistant API.");
  }

  const data = await response.json();
  console.log("Assistant API: Received response:", data); // Log the response
  return data.text || ''; // Adjust based on response structure
}
