// Identificador único do app. O nome do produto ainda não está fechado (ver ADR-9 do doc 09),
// então os três lugares onde ele aparece no disco derivam desta constante — trocar o nome
// depois é mudar uma linha aqui.
export const APP_ID = "excalisidian";

// Chave de frontmatter que marca um .md como desenho: `excalisidian: drawing`.
export const CHAVE_FRONTMATTER_DESENHO = APP_ID;

// Pasta de config versionável, na raiz do vault: `.excalisidian/`.
export const PASTA_CONFIG_VAULT = `.${APP_ID}`;

// Extensão do arquivo temporário da escrita atômica: `<arquivo>.excalisidian-tmp`.
// Nome próprio para não colidir com .tmp de outros programas e para o watcher ignorar por extensão.
export const EXT_TMP = `${APP_ID}-tmp`;

// Nome da janela principal do Tauri (bate com o label em tauri.conf.json e capabilities/main.json).
export const JANELA_PRINCIPAL = "main";
