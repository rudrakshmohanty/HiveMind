import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { authLogin, authRegister } from './api';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

function passwordStrength(pw) {
  if (!pw) return null;
  const hasUpper  = /[A-Z]/.test(pw);
  const hasLower  = /[a-z]/.test(pw);
  const hasDigit  = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
  const long      = pw.length >= 12;
  const score = [hasUpper, hasLower, hasDigit, hasSymbol, long].filter(Boolean).length;
  if (pw.length < 8)    return { level: 'weak',   label: 'Too short',  pct: 20 };
  if (score <= 2)       return { level: 'weak',   label: 'Weak',       pct: 33 };
  if (score === 3)      return { level: 'fair',   label: 'Fair',       pct: 60 };
  if (score === 4)      return { level: 'good',   label: 'Good',       pct: 80 };
  return               { level: 'strong', label: 'Strong',     pct: 100 };
}

// ---------------------------------------------------------------------------
// Inline validation helpers
// ---------------------------------------------------------------------------

function validateUsername(v) {
  if (!v) return null;
  if (v.length < 3) return 'At least 3 characters required';
  if (v.length > 40) return 'Max 40 characters';
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) return 'Only letters, numbers, _ and - allowed';
  return '';
}

function validateEmail(v) {
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  return '';
}

function validatePassword(v, isRegister) {
  if (!v) return null;
  if (v.length < 8) return 'At least 8 characters required';
  if (isRegister) {
    if (!/[A-Z]/.test(v)) return 'Add at least one uppercase letter';
    if (!/[a-z]/.test(v)) return 'Add at least one lowercase letter';
    if (!/\d/.test(v))    return 'Add at least one number';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function FieldHint({ error, hint }) {
  if (error)             return <span className="auth-field-hint error">{error}</span>;
  if (hint)              return <span className="auth-field-hint muted">{hint}</span>;
  return null;
}

function StrengthBar({ password }) {
  const s = passwordStrength(password);
  if (!s) return null;
  return (
    <div className="auth-strength">
      <div className="auth-strength-bar">
        <div className={`auth-strength-fill ${s.level}`} style={{ width: `${s.pct}%` }} />
      </div>
      <span className={`auth-strength-label ${s.level}`}>{s.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', identifier: '', password: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const touch = (k) => setTouched(t => ({ ...t, [k]: true }));

  // Field-level errors (only shown after blur)
  const usernameErr  = touched.username  ? validateUsername(form.username)  : null;
  const emailErr     = touched.email     ? validateEmail(form.email)        : null;
  const passwordErr  = touched.password  ? validatePassword(form.password, isRegister) : null;

  const isFormValid = isRegister
    ? validateUsername(form.username)  === '' &&
      validateEmail(form.email)        === '' &&
      validatePassword(form.password, true) === ''
    : form.identifier.trim().length > 0 && form.password.length >= 1;

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setTouched({});
    setForm({ username: '', email: '', identifier: '', password: '' });
  };

  const submit = async e => {
    e.preventDefault();
    setError('');
    // Force-touch all fields to reveal any remaining errors
    if (isRegister) setTouched({ username: true, email: true, password: true });
    if (!isFormValid) return;

    setLoading(true);
    try {
      let res;
      if (isRegister) {
        res = await authRegister(API_BASE, {
          username: form.username,
          email: form.email,
          password: form.password,
        });
      } else {
        res = await authLogin(API_BASE, { identifier: form.identifier, password: form.password });
      }
      login(res.access_token, res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <img src="/icon.png" alt="HiveMind" />
          </div>
          <div>
            <div className="auth-brand-name">Hive<span className="ac">Mind</span></div>
            <div className="auth-brand-tag">PRIVATE · LOCAL · YOURS</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>
            Sign in
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>

          {isRegister && (
            <>
              <div className="auth-field">
                <label>Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => set('username', e.target.value)}
                  onBlur={() => touch('username')}
                  placeholder="your_handle"
                  autoComplete="username"
                  className={usernameErr ? 'invalid' : touched.username && !usernameErr ? 'valid' : ''}
                />
                <FieldHint
                  error={usernameErr || undefined}
                  hint="3–40 characters · letters, numbers, _ and - only"
                />
              </div>

              <div className="auth-field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onBlur={() => touch('email')}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={emailErr ? 'invalid' : touched.email && !emailErr ? 'valid' : ''}
                />
                <FieldHint error={emailErr || undefined} />
              </div>
            </>
          )}

          {!isRegister && (
            <div className="auth-field">
              <label>Username or email</label>
              <input
                type="text"
                value={form.identifier}
                onChange={e => set('identifier', e.target.value)}
                placeholder="your_handle or you@example.com"
                autoComplete="username"
                autoFocus
              />
            </div>
          )}

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              onBlur={() => touch('password')}
              placeholder={isRegister ? 'Min 8 chars · uppercase · lowercase · number' : ''}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className={passwordErr ? 'invalid' : touched.password && !passwordErr ? 'valid' : ''}
            />
            {isRegister && <StrengthBar password={form.password} />}
            {isRegister && (
              <FieldHint
                error={passwordErr || undefined}
                hint={!touched.password ? 'Must include uppercase, lowercase, and a number' : undefined}
              />
            )}
          </div>

          {error && (
            <div className="auth-error">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.3 3.3 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/>
                <path d="M12 9v4M12 17h.01"/>
              </svg>
              {error}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {isRegister ? (
          <p className="auth-note">
            The first account created is automatically an admin.
          </p>
        ) : (
          <p className="auth-note">
            No account yet?{' '}
            <button className="auth-note-link" onClick={() => switchMode('register')}>
              Create one
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
