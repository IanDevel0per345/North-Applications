/**
 * Serviço para preparar e fazer deploy de bots com config.json personalizado
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import unzipper from "unzipper";
import JSZip from "jszip";
import FormData from "form-data";
import fetch from "node-fetch";
import BotConfig from "../database/models/BotConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Gera um botToken de 5 dígitos
 */
function generateBotToken() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * Cria/atualiza BotConfig no MongoDB
 */
async function ensureBotConfig(botID, ownerDiscordId, planVersion = null) {
  let config = await BotConfig.findOne({ botID });

  if (!config) {
    config = new BotConfig({
      botID,
      botToken: generateBotToken(),
      apiURL: process.env.BACKEND_URL || "http://localhost",
      version: planVersion || "BETA", // Usa a versão do plano se fornecida
      syncEmojis: true,
      saveConfig: true,
      startOnBackup: true,
      bot: {
        token: "",
        owner: ownerDiscordId || "",
        id: "",
        perms: ownerDiscordId ? [ownerDiscordId] : [],
        server: "",
      },
    });
    await config.save();

    console.log(`[BOT DEPLOYMENT] BotConfig criado com versão: ${config.version}`);
    return config;
  }

  // Garante que o owner esteja definido e presente nas permissões
  let changed = false;
  if (ownerDiscordId && config.bot?.owner !== ownerDiscordId) {
    config.bot.owner = ownerDiscordId;
    changed = true;
  }
  const currentPerms = Array.isArray(config.bot?.perms) ? config.bot.perms.slice() : [];
  const targetOwner = ownerDiscordId || config.bot?.owner || "";
  if (targetOwner && !currentPerms.includes(targetOwner)) {
    config.bot.perms = Array.from(new Set([...currentPerms, targetOwner]));
    changed = true;
  } else if (Array.isArray(config.bot?.perms)) {
    // Normaliza array (remove falsy e duplica)
    const normalized = Array.from(new Set(currentPerms.filter(Boolean)));
    if (normalized.length !== currentPerms.length) {
      config.bot.perms = normalized;
      changed = true;
    }
  }
  // Mantém a versão configurada mais recente se fornecida
  if (planVersion && config.version !== planVersion) {
    config.version = planVersion;
    changed = true;
  }
  if (changed) {
    await config.save();
  }
  return config;
}

/**
 * Converte BotConfig para o formato do config.json
 */
function toConfigJson(doc) {
  return {
    botID: doc.botID,
    botToken: doc.botToken,
    apiURL: doc.apiURL,
    version: doc.version ?? "BETA",
    syncEmojis: !!doc.syncEmojis,
    saveConfig: !!doc.saveConfig,
    startOnBackup: !!doc.startOnBackup,
    bot: {
      token: doc.bot?.token || "",
      owner: doc.bot?.owner || "",
      id: doc.bot?.id || "",
      perms: Array.isArray(doc.bot?.perms) ? doc.bot.perms : [],
      server: doc.bot?.server || "",
    },
  };
}

/**
 * Descompacta ZIP, injeta config.json e recompacta
 * @param {string} sourceZipPath - Caminho do ZIP original do plano
 * @param {object} configData - Dados do config.json a serem injetados
 * @returns {Promise<string>} - Caminho do novo ZIP com config.json
 */
