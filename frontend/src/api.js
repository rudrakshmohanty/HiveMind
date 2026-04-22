/**
 * API client for the Ollama Chat backend.
 */

export async function fetchModels(baseURL) {
  const resp = await fetch(`${baseURL}/models`);
  if (!resp.ok) throw new Error('Failed to fetch models');
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

export async function createConversation(baseURL, title) {
  const resp = await fetch(`${baseURL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
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
  return resp.body; // readable stream
}
