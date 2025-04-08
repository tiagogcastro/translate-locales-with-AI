import dotenv from "dotenv";
import fs from 'fs';
import path from 'path';
import { bedrockExecutation } from './services/aws';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_LOCALE = 'pt-BR';
const LOCALES_PATH = path.resolve(__dirname, 'locales');;
const chunkSize = 20;
const fullTranslation = false;

const summary: Array<{
  locale: string;
  message: string;
}> = [];

const ENV = {
  AWS_BEDROCK_ANTROPIC_CLAUDE_ACCESS_MODEL: process.env.AWS_BEDROCK_ANTROPIC_CLAUDE_ACCESS_MODEL,
};

type LocaleData = Record<string, string>;

function getLocaleJson(localePath: string): LocaleData {
  const data = fs.readFileSync(localePath, 'utf-8');
  return JSON.parse(data) as LocaleData;
}

function getDiffBetween(json: LocaleData, jsonToCompare: LocaleData): LocaleData {
  const diffJson: LocaleData = {};
  for (const key in jsonToCompare) {
    if (!(key in json)) {
      diffJson[key] = jsonToCompare[key];
    }
  }
  return diffJson;
}

function chunkObject<T extends Record<string, any>>(obj: T, chunkSize: number): T[] {
  const keys = Object.keys(obj);
  const chunks: T[] = [];

  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunkKeys = keys.slice(i, i + chunkSize);
    const chunk = chunkKeys.reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {} as Record<string, any>);
    chunks.push(chunk as T);
  }

  return chunks;
}

async function translateWithRetry(
  chunk: LocaleData,
  localeSubDir: string,
  file: string,
  retries = 3
): Promise<LocaleData> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const prompt = `
      Você é um assistente que traduz apenas os valores de um objeto JSON.

      O retorno JSON deve ser sempre em aspas duplas "".
      Não coloque \" no resultado final.

      ${fullTranslation ? 'Os valores que já estiverem traduzidos, ignore. Traduza apenas os valores do objeto JSON que identificar ser necessário.' : ''}
      
      Traduza os valores do objeto JSON ${JSON.stringify(chunk)} do idioma ${BASE_LOCALE} para o idioma (${localeSubDir}).
      Mantenha as chaves do objeto JSON original.

      Retorne SOMENTE um JSON válido. Não inclua explicações, comentários ou qualquer texto fora do JSON. Apenas o JSON puro.

      Identifique o contexto das traduções do arquivo. Não traduza nomes próprios.

      Responda em formato JSON {"chave": "valor"}.

      Garanta que a resposta seja válida e bem formatada em JSON puro.

      ${attempt > 1 ? 'Houve um erro no parse do JSON, então garanta que a resposta seja válida e bem formatada em JSON puro.' : ''}
    `;

    const result = await bedrockExecutation({
      prompt,
      modelId: ENV.AWS_BEDROCK_ANTROPIC_CLAUDE_ACCESS_MODEL,
      responseType: 'JSON'
    });

    if (result.error) {
      summary.push({
        locale: localeSubDir,
        message: `Tentativa ${attempt} falhou para (${localeSubDir}/${file})`
      });

      if (attempt === retries) {
        return {};
      }
    }

    return JSON.parse(JSON.stringify(result.data)) as LocaleData;
  }

  return {};
}

async function main() {
  const localeDirs = fs.readdirSync(LOCALES_PATH);

  const processedFiles: Set<string> = new Set();

  const baseLocalePath = path.join(LOCALES_PATH, BASE_LOCALE);
  const baseFiles = fs.readdirSync(baseLocalePath);

  const otherLocaleDirs = localeDirs.filter(localeSubDir => localeSubDir !== BASE_LOCALE); // ../locales/en

  await Promise.all(baseFiles.map(async (file) => {
    const baseFilePath = path.join(baseLocalePath, file); // ../locales/en/common.json

    if (processedFiles.has(baseFilePath)) return;

    processedFiles.add(baseFilePath);

    const baseLocaleJson = getLocaleJson(baseFilePath);

    const baseKeys = Object.keys(baseLocaleJson);

    await Promise.all(otherLocaleDirs.map(async (localeSubDir) => {
      const targetLocalePath = path.join(LOCALES_PATH, localeSubDir, file);

      let localeJson: LocaleData = {};

      if (fs.existsSync(targetLocalePath)) {
        localeJson = getLocaleJson(targetLocalePath);
      }

      let diffJson: LocaleData = getDiffBetween(localeJson, baseLocaleJson);

      if (fullTranslation) {
        // Traduz tudo do base
        diffJson = { ...baseLocaleJson };
      }

      if (Object.keys(diffJson).length === 0) {
        summary.push({
          locale: localeSubDir,
          message: `Não há diferença entre (${localeSubDir}/${file}) e (${BASE_LOCALE}/${file}).`
        });
        return;
      } else {
        summary.push({
          locale: localeSubDir,
          message: `${fs.existsSync(targetLocalePath) ? 'Diferença' : 'Necessita de arquivo novo'} de ${Object.keys(diffJson).length} entre (${localeSubDir}/${file}) e (${BASE_LOCALE}/${file}).`
        });
      }

      const chunks = chunkObject(diffJson, chunkSize);

      const processedChunks = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            return translateWithRetry(chunk, localeSubDir, file);
          } catch (error) {
            summary.push({
              locale: localeSubDir,
              message: `Erro ao traduzir com IA após várias tentativas (${localeSubDir}/${file}): ${error}`
            });

            return {};
          }
        })
      );

      const combinedResult = processedChunks.reduce((acc, chunk) => {
        return { ...acc, ...chunk };
      }, { ...localeJson });

      const finalJson: LocaleData = {};
      for (const key of baseKeys) {
        finalJson[key] = combinedResult[key];
      }

      const newKeys = Object.keys(diffJson).filter(key => finalJson[key] !== undefined && finalJson[key] !== localeJson[key]);

      if (newKeys.length > 0) {
        const dirPath = path.dirname(targetLocalePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        try {
          fs.writeFileSync(targetLocalePath, JSON.stringify(finalJson, null, 2), 'utf-8');

          summary.push({
            locale: localeSubDir,
            message: `(${localeSubDir}/${file}) -> Valores adicionados: ${newKeys.length}`
          });
        } catch (err) {
          console.error(`Erro ao salvar o arquivo (${localeSubDir}/${file}):`, err);
          summary.push({
            locale: localeSubDir,
            message: `Erro ao salvar o arquivo (${localeSubDir}/${file}): ${err}`
          });
        }
      } else {
        summary.push({
          locale: localeSubDir,
          message: `(${localeSubDir}/${file}) -> Nenhum valor novo foi adicionado.`
        });
      }
    }));
  }));

  const groupedSummary = summary.reduce<Record<string, string[]>>((acc, { locale, message }) => {
    if (!acc[locale]) {
      acc[locale] = [];
    }

    acc[locale].push(message);

    return acc;
  }, {});

  Object.entries(groupedSummary).forEach(([locale, messages]) => {
    console.log(`\nResumo para ${locale}:`);

    messages.forEach(message => {
      console.log(message);
    });
  });
}

main();