async function injectConfigIntoZip(sourceZipPath, configData) {
  const timestamp = Date.now();
  const tempExtractDir = path.join(__dirname, "../temp", `extract-${timestamp}`);
  const tempZipDir = path.join(__dirname, "../temp", `output-${timestamp}`);
  const outputZipPath = path.join(tempZipDir, "bot-with-config.zip");

  try {
    // Cria diretórios temporários
    fs.mkdirSync(tempExtractDir, { recursive: true });
    fs.mkdirSync(tempZipDir, { recursive: true });

    console.log(`[injectConfigIntoZip] Descompactando ZIP original de: ${sourceZipPath}`);
    console.log(`[injectConfigIntoZip] Para diretório temporário: ${tempExtractDir}`);

    // Descompacta ZIP original usando unzipper com tratamento melhorado
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(sourceZipPath)
        .pipe(unzipper.Extract({
          path: tempExtractDir,
          // Aumenta limite para arquivos grandes
          concurrency: 5
        }));

      stream.on('close', resolve);
      stream.on('error', reject);

      // Timeout de 5 minutos para ZIPs muito grandes
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Timeout ao descompactar ZIP (5 min)'));
      }, 5 * 60 * 1000);

      stream.on('close', () => clearTimeout(timeout));
    });

    // Aguarda um momento para garantir que todos os arquivos foram escritos
    await new Promise(resolve => setTimeout(resolve, 500));

    // Lista arquivos extraídos para debug
    const extractedFiles = getAllFilesAsync(tempExtractDir);
    console.log(`[injectConfigIntoZip] Arquivos extraídos: ${extractedFiles.length}`);

    if (extractedFiles.length === 0) {
      throw new Error("Nenhum arquivo extraído do ZIP - ZIP pode estar vazio ou corrompido");
    }

    // Cria config.json
    const configPath = path.join(tempExtractDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
    console.log(`[injectConfigIntoZip] config.json criado`);

    // Cria ou sobrescreve requirements.txt com as dependências necessárias
    const requirementsPath = path.join(tempExtractDir, "requirements.txt");
    const requirementsContent = `disnake
py-discord-html-transcripts
pymongo
dnspython
requests
pytz
aiohttp
matplotlib
psutil
PyNaCl
Pillow
python-socketio[asyncio_client]`;
    fs.writeFileSync(requirementsPath, requirementsContent, "utf-8");
    console.log(`[injectConfigIntoZip] requirements.txt criado/atualizado com ${requirementsContent.split('\n').length} dependências`);

    const discloudConfigPath = path.join(tempExtractDir, "discloud.config");
    const discloudConfigContent = `TYPE=bot
MAIN=bot.py
NAME=${(configData.bot?.owner || "")} - ${configData.botID}
RAM=200
AUTORESTART=true
APT=tools, 
VERSION=latest
START=python bot.py
VLAN=true`;
    fs.writeFileSync(discloudConfigPath, discloudConfigContent, "utf-8");
    console.log(`[injectConfigIntoZip] discloud.config criado`);

    // Recompacta usando JSZip com otimizações para muitos arquivos
    console.log(`[injectConfigIntoZip] Iniciando compactação...`);

    const allFiles = getAllFilesAsync(tempExtractDir);
    console.log(`[injectConfigIntoZip] Total de arquivos a compactar: ${allFiles.length}`);

    // Para ZIPs muito grandes, usa streaming
    if (allFiles.length > 500) {
      console.log(`[injectConfigIntoZip] Usando método de streaming para ${allFiles.length} arquivos`);
      await createZipWithStreaming(tempExtractDir, outputZipPath, allFiles);
    } else {
      // Método padrão para ZIPs menores
      const zip = new JSZip();

      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i];
        const relativePath = path.relative(tempExtractDir, file).replace(/\\/g, '/');

        try {
          const content = fs.readFileSync(file);
          zip.file(relativePath, content, { binary: true });
        } catch (readErr) {
          console.warn(`[injectConfigIntoZip] Aviso: não foi possível ler ${relativePath}: ${readErr.message}`);
        }

        // Log de progresso a cada 100 arquivos
        if ((i + 1) % 100 === 0) {
          console.log(`[injectConfigIntoZip] Progresso: ${i + 1}/${allFiles.length} arquivos adicionados`);
        }
      }

      // Gera o ZIP com compressão otimizada
      console.log(`[injectConfigIntoZip] Gerando ZIP final...`);
      const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }, // Nível 6 é um bom balanço entre velocidade e compressão
        streamFiles: true // Usa streaming para reduzir uso de memória
      });

      fs.writeFileSync(outputZipPath, zipBuffer);
      console.log(`[injectConfigIntoZip] ZIP criado: ${outputZipPath} (${zipBuffer.length} bytes)`);
    }

    // Valida que o ZIP foi criado corretamente
    if (!fs.existsSync(outputZipPath)) {
      throw new Error("Falha ao criar arquivo ZIP");
    }

    const stats = fs.statSync(outputZipPath);
    if (stats.size < 1000) {
      throw new Error(`ZIP criado está muito pequeno: ${stats.size} bytes`);
    }

    console.log(`[injectConfigIntoZip] ZIP final: ${stats.size} bytes, ${allFiles.length} arquivos`);

    // Verifica arquivos essenciais no ZIP usando verificação simples
    const zipContent = await JSZip.loadAsync(fs.readFileSync(outputZipPath));
    const zipFiles = Object.keys(zipContent.files);

    const requiredFiles = ["config.json", "requirements.txt", "discloud.config"];
    for (const required of requiredFiles) {
      if (!zipFiles.includes(required)) {
        throw new Error(`${required} não encontrado no ZIP final`);
      }
    }

    console.log(`[injectConfigIntoZip] Validação concluída - ${zipFiles.length} arquivos no ZIP`);

    // Limpa diretório de extração
    try {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[injectConfigIntoZip] Aviso ao limpar diretório de extração:`, cleanupErr.message);
    }

    return outputZipPath;
  } catch (err) {
    console.error("[injectConfigIntoZip] Erro:", err);

    // Tenta limpar em caso de erro
    try {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
      if (fs.existsSync(tempZipDir)) {
        fs.rmSync(tempZipDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn(`[injectConfigIntoZip] Erro ao limpar após falha:`, cleanupErr.message);
    }

    throw err;
  }
}

/**
 * Cria ZIP usando streaming para arquivos muito grandes
 */
async function createZipWithStreaming(sourceDir, outputPath, files) {
  const zip = new JSZip();

  // Processa em lotes para evitar problemas de memória
  const BATCH_SIZE = 100;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    for (const file of batch) {
      const relativePath = path.relative(sourceDir, file).replace(/\\/g, '/');

      try {
        // Para arquivos grandes, usa lazy loading
        const stats = fs.statSync(file);

        if (stats.size > 10 * 1024 * 1024) { // > 10MB
          // Arquivos muito grandes - usa referência lazy
          zip.file(relativePath, fs.createReadStream(file), { binary: true });
        } else {
          const content = fs.readFileSync(file);
          zip.file(relativePath, content, { binary: true });
        }
      } catch (readErr) {
        console.warn(`[createZipWithStreaming] Erro ao ler ${relativePath}: ${readErr.message}`);
      }
    }

    console.log(`[createZipWithStreaming] Processados ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} arquivos`);
  }

  // Gera ZIP com streaming
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    streamFiles: true
  });

  fs.writeFileSync(outputPath, zipBuffer);
  console.log(`[createZipWithStreaming] ZIP criado: ${outputPath} (${zipBuffer.length} bytes)`);
}

/**
 * Obtém todos os arquivos de um diretório recursivamente (versão melhorada)
 * Usa stack em vez de recursão para evitar stack overflow em pastas grandes
 */
function getAllFilesAsync(dirPath) {
  const arrayOfFiles = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();

    let files;
    try {
      files = fs.readdirSync(currentDir);
    } catch (err) {
      console.warn(`[getAllFilesAsync] Não foi possível ler diretório ${currentDir}: ${err.message}`);
      continue;
    }

    for (const file of files) {
      const fullPath = path.join(currentDir, file);

      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          stack.push(fullPath);
        } else if (stat.isFile()) {
          arrayOfFiles.push(fullPath);
        }
      } catch (err) {
        console.warn(`[getAllFilesAsync] Não foi possível processar ${fullPath}: ${err.message}`);
      }
    }
  }

  return arrayOfFiles;
}

/**
 * Limpa diretório temporário
 */
function cleanupTempDir(tempZipPath) {
  try {
    const tempDir = path.dirname(tempZipPath);
    // Verifica se é um diretório temporário válido
    if (tempDir.includes("/temp/output-") || tempDir.includes("\\temp\\output-")) {
      console.log(`[cleanupTempDir] Limpando diretório temporário: ${tempDir}`);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn("[cleanupTempDir] Erro ao limpar:", err.message);
  }
}

/**
 * Faz deploy do bot na Discloud com config.json personalizado
 * @param {string} sourceZipPath - ZIP original do plano
 * @param {string} botID - ID único do bot (ex: applicationId)
 * @param {string} ownerDiscordId - Discord ID do dono
 * @param {string} planVersion - Versão do plano (opcional)
 * @returns {Promise<object>} - Resposta da Discloud
 */
export async function deployBotWithConfig(sourceZipPath, botID, ownerDiscordId, planVersion = null) {
  let tempZipPath = null;

  try {
    // Valida que o ZIP de origem existe
    if (!sourceZipPath || !fs.existsSync(sourceZipPath)) {
      throw new Error(`Arquivo ZIP não encontrado: ${sourceZipPath}`);
    }

    const sourceStats = fs.statSync(sourceZipPath);
    if (!sourceStats.isFile() || sourceStats.size < 1000) {
      throw new Error(`Arquivo ZIP inválido ou muito pequeno: ${sourceZipPath}`);
    }

    console.log(`[deployBotWithConfig] ZIP de origem validado: ${sourceZipPath} (${sourceStats.size} bytes)`);

    // 1. Garante que BotConfig existe no MongoDB
    const botConfig = await ensureBotConfig(botID, ownerDiscordId, planVersion);
    const configData = toConfigJson(botConfig);

    console.log(`[deployBotWithConfig] Preparando deploy para botID: ${botID}`);

    // 2. Injeta config.json no ZIP
    tempZipPath = await injectConfigIntoZip(sourceZipPath, configData);

    console.log(`[deployBotWithConfig] Config.json injetado. ZIP preparado: ${tempZipPath}`);

    // 3. Valida arquivo
    const stats = fs.statSync(tempZipPath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("ZIP gerado está vazio ou inválido");
    }

    // 4. Valida token
    if (!process.env.DISCLOUD_TOKEN) {
      throw new Error("DISCLOUD_TOKEN não configurado");
    }

    // 5. Envia para Discloud usando API direta
    console.log(`[deployBotWithConfig] Enviando para Discloud...`);
    const formData = new FormData();
    const fileStream = fs.createReadStream(tempZipPath);
    formData.append("file", fileStream);

    const apiResponse = await fetch("https://api.discloud.app/v2/upload", {
      method: "POST",
      headers: {
        "api-token": process.env.DISCLOUD_TOKEN,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const response = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(response.message || `Erro HTTP ${apiResponse.status}`);
    }

    // Extrai o appId da resposta da Discloud
    const appId = response?.app?.id || response?.appId || response?.id || null;

    console.log(`[deployBotWithConfig] Deploy concluído com sucesso!`);
    console.log(`[deployBotWithConfig] AppId da Discloud: ${appId}`);
    console.log(`[deployBotWithConfig] Resposta completa:`, JSON.stringify(response, null, 2));

    const result = {
      success: true,
      botID,
      botToken: botConfig.botToken,
      appId, // Adiciona o appId diretamente no retorno
      discloudResponse: response,
    };

    console.log(`[deployBotWithConfig] Retornando resultado com appId: ${result.appId}`);
    return result;
  } catch (err) {
    console.error(`[deployBotWithConfig] Erro no deploy:`, err);
    throw err;
  } finally {
    // 6. Limpa arquivo temporário
    if (tempZipPath) {
      cleanupTempDir(tempZipPath);
    }
  }
}

/**
 * Atualiza bot existente na Discloud (commit)
 * @param {string} appId - ID da aplicação na Discloud
 * @param {string} sourceZipPath - ZIP original do plano
 * @param {string} botID - ID único do bot
 * @returns {Promise<object>}
 */
export async function updateBotWithConfig(appId, sourceZipPath, botID) {
  let tempZipPath = null;

  try {
    // 1. Busca BotConfig existente
    const botConfig = await BotConfig.findOne({ botID });
    if (!botConfig) {
      throw new Error(`BotConfig não encontrado para botID: ${botID}`);
    }

    const configData = toConfigJson(botConfig);

    console.log(`[updateBotWithConfig] Preparando atualização para appId: ${appId}`);

    // 2. Injeta config.json no ZIP
    tempZipPath = await injectConfigIntoZip(sourceZipPath, configData);

    // 3. Valida arquivo
    const stats = fs.statSync(tempZipPath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("ZIP gerado está vazio ou inválido");
    }

    // 4. Valida token
    if (!process.env.DISCLOUD_TOKEN) {
      throw new Error("DISCLOUD_TOKEN não configurado");
    }

    // 5. Atualiza na Discloud (commit) usando API direta
    console.log(`[updateBotWithConfig] Enviando atualização para Discloud...`);
    const formData = new FormData();
    const fileStream = fs.createReadStream(tempZipPath);
    formData.append("file", fileStream);

    const apiResponse = await fetch(`https://api.discloud.app/v2/app/${appId}/commit`, {
      method: "PUT",
      headers: {
        "api-token": process.env.DISCLOUD_TOKEN,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const response = await apiResponse.json();

    if (!apiResponse.ok && apiResponse.status !== 404) {
      throw new Error(response.message || `Erro HTTP ${apiResponse.status}`);
    }

    console.log(`[updateBotWithConfig] Atualização concluída com sucesso!`);
    console.log(`[updateBotWithConfig] Resposta da Discloud:`, JSON.stringify(response, null, 2));

    return {
      success: true,
      botID,
      appId,
      discloudResponse: response,
    };
  } catch (err) {
    console.error(`[updateBotWithConfig] Erro na atualização:`, err);
    throw err;
  } finally {
    // 6. Limpa arquivo temporário
    if (tempZipPath) {
      cleanupTempDir(tempZipPath);
    }
  }
}

export default {
  deployBotWithConfig,
  updateBotWithConfig,
};
