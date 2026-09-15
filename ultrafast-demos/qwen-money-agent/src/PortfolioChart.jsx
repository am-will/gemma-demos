import React, { useState } from 'react';
// Illustrative intraperiod movement, anchored to the portfolio's exact endpoints.
const movement = [0,.08,.04,.14,.21,.16,.11,.19,.33,.29,.38,.31,.25,.42,.49,.44,.52,.48,.37,.43,.58,.63,.55,.69,.73,.65,.71,.82,.77,.89,.94,.87,1];
const dollars = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
export function PortfolioChart({ value, change }) {
  const [active, setActive] = useState(null);
  const start = value - change;
  const points = movement.map((fraction,i)=>({x:8+i*244/(movement.length-1),y:18+fraction*83,value:start+change*fraction}));
  const line = points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  const selected = points[active ?? points.length-1];
  return <div className="portfolio-chart">
    <div className="chart-value"><strong>{dollars(selected.value)}</strong><span>{active===null?'Brokerage balance':'Weekly sample'}</span></div>
    <svg viewBox="0 0 300 140" role="img" aria-label="Illustrative weekly brokerage chart, from $94,500 to $91,641">
      <defs><linearGradient id="portfolio-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e66c45" stopOpacity=".22"/><stop offset="100%" stopColor="#e66c45" stopOpacity="0"/></linearGradient></defs>
      {[18,59.5,101].map((y,i)=><g key={y}><line x1="8" x2="252" y1={y} y2={y} stroke="#dedbd4" strokeDasharray="3 4"/><text x="262" y={y+3}>{((start+change*i/2)/1000).toFixed(1)}k</text></g>)}
      <path d={`${line} L252,116 L8,116 Z`} fill="url(#portfolio-fill)"/>
      <path d={line} fill="none" stroke="#d9633e" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round"/>
      {active!==null&&<line x1={selected.x} x2={selected.x} y1="8" y2="116" stroke="#b4a99e" strokeDasharray="3 3"/>}
      <circle cx={selected.x} cy={selected.y} r="4" fill="#d9633e" stroke="#fff" strokeWidth="2"/>
      <text x="8" y="136">Sep 2</text><text x="112" y="136">Sep 5</text><text x="226" y="136">Sep 9</text>
      <rect x="0" y="0" width="258" height="118" fill="transparent" onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect();setActive(Math.max(0,Math.min(points.length-1,Math.round((e.clientX-box.left)/box.width*(points.length-1)))));}} onPointerLeave={()=>setActive(null)}/>
    </svg>
  </div>;
}
