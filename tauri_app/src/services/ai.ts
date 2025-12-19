import { GoogleGenerativeAI } from "@google/generative-ai";
import { LazyStore } from '@tauri-apps/plugin-store';

const store = new LazyStore('settings.json');

export class AiService {
    private static instance: AiService;
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;

    private constructor() { }

    public static getInstance(): AiService {
        if (!AiService.instance) {
            AiService.instance = new AiService();
        }
        return AiService.instance;
    }

    public async initialize() {
        try {
            const settings = await store.get<{ geminiApiKey: string }>('app_config');
            const apiKey = settings?.geminiApiKey;

            if (apiKey) {
                this.genAI = new GoogleGenerativeAI(apiKey);
                this.model = this.genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });
            }
        } catch (e) {
            console.error("Failed to initialize AI service:", e);
        }
    }

    public async generateResponse(prompt: string): Promise<string> {
        if (!this.model) {
            // Try to lazy init if key wasn't available at start
            await this.initialize();
            if (!this.model) {
                return "Error: Gemini API Key not configured. Please go to Settings and add your API Key.";
            }
        }

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (e) {
            console.error("AI Generation Error:", e);
            return `Error generating response: ${e}`;
        }
    }
}

export const aiService = AiService.getInstance();
