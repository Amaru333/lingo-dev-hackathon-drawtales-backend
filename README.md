# 🖍️ Storybook Creator - Backend

Welcome to the backend engine of **Storybook Creator**, built for the **Lingo.dev Hackathon**. 

This Node.js/Express service orchestrates an advanced AI pipeline to turn a child's raw drawing into a localized, multi-page storybook.

## 🧠 AI Pipeline Architecture
1. **Vision Analysis (Gemini):** The child's canvas drawing is sent to Gemini 2.5 Flash to extract a detailed textual description of the scene.
2. **Story Generation (Perplexity):** The description is fed into Perplexity Sonar, which acts as a children's book author to generate a structured JSON story (pages, image prompts, characters).
3. **Illustration (AWS Bedrock):** Amazon Nova Canvas generates whimsical, watercolor-style illustrations for each page based on the generated image prompts.
4. **Dynamic Localization (Lingo.dev):** *The secret sauce.* The dynamically generated story and extracted "learning phrases" are passed through the `LingoDotDevEngine`. Lingo.dev structures and localizes the entire JSON payload into Spanish, French, and Hindi concurrently.

## 🏆 Hackathon Execution & Effort
- **Complex Orchestration:** Managing 4 different AI services in a single request lifecycle required robust error handling, prompt engineering, and parallelization.
- **Deep Lingo.dev Integration:** Instead of translating static UI strings, we are using the `lingo.localizeObject` and `lingo.localizeText` SDK methods to handle completely unstructured, dynamic AI payloads on the fly. This proves the utility of Lingo.dev as a core infrastructure component for generative AI apps.
- **Real-world Educational Utility:** By translating the story and extracting a "Word of the Story," the app transforms from a simple toy into a bilingual educational tool.

## ⚙️ Setup

Create a `.env` file with your API keys:
```env
PORT=3001
GEMINI_API_KEY=your_key
PERPLEXITY_API_KEY=your_key
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_key
LINGO_DEV_API_KEY=your_lingo_key
```

```bash
npm install
npm run dev
```
