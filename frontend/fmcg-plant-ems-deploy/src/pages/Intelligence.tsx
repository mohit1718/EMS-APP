import { go } from '../store';
import { Analytics, Insights, Losses } from './Analytics';

const TILES = [
  { key: 'analytics', ico: '∿', title: 'Energy Analytics', desc: 'Trends, load profiles, heatmaps and comparisons across any meter or asset' },
  { key: 'insights', ico: '✦', title: 'Energy Insights', desc: 'Rule-based findings with the calculation, impact in ₹ and suggested action' },
  { key: 'losses', ico: '⚠', title: 'Energy Losses', desc: 'Idle, standby, distribution and unaccounted energy with cost of each loss' },
] as const;
export type IntelTab = (typeof TILES)[number]['key'];

export default function Intelligence({ tab }: { tab: IntelTab }) {
  return (
    <>
      <div className="intel-tiles" role="tablist" aria-label="Energy Intelligence">
        {TILES.map((t) => {
          const on = t.key === tab;
          return (
            <button key={t.key} role="tab" aria-selected={on} className={'intel-tile' + (on ? ' on' : '')} onClick={() => go('#/intelligence/' + t.key)}>
              <span className="it-ico">{t.ico}</span>
              <span className="it-body">
                <span className="it-title">{t.title}</span>
                <span className="it-desc">{t.desc}</span>
              </span>
              <span className="it-check" aria-hidden>{on ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      {tab === 'analytics' ? <Analytics /> : tab === 'insights' ? <Insights /> : <Losses />}
    </>
  );
}
