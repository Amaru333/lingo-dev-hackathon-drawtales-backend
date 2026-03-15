import Perplexity from '@perplexity-ai/perplexity_ai';
import { GoogleGenAI } from '@google/genai';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Generate a multi-page children's storybook from a drawing.
 *
 * 1. Analyzes the drawing using Gemini vision (free) → detailed description
 * 2. Sends description to Perplexity Sonar → 4-page story
 * 3. Generates illustrations for each page using AWS Bedrock (Nova Canvas)
 */
export async function analyzeAndGenerateStory(imageDataUrl, description = '') {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!perplexityKey) {
    throw new Error('PERPLEXITY_API_KEY is not configured in .env');
  }
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  // --- Step 0: Analyze the drawing with Gemini vision ----------------------
  const drawingDescription = await analyzeDrawing(geminiKey, imageDataUrl, description);
  console.log('[storyService] Drawing analysis:', drawingDescription);

  // --- Step 1: Generate multi-page story via Perplexity Sonar ---------------
  const client = new Perplexity({ apiKey: perplexityKey });
  const storyPrompt = buildStoryPrompt(drawingDescription);

  const response = await client.chat.completions.create({
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content:
          'You are a beloved children\'s book author. You create delightful, whimsical stories for children ages 4-8. You ALWAYS respond with valid JSON only — no extra text, no markdown formatting, no code fences.',
      },
      {
        role: 'user',
        content: storyPrompt,
      },
    ],
  });

  const rawText = response.choices?.[0]?.message?.content || '';
  const storyData = parseStoryResponse(rawText);

  // --- Step 2: Generate illustrations via AWS Bedrock (Nova Canvas) ---------
  const pagesWithIllustrations = await generateIllustrations(storyData.pages);

  return {
    title: storyData.title,
    pages: pagesWithIllustrations,
    characters: storyData.characters,
    objects: storyData.objects,
  };
}

// ---------------------------------------------------------------------------
// Drawing analysis (Gemini Vision — free tier)
// ---------------------------------------------------------------------------

/**
 * Use Gemini 2.5-flash (free) to analyze the child's drawing and produce a
 * detailed text description. This bridges the gap since Perplexity can't
 * process images directly.
 */
async function analyzeDrawing(geminiKey, imageDataUrl, userDescription) {
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // Strip the data-URL prefix to get raw base64
  const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const mimeType = imageDataUrl.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

  const prompt = `You are analyzing a child's drawing. Describe in detail what you see in this drawing — the characters, animals, objects, colors, and scene. Be specific about what the child drew.${userDescription ? ` The child describes it as: "${userDescription}".` : ''} Keep your response to 2-3 sentences.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: prompt },
        ],
      },
    ],
  });

  // Extract the text description
  const text = response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join(' ')
    .trim();

  return text || userDescription || 'a colorful, imaginative picture';
}

// ---------------------------------------------------------------------------
// Illustration generation (AWS Bedrock — Amazon Nova Canvas)
// ---------------------------------------------------------------------------

/**
 * Create a Bedrock client using AWS credentials from .env.
 */
function createBedrockClient() {
  const region = process.env.AWS_REGION || 'us-east-1';

  const clientConfig = { region };

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new BedrockRuntimeClient(clientConfig);
}

/**
 * Generate illustrations for each story page using Amazon Nova Canvas on Bedrock.
 */
async function generateIllustrations(pages) {
  const bedrockClient = createBedrockClient();
  const results = [];

  for (const page of pages) {
    try {
      const prompt = `Cute colorful children's book illustration, soft watercolor style: ${page.imagePrompt}. Whimsical, warm, no text in the image.`;

      const command = new InvokeModelCommand({
        modelId: 'amazon.nova-canvas-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          taskType: 'TEXT_IMAGE',
          textToImageParams: {
            text: prompt,
          },
          imageGenerationConfig: {
            numberOfImages: 1,
            width: 1280,
            height: 720,
            quality: 'standard',
          },
        }),
      });

      const response = await bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      let illustration = null;
      if (responseBody.images?.[0]) {
        illustration = `data:image/png;base64,${responseBody.images[0]}`;
      }

      results.push({ ...page, illustration });

      // Small delay between calls
      if (pages.indexOf(page) < pages.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(`[bedrockService] Image generation failed for page: ${err.message}`);
      results.push({ ...page, illustration: null });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Prompt & Parsing Helpers
// ---------------------------------------------------------------------------

/**
 * Build the story generation prompt.
 * The description parameter now comes from Gemini vision analysis
 * of the actual drawing, so it accurately reflects what the child drew.
 */
function buildStoryPrompt(drawingDescription) {
  return `
A child has drawn a picture. Here's what the drawing shows: "${drawingDescription}"

Create a 4-page children's storybook inspired by this drawing. The story MUST be about the characters and scene described above. Each page should have:
- A short, engaging paragraph (2-3 sentences, age-appropriate for children ages 4-8)
- A description of what the illustration for that page should show

The story should have a clear beginning, middle, and end with a positive message.

Respond ONLY with valid JSON — no markdown, no code fences, no extra text. Use this exact format:
{
  "title": "The Story Title",
  "pages": [
    {
      "text": "The story text for this page...",
      "imagePrompt": "A detailed description of the illustration for this page"
    },
    {
      "text": "Next page text...",
      "imagePrompt": "Description of the next illustration"
    },
    {
      "text": "More story...",
      "imagePrompt": "Description of illustration"
    },
    {
      "text": "The final page with a happy ending...",
      "imagePrompt": "Description of the final illustration"
    }
  ],
  "characters": ["Character 1", "Character 2"],
  "objects": ["Object 1", "Object 2"]
}
`.trim();
}

/**
 * Parse the multi-page story response from Perplexity.
 */
function parseStoryResponse(text) {
  try {
    // Clean up potential markdown code fences the model might return
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);
    return {
      title: parsed.title || 'My Story',
      pages: Array.isArray(parsed.pages)
        ? parsed.pages.map((p) => ({
            text: p.text || '',
            imagePrompt: p.imagePrompt || '',
          }))
        : [],
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
    };
  } catch (err) {
    console.error('[perplexityService] Failed to parse story response:', err.message);
    console.error('[perplexityService] Raw text:', text);
    throw new Error('Failed to parse story from AI response');
  }
}
