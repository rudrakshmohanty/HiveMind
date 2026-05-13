/**
 * API client for the HiveMind backend.
 */

const STATUS_HINTS = {
  400: 'Invalid request — check your input',
  401: 'Unauthorized',
  404: 'Not found',
  422: 'Invalid data — check your input',
  500: 'Server error — check backend logs',
  502: 'Ollama is unreachable — run `ollama serve` in a terminal',
  503: 'Service unavailable — try again in a moment',
  504: 'Gateway timeout — Ollama took too long to respond',
};

async function extractError(resp, fallback) {
  try {
    const body = await resp.clone().json();
    const msg = body.detail || body.message || body.error;
    if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
  } catch {}
  try {
    const text = await resp.clone().text();
    if (text && text.length < 300 && !text.startsWith('<')) return text;
  } catch {}
  return STATUS_HINTS[resp.status] || fallback || `HTTP ${resp.status}`;
}

export async function fetchModels(baseURL) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/models`);
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch models'));
  return resp.json();
}

export async function fetchStatus(baseURL) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/status`);
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch status'));
  return resp.json();
}

export async function fetchConversations(baseURL) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/conversations`);
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to load conversations'));
  return resp.json();
}

export async function fetchConversation(baseURL, id) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/conversations/${id}`);
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (resp.status === 404) throw new Error('Conversation not found — it may have been deleted');
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to load conversation'));
  return resp.json();
}

export async function createConversation(baseURL, data = {}) {
  const params = new URLSearchParams();

  if (data.title !== undefined) params.set('title', data.title);
  if (data.model !== undefined) params.set('model', data.model);
  if (data.temperature !== undefined) params.set('temperature', String(data.temperature));
  if (data.top_p !== undefined) params.set('top_p', String(data.top_p));
  if (data.max_tokens !== undefined) params.set('max_tokens', String(data.max_tokens));
  if (data.assistant_id) params.set('assistant_id', data.assistant_id);
  if (data.assistant_name) params.set('assistant_name', data.assistant_name);

  const query = params.toString();
  let resp;
  try {
    resp = await fetch(`${baseURL}/conversations${query ? `?${query}` : ''}`, { method: 'POST' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to create conversation'));
  return resp.json();
}

export async function renameConversation(baseURL, id, title) {
  const params = new URLSearchParams({ title });
  let resp;
  try {
    resp = await fetch(`${baseURL}/conversations/${id}?${params}`, { method: 'PATCH' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to rename conversation'));
  return resp.json();
}

export async function deleteConversation(baseURL, id) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/conversations/${id}`, { method: 'DELETE' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (resp.status === 404) throw new Error('Conversation already deleted or not found');
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to delete conversation'));
  return resp.json();
}

export async function sendMessage(baseURL, data) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Chat request failed'));
  return resp.json();
}

export async function sendMessageStream(baseURL, data) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (resp.status === 502) throw new Error('Ollama is unreachable — run `ollama serve` in a terminal');
  if (resp.status === 404) {
    const msg = await extractError(resp, 'Model or conversation not found');
    throw new Error(msg);
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Streaming chat failed'));
  return resp.body;
}

// ---------------------------------------------------------------------------
// Assistant (RAG codespace) API
// ---------------------------------------------------------------------------

export async function fetchAssistants(baseURL) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants`);
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch assistants'));
  return resp.json();
}

export async function createAssistant(baseURL, data) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) {
    const msg = await extractError(resp, 'Failed to create assistant');
    throw new Error(msg);
  }
  return resp.json();
}

export async function updateAssistant(baseURL, id, data) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) {
    const msg = await extractError(resp, 'Failed to update assistant');
    throw new Error(msg);
  }
  return resp.json();
}

export async function deleteAssistant(baseURL, id) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants/${id}`, { method: 'DELETE' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to delete assistant'));
  return resp.json();
}

export async function addPathToAssistant(baseURL, id, path) {
  const params = new URLSearchParams({ path });
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants/${id}/add-path?${params}`, { method: 'POST' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to add path'));
  return resp.json();
}

export async function removePathFromAssistant(baseURL, id, path) {
  const params = new URLSearchParams({ path });
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants/${id}/add-path?${params}`, { method: 'DELETE' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to remove path'));
  return resp.json();
}

export async function triggerIndex(baseURL, id, force = false) {
  const url = `${baseURL}/assistants/${id}/index${force ? '?force=true' : ''}`;
  let resp;
  try {
    resp = await fetch(url, { method: 'POST' });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to start indexing'));
  return resp.json();
}

export async function fetchIndexStatus(baseURL, id) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/assistants/${id}/index/status`);
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch index status'));
  return resp.json();
}
