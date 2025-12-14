import { GoogleGenAI } from "@google/genai";

// Initialize the API client
// Note: In a real production app, ensure the key is proxied or handled securely.
// The prompt instructions explicitly state to use process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAIAsset = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      // Config for standard image generation as per guidelines
      // We do not set responseMimeType for image models unless using Imagen specifically with generateImages
    });

    let base64Data = '';
    
    // Iterate through parts to find the image data
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          base64Data = part.inlineData.data;
          break;
        }
      }
    }

    if (!base64Data) {
      throw new Error("No image data found in response");
    }

    return `data:image/png;base64,${base64Data}`;
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
};
