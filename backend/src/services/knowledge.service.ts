import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { normalizeText, tokenize } from "../utils/text-normalizer.js";

/**
 * Base de conocimiento simple (sin embeddings): documentos de texto creados o
 * pegados por el usuario. El contenido vive en KnowledgeChunk (modelo que ya
 * existía sin uso); la asignación a un agente y el estado activo viven en
 * KnowledgeDocument.metadata para no requerir migración.
 */

const CHUNK_SIZE = 1500;
const MAX_CONTENT_CHARS = 200_000;

type DocMetadata = { agentId?: string | null; isActive?: boolean };

function metaOf(metadata: unknown): DocMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as DocMetadata;
}

function splitIntoChunks(text: string): string[] {
  const clean = text.trim().slice(0, MAX_CONTENT_CHARS);
  if (!clean) return [];
  const chunks: string[] = [];
  // Cortar por párrafos acumulando hasta CHUNK_SIZE para no partir frases
  let current = "";
  for (const paragraph of clean.split(/\n{2,}/)) {
    if (current.length + paragraph.length + 2 > CHUNK_SIZE && current) {
      chunks.push(current.trim());
      current = "";
    }
    if (paragraph.length > CHUNK_SIZE) {
      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE) {
        chunks.push(paragraph.slice(i, i + CHUNK_SIZE).trim());
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function serializeDocument(doc: {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  chunks?: { content: string }[];
}) {
  const meta = metaOf(doc.metadata);
  const contentText = (doc.chunks ?? []).map((c) => c.content).join("\n\n");
  return {
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    fileType: doc.fileType,
    status: doc.status,
    agentId: meta.agentId ?? null,
    isActive: meta.isActive !== false,
    contentText,
    contentLength: contentText.length,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listDocuments(tenantId: string) {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { tenantId },
    include: { chunks: { select: { content: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return docs.map(serializeDocument);
}

export interface DocumentInput {
  title: string;
  contentText: string;
  agentId?: string | null;
  fileName?: string | null;
  isActive?: boolean;
}

export async function createDocument(
  tenantId: string,
  userId: string | undefined,
  input: DocumentInput
) {
  if (input.agentId) {
    const agent = await prisma.agent.findFirst({ where: { id: input.agentId, tenantId } });
    if (!agent) throw new AppError("El agente indicado no existe", 400);
  }

  const chunks = splitIntoChunks(input.contentText);
  if (chunks.length === 0) {
    throw new AppError("El documento no tiene contenido", 400);
  }

  const doc = await prisma.knowledgeDocument.create({
    data: {
      tenantId,
      uploadedByUserId: userId ?? null,
      title: input.title.trim(),
      fileName: input.fileName?.trim() || "manual.txt",
      fileType: "text/plain",
      fileUrl: "inline", // contenido embebido en chunks, no hay archivo físico
      status: "READY",
      metadata: { agentId: input.agentId ?? null, isActive: input.isActive ?? true },
      chunks: {
        create: chunks.map((content) => ({ tenantId, content })),
      },
    },
    include: { chunks: { select: { content: true } } },
  });

  return serializeDocument(doc);
}

async function getOwnDocument(tenantId: string, id: string) {
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id, tenantId },
    include: { chunks: { select: { content: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!doc) throw new AppError("Documento no encontrado", 404);
  return doc;
}

export async function getDocument(tenantId: string, id: string) {
  return serializeDocument(await getOwnDocument(tenantId, id));
}

export async function updateDocument(
  tenantId: string,
  id: string,
  input: Partial<DocumentInput>
) {
  const existing = await getOwnDocument(tenantId, id);
  const meta = metaOf(existing.metadata);

  if (input.agentId) {
    const agent = await prisma.agent.findFirst({ where: { id: input.agentId, tenantId } });
    if (!agent) throw new AppError("El agente indicado no existe", 400);
  }

  const newMeta: DocMetadata = {
    agentId: input.agentId !== undefined ? input.agentId : meta.agentId ?? null,
    isActive: input.isActive !== undefined ? input.isActive : meta.isActive !== false,
  };

  // Si cambia el contenido, se reemplazan los chunks completos
  if (input.contentText !== undefined) {
    const chunks = splitIntoChunks(input.contentText);
    if (chunks.length === 0) throw new AppError("El documento no tiene contenido", 400);
    await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((content) => ({ tenantId, documentId: id, content })),
    });
  }

  const doc = await prisma.knowledgeDocument.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.fileName !== undefined ? { fileName: input.fileName?.trim() || "manual.txt" } : {}),
      metadata: newMeta,
      status: "READY",
    },
    include: { chunks: { select: { content: true }, orderBy: { createdAt: "asc" } } },
  });

  return serializeDocument(doc);
}

export async function deleteDocument(tenantId: string, id: string) {
  await getOwnDocument(tenantId, id);
  await prisma.knowledgeDocument.delete({ where: { id } });
  return { deleted: true };
}

// ─── Búsqueda para el agente IA ──────────────────────────────────────────────

export interface KnowledgeExcerpt {
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
}

const MAX_EXCERPTS = 3;
const EXCERPT_CHARS = 500;
const MAX_TOTAL_CHARS = 1400;

/**
 * Búsqueda simple por coincidencia de tokens en título + contenido, filtrada
 * por tenant y agente (documentos globales o del agente). Devuelve extractos
 * cortos alrededor de la primera coincidencia, con tope total de caracteres.
 */
export async function searchKnowledge(
  tenantId: string,
  agentId: string | null,
  query: string
): Promise<KnowledgeExcerpt[]> {
  const queryTokens = tokenize(normalizeText(query)).filter((t) => t.length >= 3);
  if (queryTokens.length === 0) return [];

  const docs = await prisma.knowledgeDocument.findMany({
    where: { tenantId, status: "READY" },
    include: { chunks: { select: { content: true }, orderBy: { createdAt: "asc" } } },
  });

  const results: KnowledgeExcerpt[] = [];

  for (const doc of docs) {
    const meta = metaOf(doc.metadata);
    if (meta.isActive === false) continue;
    if (meta.agentId && agentId && meta.agentId !== agentId) continue;
    if (meta.agentId && !agentId) continue;

    const titleNorm = normalizeText(doc.title);
    let bestChunk: { content: string; hits: number } | null = null;

    for (const chunk of doc.chunks) {
      const contentNorm = normalizeText(chunk.content);
      const hits = queryTokens.filter(
        (t) => contentNorm.includes(t) || titleNorm.includes(t)
      ).length;
      if (hits > 0 && (!bestChunk || hits > bestChunk.hits)) {
        bestChunk = { content: chunk.content, hits };
      }
    }

    if (!bestChunk) continue;

    // Extracto alrededor de la primera coincidencia
    const contentNorm = normalizeText(bestChunk.content);
    const firstToken = queryTokens.find((t) => contentNorm.includes(t));
    const idx = firstToken ? Math.max(0, contentNorm.indexOf(firstToken) - 120) : 0;
    const excerpt = bestChunk.content.slice(idx, idx + EXCERPT_CHARS).trim();

    results.push({
      documentId: doc.id,
      title: doc.title,
      excerpt,
      score: bestChunk.hits / queryTokens.length,
    });
  }

  results.sort((a, b) => b.score - a.score);

  // Tope de extractos y de caracteres totales (el prompt no debe crecer sin control)
  const limited: KnowledgeExcerpt[] = [];
  let total = 0;
  for (const r of results.slice(0, MAX_EXCERPTS)) {
    if (total + r.excerpt.length > MAX_TOTAL_CHARS) break;
    limited.push(r);
    total += r.excerpt.length;
  }
  return limited;
}
