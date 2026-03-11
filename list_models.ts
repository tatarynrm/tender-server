
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

async function main() {
    const envContent = fs.readFileSync('d:\\AI_FEATURES\\TenderProjectWithAi\\tender-server-ai\\.env', 'utf8');
    const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

    if (!apiKey) {
        console.error('No API key found');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // @ts-ignore
        const result = await genAI.listModels();
        console.log('Available models:');
        result.models.forEach(m => console.log(m.name));
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

main();
