import React, { useEffect, useMemo, useState } from 'react';
import { adminDeleteUser, adminFetchStats, adminFetchUsers, adminSetRole } from './api';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Icons (inline — matches App.jsx style)
// ---------------------------------------------------------------------------

function Icon({ name, size = 16 }) {
  const c = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    trash:    <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    shield:   <path d="M12 2 3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7z"/>,
    user:     <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    refresh:  <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>,
    chat:     <path d="M21 12a8 8 0 0 1-11.7 7.1L4 21l1.9-5.3A8 8 0 1 1 21 12z"/>,
    cube:     <><path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></>,
    warning:  <><path d="M10.3 3.3 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></>,
    chevron:  <path d="m9 18 6-6-6-6"/>,
    x:        <path d="M18 6 6 18M6 6l12 12"/>,
    check:    <path d="m5 12 5 5L20 7"/>,
    message:  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    sort:     <path d="M3 6h18M7 12h10M11 18h2"/>,
  };
  return <svg {...c}>{paths[name] ?? null}</svg>;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, icon, sub }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-icon"><Icon name={icon} size={18} /></div>
      <div className="admin-stat-val">{value ?? '—'}</div>
      <div className="admin-stat-label">{label}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline error
// ---------------------------------------------------------------------------

function AdminError({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="admin-error-row">
      <Icon name="warning" size={13} />
      <span>{message}</span>
      <button onClick={onDismiss}><Icon name="x" size={11} /></button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [users, setUsers]     = useState([]);
  const [stats, setStats]     = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch]   = useState('');
  const [sortBy, setSortBy]   = useState('date'); // 'date' | 'name' | 'role' | 'convs'
  const [sortDir, setSortDir] = useState('desc');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [u, s] = await Promise.all([adminFetchUsers(API_BASE), adminFetchStats(API_BASE)]);
      setUsers(u);
      setStats(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (userId) => {
    try {
      await adminDeleteUser(API_BASE, userId);
      setUsers(u => u.filter(x => x.id !== userId));
      setConfirmDelete(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRoleToggle = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await adminSetRole(API_BASE, user.id, newRole);
      setUsers(u => u.map(x => x.id === user.id ? { ...x, role: newRole } : x));
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : [...users];

    list.sort((a, b) => {
      let av, bv;
      if (sortBy === 'date')  { av = new Date(a.created_at); bv = new Date(b.created_at); }
      else if (sortBy === 'name') { av = a.username.toLowerCase(); bv = b.username.toLowerCase(); }
      else if (sortBy === 'role') { av = a.role; bv = b.role; }
      else if (sortBy === 'convs') { av = a.conversation_count ?? 0; bv = b.conversation_count ?? 0; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, search, sortBy, sortDir]);

  const formatDate = (v) => {
    if (!v) return '—';
    return new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const SortBtn = ({ col, label }) => (
    <button
      className={`admin-sort-btn ${sortBy === col ? 'active' : ''}`}
      onClick={() => toggleSort(col)}
    >
      {label}
      {sortBy === col && <span className="admin-sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-header">
        <div>
          <div className="eyebrow">ADMIN</div>
          <h2>User management</h2>
        </div>
        <button className="icon-btn framed" onClick={load} title="Refresh data">
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <AdminError message={error} onDismiss={() => setError('')} />

      {/* Stats */}
      {stats && (
        <div className="admin-stats">
          <StatCard label="Users"         value={stats.users}         icon="user"    sub={`${adminCount} admin`} />
          <StatCard label="Conversations" value={stats.conversations} icon="chat"    />
          <StatCard label="Messages"      value={stats.messages}      icon="message" />
          <StatCard label="Assistants"    value={stats.assistants}    icon="cube"    />
        </div>
      )}

      {/* User list section */}
      <div className="admin-section">
        {/* Toolbar */}
        <div className="admin-toolbar">
          <div className="admin-search-wrap">
            <Icon name="search" size={13} />
            <input
              className="admin-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by username or email…"
            />
            {search && (
              <button className="admin-search-clear" onClick={() => setSearch('')}>
                <Icon name="x" size={11} />
              </button>
            )}
          </div>
          <div className="admin-sort-row">
            <Icon name="sort" size={12} />
            <SortBtn col="date"  label="Date" />
            <SortBtn col="name"  label="Name" />
            <SortBtn col="role"  label="Role" />
            <SortBtn col="convs" label="Chats" />
          </div>
        </div>

        <div className="admin-section-head">
          <span>
            {search ? `${filteredUsers.length} of ${users.length} users` : `${users.length} users`}
          </span>
          <span className="admin-count">{users.filter(u => u.role === 'admin').length} admin</span>
        </div>

        {loading ? (
          <div className="admin-loading">Loading…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="admin-empty">
            {search ? `No users matching "${search}"` : 'No users yet'}
          </div>
        ) : (
          <div className="admin-user-list">
            {filteredUsers.map(u => (
              <div key={u.id} className="admin-user-row">
                <div className="admin-user-avatar">
                  {u.username.slice(0, 2).toUpperCase()}
                </div>

                <div className="admin-user-info">
                  <div className="admin-user-name">{u.username}</div>
                  <div className="admin-user-email">{u.email}</div>
                  <div className="admin-user-meta">
                    Joined {formatDate(u.created_at)}
                    {u.conversation_count != null && (
                      <span className="admin-user-convcount">
                        <Icon name="chat" size={10} />
                        {u.conversation_count} chat{u.conversation_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="admin-user-actions">
                  <span
                    className={`admin-role-badge ${u.role}`}
                    title={`Click to make ${u.role === 'admin' ? 'regular user' : 'admin'}`}
                    onClick={() => handleRoleToggle(u)}
                  >
                    {u.role}
                  </span>

                  {confirmDelete === u.id ? (
                    <div className="admin-del-row">
                      <button className="admin-del-confirm" onClick={() => handleDelete(u.id)}>
                        <Icon name="check" size={11} /> Confirm
                      </button>
                      <button className="icon-btn" onClick={() => setConfirmDelete(null)} title="Cancel">
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="icon-btn"
                      onClick={() => setConfirmDelete(u.id)}
                      title="Delete user"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
