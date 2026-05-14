/**
 * API client for the HiveMind backend.
 * All authenticated calls attach the JWT from localStorage automatically.
 */

const STATUS_HINTS = {
  400: 'Invalid request — check your input',
  401: 'Session expired — please log in again',
  403: 'Access denied',
  404: 'Not found',
  422: 'Invalid data — check your input',
  500: 'Server error — check backend logs',
  502: 'Ollama is unreachable — run `ollama serve` in a terminal',
  503: 'Service unavailable — try again in a moment',
  504: 'Gateway timeout — Ollama took too long to respond',
};

function getToken() {
  return localStorage.getItem('hm.token');
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : extra;
}

function handleUnauthorized() {
  localStorage.removeItem('hm.token');
  localStorage.removeItem('hm.user');
  window.dispatchEvent(new Event('hm:unauthorized'));
}

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

// Authenticated fetch — auto-fires hm:unauthorized on 401
async function authFetch(url, options = {}) {
  const resp = await fetch(url, { ...options, headers: { ...authHeaders(), ...options.headers } });
  if (resp.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired — please log in again');
  }
  return resp;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function authRegister(baseURL, data) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Registration failed'));
  return resp.json();
}

export async function authLogin(baseURL, data) {
  let resp;
  try {
    resp = await fetch(`${baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Login failed'));
  return resp.json();
}

export async function authMe(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/auth/me`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch user'));
  return resp.json();
}

// ---------------------------------------------------------------------------
// Models / status
// ---------------------------------------------------------------------------

export async function fetchModels(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/models`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch models'));
  return resp.json();
}

export async function fetchStatus(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/status`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch status'));
  return resp.json();
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function fetchConversations(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/conversations`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to load conversations'));
  return resp.json();
}

export async function fetchConversation(baseURL, id) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/conversations/${id}`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
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
    resp = await authFetch(`${baseURL}/conversations${query ? `?${query}` : ''}`, { method: 'POST' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to create conversation'));
  return resp.json();
}

export async function renameConversation(baseURL, id, title) {
  const params = new URLSearchParams({ title });
  let resp;
  try {
    resp = await authFetch(`${baseURL}/conversations/${id}?${params}`, { method: 'PATCH' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to rename conversation'));
  return resp.json();
}

export async function deleteConversation(baseURL, id) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/conversations/${id}`, { method: 'DELETE' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (resp.status === 404) throw new Error('Conversation already deleted or not found');
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to delete conversation'));
  return resp.json();
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendMessage(baseURL, data) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Chat request failed'));
  return resp.json();
}

export async function sendMessageStream(baseURL, data) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (resp.status === 502) throw new Error('Ollama is unreachable — run `ollama serve` in a terminal');
  if (resp.status === 404) throw new Error(await extractError(resp, 'Model or conversation not found'));
  if (!resp.ok) throw new Error(await extractError(resp, 'Streaming chat failed'));
  return resp.body;
}

// ---------------------------------------------------------------------------
// Assistants (RAG)
// ---------------------------------------------------------------------------

export async function fetchAssistants(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch assistants'));
  return resp.json();
}

export async function createAssistant(baseURL, data) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to create assistant'));
  return resp.json();
}

export async function updateAssistant(baseURL, id, data) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to update assistant'));
  return resp.json();
}

export async function deleteAssistant(baseURL, id) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants/${id}`, { method: 'DELETE' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to delete assistant'));
  return resp.json();
}

export async function addPathToAssistant(baseURL, id, path) {
  const params = new URLSearchParams({ path });
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants/${id}/add-path?${params}`, { method: 'POST' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to add path'));
  return resp.json();
}

export async function removePathFromAssistant(baseURL, id, path) {
  const params = new URLSearchParams({ path });
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants/${id}/add-path?${params}`, { method: 'DELETE' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to remove path'));
  return resp.json();
}

export async function triggerIndex(baseURL, id, force = false) {
  const url = `${baseURL}/assistants/${id}/index${force ? '?force=true' : ''}`;
  let resp;
  try {
    resp = await authFetch(url, { method: 'POST' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to start indexing'));
  return resp.json();
}

export async function fetchIndexStatus(baseURL, id) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants/${id}/index/status`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch index status'));
  return resp.json();
}

export async function fetchIndexedFiles(baseURL, id) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/assistants/${id}/files`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch file list'));
  return resp.json();
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminFetchUsers(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/admin/users`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch users'));
  return resp.json();
}

export async function adminDeleteUser(baseURL, userId) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/admin/users/${userId}`, { method: 'DELETE' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to delete user'));
  return resp.json();
}

export async function adminSetRole(baseURL, userId, role) {
  const params = new URLSearchParams({ role });
  let resp;
  try {
    resp = await authFetch(`${baseURL}/admin/users/${userId}/role?${params}`, { method: 'PATCH' });
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to update role'));
  return resp.json();
}

export async function adminFetchStats(baseURL) {
  let resp;
  try {
    resp = await authFetch(`${baseURL}/admin/stats`);
  } catch (e) {
    if (e.message.includes('Session expired')) throw e;
    throw new Error('Cannot reach backend — is the server running?');
  }
  if (!resp.ok) throw new Error(await extractError(resp, 'Failed to fetch stats'));
  return resp.json();
}
