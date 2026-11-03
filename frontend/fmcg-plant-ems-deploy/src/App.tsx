import { useEffect, useRef, useState } from 'react';
import { canSee, go, useRoute, useStore } from './store';
import { Sidebar, TopBar } from './components/Shell';
import Login from './pages/Login';
import Executive from './pages/Executive';
import { PlantOverview, EnergyTree, Departments } from './pages/Plant';
import { ProductionLines, LineDashboard, MachineDashboard, EnergyVsProduction, Benchmarking } from './pages/Production';
import { UtilitiesOverview, UtilityDashboard } from './pages/Utilities';
import { Electrical, Buildings } from './pages/Infra';
import { Alerts } from './pages/Analytics';
import { Cost, Carbon, Targets, Projects, Reports } from './pages/Finance';
import { Meters, AssetMaster, DataQuality, Integration, Admin } from './pages/Config';
import type { UtilityKey } from './data/assets';
import Intelligence, { IntelTab } from './pages/Intelligence';

function NoAccess() {
  const { persona } = useStore();
  return (
    <div className="no-access">
      <div className="na-ico">🔒</div>
      <h2>This page isn't part of your role</h2>
      <p className="muted">You're signed in as <b>{persona?.title}</b>. Your access covers: {persona?.desc.toLowerCase()}.</p>
      <a className="btn primary" href={persona?.landing}>Go to my dashboard →</a>
    </div>
  );
}

function Page({ route }: { route: string[] }) {
  const [p, a] = route;
  switch (p) {
    case 'exec': return <Executive />;
    case 'plant': return <PlantOverview />;
    case 'tree': return <EnergyTree />;
    case 'departments': return <Departments id={a} />;
    case 'production': return <ProductionLines />;
    case 'line': return <LineDashboard id={a ?? 'L01'} />;
    case 'machine': return <MachineDashboard id={a ?? 'L01-M01'} />;
    case 'intel': return <EnergyVsProduction />;
    case 'benchmark': return <Benchmarking />;
    case 'utilities': return a ? <UtilityDashboard k={a as UtilityKey} /> : <UtilitiesOverview />;
    case 'electrical': return <Electrical />;
    case 'buildings': return <Buildings />;
    case 'hubs': return <Buildings hubs />;
    case 'intelligence': return <Intelligence tab={(['analytics', 'insights', 'losses'].includes(a) ? a : 'analytics') as IntelTab} />;
    case 'analytics': case 'insights': case 'losses': return <Intelligence tab={p as IntelTab} />;
    case 'alerts': return <Alerts />;
    case 'cost': return <Cost />;
    case 'carbon': return <Carbon />;
    case 'targets': return <Targets />;
    case 'projects': return <Projects />;
    case 'reports': return <Reports />;
    case 'meters': return <Meters id={a} />;
    case 'assets': return <AssetMaster />;
    case 'quality': return <DataQuality />;
    case 'integration': return <Integration />;
    case 'admin': return <Admin />;
    default: return <Executive />;
  }
}

export default function App() {
  const { persona } = useStore();
  const route = useRoute();
  useEffect(() => {
    document.querySelector('.content')?.scrollTo(0, 0);
  }, [route.join('/')]);
  // After sign-in or reload, start on a page this persona is allowed to see.
  useEffect(() => {
    if (persona && !canSee(persona, '#/' + route.join('/'))) go(persona.landing);
  }, [persona?.key]);
  const appRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => { const narrow = typeof window !== 'undefined' && window.innerWidth < 1100; try { const v = localStorage.getItem('ems.sidebar'); return v ? v === 'collapsed' : narrow; } catch { return narrow; } });
  const [full, setFull] = useState(false);
  useEffect(() => { try { localStorage.setItem('ems.sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* storage unavailable */ } }, [collapsed]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey); };
  }, []);
  // Fullscreen only the application screen. Falls back to an in-page full view where the browser blocks fullscreen.
  const toggleFull = async () => {
    if (full) {
      setFull(false);
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
      return;
    }
    setFull(true);
    try { await appRef.current?.requestFullscreen?.(); } catch { /* blocked: keep in-page full view */ }
  };
  if (!persona) return <Login />;
  return (
    <div ref={appRef} className={'app' + (collapsed ? ' collapsed' : ' expanded') + (full ? ' full' : '')}>
      <Sidebar route={route} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="main">
        <TopBar full={full} onFull={toggleFull} />
        <div className="content">
          {canSee(persona, '#/' + route.join('/')) ? <Page key={route.join('/')} route={route} /> : <NoAccess />}
        </div>
      </div>
    </div>
  );
}
