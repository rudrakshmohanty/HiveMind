/**
 * API client for the Ollama Chat backend.
 */

export async function fetchModels(baseURL) {
  const resp = await fetch(`${baseURL}/models`);
  if (!resp.ok) throw new Error('Failed to fetch models');
  return resp.json();
}

export async function fetchStatus(baseURL) {
  const resp = await fetch(`${baseURL}/status`);
  if (!resp.ok) throw new Error('Failed to fetch status');
  return resp.json();
}

export async function fetchConversations(baseURL) {
  const resp = await fetch(`${baseURL}/conversations`);
  if (!resp.ok) throw new Error('Failed to fetch conversations');
  return resp.json();
}

export async function fetchConversation(baseURL, id) {
  const resp = await fetch(`${baseURL}/conversations/${id}`);
  if (!resp.ok) throw new Error('Failed to fetch conversation');
  return resp.json();
}

export async function createConversation(baseURL, data = {}) {
  const params = new URLSearchParams();

  if (data.title !== undefined) params.set('title', data.title);
  if (data.model !== undefined) params.set('model', data.model);
  if (data.temperature !== undefined) params.set('temperature', String(data.temperature));
  if (data.top_p !== undefined) params.set('top_p', String(data.top_p));
  if (data.max_tokens !== undefined) params.set('max_tokens', String(data.max_tokens));

  const query = params.toString();
  const resp = await fetch(`${baseURL}/conversations${query ? `?${query}` : ''}`, {
    method: 'POST',
  });
  if (!resp.ok) throw new Error('Failed to create conversation');
  return resp.json();
}

export async function deleteConversation(baseURL, id) {
  const resp = await fetch(`${baseURL}/conversations/${id}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('Failed to delete conversation');
  return resp.json();
}

export async function sendMessage(baseURL, data) {
  const resp = await fetch(`${baseURL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chat error (${resp.status}): ${text}`);
  }
  return resp.json();
}

export async function sendMessageStream(baseURL, data) {
  const resp = await fetch(`${baseURL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chat error (${resp.status}): ${text}`);
  }
  return resp.body;
}
