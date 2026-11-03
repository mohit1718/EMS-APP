import { useState } from 'react';
import { PERSONAS, useStore } from '../store';

const GRAD = ['#4f8ff7', '#22c3e6', '#8b7cf6', '#2dd4bf', '#f5a524', '#a3e635', '#f472b6', '#60a5fa', '#94a3b8'];

export default function Login() {
  const { setPersona } = useStore();
  const [sel, setSel] = useState(PERSONAS[0].key);
  const p = PERSONAS.find((x) => x.key === sel)!;
  const idx = PERSONAS.indexOf(p);
  return (
    <div className="login">
      <div className="login-l login-l-min">
        <h1>Energy Management Applications</h1>
        <div className="login-demo">Demo App</div>
      </div>
      <div className="login-r">
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); setPersona(p); }}>
          <h2 style={{ margin: 0, fontSize: 21 }}>Sign in</h2>
          <div className="muted" style={{ marginTop: 4 }}>Select your login profile.</div>
          <label className="lg-label" htmlFor="profile">Login profile</label>
          <select id="profile" className="lg-select" value={sel} onChange={(e) => setSel(e.target.value)} autoFocus>
            {PERSONAS.map((x) => <option key={x.key} value={x.key}>{x.title} · {x.name}</option>)}
          </select>
          <div className="lg-who">
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 15, background: `linear-gradient(135deg, ${GRAD[idx % GRAD.length]}, #e7eefc)` }}>{p.title.split(/[\s/]+/).map((w) => w[0]).join('').slice(0, 2)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650, fontSize: 15 }}>{p.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{p.name}</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <input aria-label="Username" value={p.name.toLowerCase().replace(/[^a-z]+/g, '.')} readOnly style={{ flex: 1 }} />
            <input aria-label="Password" type="password" value="demo-demo" readOnly style={{ flex: 1 }} />
          </div>
          <button type="submit" className="btn primary lg-submit">Sign in as {p.title} →</button>
        </form>
      </div>
    </div>
  );
}
