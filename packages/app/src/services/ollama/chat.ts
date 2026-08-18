/**
 * Local chat sessions against Ollama's /api/chat: streamed responses,
 * editable system prompt, documented/validated generation parameters,
 * stop/cancel, retry, multi-session history, and redacted export.
 *
 * Everything here stays on this machine: sessions are persisted through
 * the same local JsonStore every other main-process record uses, nothing
 * is transmitted anywhere but the loopback Ollama server, and export
 * output is scrubbed for anything that looks like a credential before it
 * ever leaves this module.
 */

import crypto from 'node:crypto';
import { JsonStore } from '../../store';
import { LoopbackClient } from './loopback-client';
import type {
  ChatGenerationParams,
  ChatMessage,
  ChatRole,
  ChatSession,
  ChatSessionSummary,
} from './types';

const MAX_MESSAGE_CHARS = 32_000;
const MAX_SYSTEM_PROMPT_CHARS = 8_000;
const MAX_MESSAGES_PER_SESSION = 2_000;
const MAX_SESSIONS = 200;

function newId(): string {
  return crypto.randomUUID();
}

function clampText(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export function validateGenerationParams(params: ChatGenerationParams): {
  valid: ChatGenerationParams;
  errors: string[];
} {
  const errors: string[] = [];
  const valid: ChatGenerationParams = {};

  const checkRange = (
    key: keyof ChatGenerationParams,
    value: number | undefined,
    min: number,
    max: number,
  ): number | undefined => {
    if (value === undefined) return undefined;
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${key} must be a number between ${min} and ${max}.`);
      return undefined;
    }
    return value;
  };

  valid.temperature = checkRange('temperature', params.temperature, 0, 2);
  valid.topP = checkRange('topP', params.topP, 0, 1);
  valid.topK = checkRange('topK', params.topK, 1, 1000);
  valid.repeatPenalty = checkRange('repeatPenalty', params.repeatPenalty, 0, 5);
  valid.numCtx = checkRange('numCtx', params.numCtx, 256, 131_072);
  valid.seed = checkRange('seed', params.seed, 0, 2_147_483_647);

  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface ChatStoreShape {
  sessions: ChatSession[];
}

class ChatStore {
  private readonly store: JsonStore<ChatStoreShape>;

  constructor() {
    this.store = new JsonStore<ChatStoreShape>({
      fileName: 'ollama-chat-sessions.json',
      schemaVersion: 1,
      defaultValue: () => ({ sessions: [] }),
    });
  }

  async list(): Promise<ChatSession[]> {
    return (await this.store.load()).sessions;
  }

  async get(id: string): Promise<ChatSession | null> {
    return (await this.list()).find((s) => s.id === id) ?? null;
  }

  async upsert(session: ChatSession): Promise<void> {
    const sessions = await this.list();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    await this.store.save({ sessions: sessions.slice(0, MAX_SESSIONS) });
  }

  async remove(id: string): Promise<void> {
    const sessions = await this.list();
    await this.store.save({ sessions: sessions.filter((s) => s.id !== id) });
  }
}

// ---------------------------------------------------------------------------
// Redaction for export
// ---------------------------------------------------------------------------

/** Heuristic, best-effort scrub for text that looks like a credential
 * before it is ever written to an export file. This is a safety net, not
 * a guarantee - chat content is free text a user typed or a model
 * generated, and neither is a structured credential store. */
const SECRET_LOOKING_PATTERNS: RegExp[] = [
  /\b(sk|pk)-[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/g,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT-shaped
];

export function redactSecretsLikeText(text: string): string {
  let out = text;
  for (const pattern of SECRET_LOOKING_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

interface ChatDeltaLine {
  message?: { role?: unknown; content?: unknown };
  done?: unknown;
  error?: unknown;
}

export class ChatManager {
  private readonly store = new ChatStore();
  private readonly abortControllers = new Map<string, AbortController>();

  async listSessions(): Promise<ChatSessionSummary[]> {
    const sessions = await this.store.list();
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      model: s.model,
      messageCount: s.messages.length,
      updatedAt: s.updatedAt,
    }));
  }

  async getSession(id: string): Promise<ChatSession | null> {
    return this.store.get(id);
  }

  async createSession(
    model: string,
    systemPrompt: string,
    params: ChatGenerationParams,
    title?: string,
  ): Promise<ChatSession> {
    const { valid, errors } = validateGenerationParams(params);
    if (errors.length > 0) {
      throw new Error(`Invalid chat generation parameters: ${errors.join(' ')}`);
    }
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: newId(),
      title: title && title.trim().length > 0 ? title.trim() : 'New chat',
      model,
      systemPrompt: clampText(systemPrompt, MAX_SYSTEM_PROMPT_CHARS),
      params: valid,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.upsert(session);
    return session;
  }

  async renameSession(id: string, title: string): Promise<void> {
    const session = await this.store.get(id);
    if (!session) throw new Error(`Chat session ${id} does not exist.`);
    session.title = clampText(title.trim() || 'Untitled chat', 200);
    session.updatedAt = new Date().toISOString();
    await this.store.upsert(session);
  }

  async updateSystemPrompt(id: string, systemPrompt: string): Promise<void> {
    const session = await this.store.get(id);
    if (!session) throw new Error(`Chat session ${id} does not exist.`);
    session.systemPrompt = clampText(systemPrompt, MAX_SYSTEM_PROMPT_CHARS);
    session.updatedAt = new Date().toISOString();
    await this.store.upsert(session);
  }

  async updateParams(id: string, params: ChatGenerationParams): Promise<void> {
    const session = await this.store.get(id);
    if (!session) throw new Error(`Chat session ${id} does not exist.`);
    const { valid, errors } = validateGenerationParams(params);
    if (errors.length > 0) {
      throw new Error(`Invalid chat generation parameters: ${errors.join(' ')}`);
    }
    session.params = valid;
    session.updatedAt = new Date().toISOString();
    await this.store.upsert(session);
  }

  async deleteSession(id: string): Promise<void> {
    this.stop(id);
    await this.store.remove(id);
  }

  /** Cancels any in-flight generation for this session. Safe to call when
   * nothing is running. */
  stop(sessionId: string): void {
    this.abortControllers.get(sessionId)?.abort();
  }

  /**
   * Sends a user message and streams the assistant's reply. `onDelta` is
   * called with the accumulated assistant text after every chunk. The
   * session is persisted once generation finishes (successfully,
   * cancelled, or failed) so a crash mid-stream never corrupts history -
   * it simply loses the in-flight reply, which is recoverable via retry.
   */
  async sendMessage(
    sessionId: string,
    client: LoopbackClient,
    userContent: string,
    onDelta?: (accumulatedContent: string) => void,
  ): Promise<ChatMessage> {
    const session = await this.store.get(sessionId);
    if (!session) throw new Error(`Chat session ${sessionId} does not exist.`);
    if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
      throw new Error(
        `This chat has reached its ${MAX_MESSAGES_PER_SESSION}-message limit. Start a new chat to continue.`,
      );
    }

    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: clampText(userContent, MAX_MESSAGE_CHARS),
      createdAt: new Date().toISOString(),
      complete: true,
    };
    session.messages.push(userMessage);
    await this.store.upsert(session);

    return this.generateAssistantReply(session, client, onDelta);
  }

  /** Regenerates the most recent assistant reply (e.g. after a failure or
   * on user request), replacing it in place. */
  async retryLast(
    sessionId: string,
    client: LoopbackClient,
    onDelta?: (accumulatedContent: string) => void,
  ): Promise<ChatMessage> {
    const session = await this.store.get(sessionId);
    if (!session) throw new Error(`Chat session ${sessionId} does not exist.`);
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === 'assistant') {
      session.messages.pop();
    }
    await this.store.upsert(session);
    return this.generateAssistantReply(session, client, onDelta);
  }

  private async generateAssistantReply(
    session: ChatSession,
    client: LoopbackClient,
    onDelta?: (accumulatedContent: string) => void,
  ): Promise<ChatMessage> {
    const assistantMessage: ChatMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      complete: false,
    };
    session.messages.push(assistantMessage);

    const controller = new AbortController();
    this.abortControllers.set(session.id, controller);

    const requestMessages: Array<{ role: ChatRole; content: string }> = [];
    if (session.systemPrompt.trim().length > 0) {
      requestMessages.push({ role: 'system', content: session.systemPrompt });
    }
    for (const m of session.messages.slice(0, -1)) {
      requestMessages.push({ role: m.role, content: m.content });
    }

    const options: Record<string, number> = {};
    if (session.params.temperature !== undefined) options.temperature = session.params.temperature;
    if (session.params.topP !== undefined) options.top_p = session.params.topP;
    if (session.params.topK !== undefined) options.top_k = session.params.topK;
    if (session.params.repeatPenalty !== undefined) options.repeat_penalty = session.params.repeatPenalty;
    if (session.params.numCtx !== undefined) options.num_ctx = session.params.numCtx;
    if (session.params.seed !== undefined) options.seed = session.params.seed;

    try {
      await client.requestStream<ChatDeltaLine>(
        'POST',
        '/api/chat',
        { model: session.model, messages: requestMessages, stream: true, options },
        (line) => {
          if (typeof line.error === 'string' && line.error.length > 0) {
            throw new Error(line.error);
          }
          const chunk = line.message && typeof line.message.content === 'string'
            ? line.message.content
            : '';
          if (chunk.length > 0) {
            assistantMessage.content = clampText(assistantMessage.content + chunk, MAX_MESSAGE_CHARS);
            onDelta?.(assistantMessage.content);
          }
        },
        controller.signal,
      );
      assistantMessage.complete = true;
    } catch (err) {
      assistantMessage.complete = true;
      assistantMessage.error = controller.signal.aborted
        ? 'Generation was stopped.'
        : err instanceof Error
          ? err.message
          : String(err);
    } finally {
      this.abortControllers.delete(session.id);
      session.updatedAt = new Date().toISOString();
      await this.store.upsert(session);
    }
    return assistantMessage;
  }

  /**
   * Exports a session as JSON with any credential-shaped text scrubbed.
   * The export always states plainly that scrubbing is heuristic and
   * best-effort, since chat content is free text rather than a structured
   * secret store.
   */
  async exportSessionRedacted(id: string): Promise<string> {
    const session = await this.store.get(id);
    if (!session) throw new Error(`Chat session ${id} does not exist.`);
    const redacted: ChatSession = {
      ...session,
      systemPrompt: redactSecretsLikeText(session.systemPrompt),
      messages: session.messages.map((m) => ({
        ...m,
        content: redactSecretsLikeText(m.content),
      })),
    };
    return JSON.stringify(
      {
        exportNote:
          'Text resembling common credential formats (API keys, bearer tokens, JWTs) has been replaced with [redacted]. This is a best-effort heuristic, not a guarantee - review before sharing.',
        session: redacted,
      },
      null,
      2,
    );
  }
}
