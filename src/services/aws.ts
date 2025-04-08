import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION as string,
});

type BedrockExecutationResponseType = 'JSON' | 'TEXT';

interface BedrockExecutationProps {
  prompt: string;
  responseType: BedrockExecutationResponseType;
  maxTokens?: number;
  modelId?: string;
  temperature?: number;
}

export async function bedrockExecutation<T = any>({
  prompt,
  responseType = 'JSON',
  maxTokens = 48000,
  modelId = process.env.AWS_BEDROCK_ANTROPIC_CLAUDE_MODEL,
  temperature = 0,
}: BedrockExecutationProps) {
  const command = new InvokeModelCommand({
    body: JSON.stringify({
      max_tokens: maxTokens,
      anthropic_version: "bedrock-2023-05-31",
      temperature,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    }),
    contentType: "application/json",
    accept: "application/json",
    modelId,
  });

  let data, completions;

  try {
    data = await bedrockClient.send(command);

    completions = JSON.parse(new TextDecoder().decode(data.body));

    let text: T = completions.content?.[0].text;

    if (responseType === 'JSON') {
      // Tenta parsear o texto direto
      try {
        text = JSON.parse(text as string);
      } catch (error) {
        // Caso venha com { "text": "{...}" }
        const cleanedText = (text as string).trim();

        if (
          cleanedText.startsWith('{') &&
          cleanedText.endsWith('}')
        ) {
          try {
            // Segunda tentativa de parse
            text = JSON.parse(cleanedText);
          } catch (error) {
            console.warn('Não foi possível parsear o JSON retornado pela IA');

            return {
              data: null,
              error: {
                type: 'BedrockExecutionError',
                message: 'Ocorreu um erro ao executar o AWS bedrock.',
              }
            };
          }
        }
      }
    }

    return {
      data: text,
      error: null
    };
  } catch (error: any) {
    console.log("Error ao executar o AWS bedrock", {
      error,
    });

    return {
      data: null,
      error: {
        type: 'BedrockExecutionError',
        message: 'Ocorreu um erro ao executar o AWS bedrock.',
        error: {
          message: error.message
        },
      }
    };
  }
}