import fs from "fs";
import path from "path";
import { logger } from "../../config/logger.js";

/**
 * Knowledge base del asistente de soporte: playbooks markdown en
 * docs/support-playbooks/. Se cargan del filesystem con cache por mtime
 * (editar un playbook NO requiere redeploy del backend en el mismo host).
 *
 * El agente de soporte SOLO lee esta carpeta; nunca la edita (las mejoras se
 * proponen como sugerencias en el ticket y las aplica un humano).
 */

export interface SupportPlaybook {
  slug: string;
  title: string;
  category: string;
  defaultTier: string;
  risk: string;
  content: string;
}

const CANDIDATE_DIRS = [
  // backend/ como cwd (dev y Railway con repo completo)
  path.resolve(process.cwd(), "../docs/support-playbooks"),
  // por si el proceso corre desde la raíz del repo
  path.resolve(process.cwd(), "docs/support-playbooks"),
];

let cache: { dir: string; loadedAt: number; playbooks: SupportPlaybook[] } | null = null;
const CACHE_TTL_MS = 60_000;

function resolveDir(): string | null {
  for (const dir of CANDIDATE_DIRS) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // seguir probando
    }
  }
  return null;
}

/** Extrae metadatos ligeros del markdown (título, tier, riesgo, categoría). */
function parsePlaybook(slug: string, content: string): SupportPlaybook {
  const titleMatch = content.match(/^#\s*Playbook:\s*(.+)$/m) ?? content.match(/^#\s*(.+)$/m);
  const tierMatch = content.match(/\*\*Tier por defecto\*\*:\s*([^·\n]+)/);
  const riskMatch = content.match(/\*\*Riesgo\*\*:\s*([^\n]+)/);
  const categoryMatch = content.match(/^-\s*\*\*Feature\*\*:\s*(.+)$/m);
  return {
    slug,
    title: titleMatch?.[1]?.trim() ?? slug,
    category: categoryMatch?.[1]?.trim().slice(0, 120) ?? slug,
    defaultTier: tierMatch?.[1]?.trim() ?? "TIER_2",
    risk: riskMatch?.[1]?.trim() ?? "MEDIO",
    content,
  };
}

export function loadPlaybooks(): SupportPlaybook[] {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.playbooks;

  const dir = resolveDir();
  if (!dir) {
    logger.warn("[SUPPORT] carpeta de playbooks no encontrada (docs/support-playbooks)");
    return cache?.playbooks ?? [];
  }

  try {
    const playbooks = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const content = fs.readFileSync(path.join(dir, f), "utf8");
        return parsePlaybook(f.replace(/\.md$/, ""), content);
      });
    cache = { dir, loadedAt: now, playbooks };
    return playbooks;
  } catch (err) {
    logger.warn(`[SUPPORT] error cargando playbooks: ${String(err)}`);
    return cache?.playbooks ?? [];
  }
}

export function getPlaybook(slug: string): SupportPlaybook | null {
  return loadPlaybooks().find((p) => p.slug === slug) ?? null;
}

/** Palabras significativas de un texto (sin tildes, minúsculas, >2 chars). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * Búsqueda por relevancia simple (frecuencia de términos, título pesa x3).
 * Suficiente para el triage; no requiere embeddings ni tokens.
 */
export function searchPlaybooks(query: string, limit = 3): { playbook: SupportPlaybook; score: number }[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  return loadPlaybooks()
    .map((playbook) => {
      const titleTokens = tokenize(playbook.title);
      const contentTokens = tokenize(playbook.content);
      let score = 0;
      for (const term of terms) {
        score += titleTokens.filter((t) => t.includes(term) || term.includes(t)).length * 3;
        score += contentTokens.filter((t) => t === term).length;
      }
      return { playbook, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
