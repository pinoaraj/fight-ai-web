'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Evidence = { time: string; title: string; observation: string; correction: string };
type Report = {
  mode: 'real' | 'demo';
  provider: string;
  usedInReport: boolean;
  summary: string;
  strengths: string[];
  priorities: string[];
  opponent: string[];
  plan: string[];
  drills: string[];
  evidence: Evidence[];
};

const demo: Report = {
  mode: 'demo',
  provider: 'Sin proveedor',
  usedInReport: false,
  summary: 'Vista de demostración del formato de reporte. No corresponde a un análisis ejecutado por IA.',
  strengths: ['Presión con intención', 'Cambios de nivel para salir de la línea', 'Capacidad de llevar al rival hacia atrás'],
  priorities: ['Preparar mejor las entradas', 'Acercar los pies antes de comprometer el torso', 'Recuperar una base compacta después del cambio de nivel'],
  opponent: ['La mano adelantada gana valor cuando tiene espacio', 'Bajo presión tiende a elevar la guardia', 'La salida lateral debe cortarse en vez de perseguirse en línea'],
  plan: ['Finta → parry/slip → paso corto', 'Doble jab o jab al pecho → cuerpo → cabeza', 'Cerrar la salida lateral y terminar con pivote'],
  drills: ['Doble jab + cuerpo + pivote · 3×2 min', 'Parry/slip + respuesta de máximo 2 golpes + salida · 3×2 min', 'Cortar ring sin perseguir en línea · 3×2 min'],
  evidence: [
    { time: '00:34', title: 'Entrada desde distancia larga', observation: 'La línea central queda disponible mientras el rival puede usar su mano adelantada.', correction: 'Finta o defensa de jab antes de ganar el paso.' },
    { time: '00:52', title: 'Torso por delante de la base', observation: 'La intención de potencia aparece antes de que los pies terminen de cerrar distancia.', correction: 'Primero acercar la base; después lanzar desde una posición recuperable.' },
    { time: '01:17', title: 'Base muy abierta tras cambio de nivel', observation: 'La idea defensiva saca la cabeza de línea, pero la postura tarda en recuperarse.', correction: 'Recoger los pies y salir por ángulo inmediatamente.' },
  ],
};

export default function Home() {
  const [video, setVideo] = useState<File | null>(null);
  const [fighter, setFighter] = useState('Guantes rojos');
  const [sport, setSport] = useState<'boxing' | 'kickboxing'>('boxing');
  const [stance, setStance] = useState<'orthodox' | 'southpaw' | 'switch'>('orthodox');
  const [report, setReport] = useState<Report | null>(null);
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [reviewFocus, setReviewFocus] = useState('full');
  const [intensity, setIntensity] = useState('moderate');
  const [activeTab, setActiveTab] = useState<'home' | 'sessions' | 'analyze' | 'progress' | 'profile'>('analyze');
  const [processingStep, setProcessingStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useMemo(() => (video ? URL.createObjectURL(video) : ''), [video]);
  useEffect(() => {
    if (!busy) { setProcessingStep(0); return; }
    const id = setInterval(() => setProcessingStep(v => Math.min(4, v + 1)), 3200);
    return () => clearInterval(id);
  }, [busy]);

  async function analyze() {
    if (!video) return setError('Selecciona un video antes de analizar.');
    setBusy(true); setError(''); setReport(null);
    try {
      const body = new FormData();
      body.append('video', video);
      body.append('language', language);
      body.append('review_focus', reviewFocus);
      body.append('intensity', intensity);
      body.append('sport', sport);
      body.append('stance', stance);
      body.append('athlete_marker', fighter === 'Guantes rojos' ? 'red_gloves' : 'visual_reid');
      if (fighter === 'Guantes rojos') body.append('glove_color', 'red');
      if (fighter === 'Guantes azules') body.append('glove_color', 'blue');
      const response = await fetch('/api/analyze', { method: 'POST', body });
      const raw = await response.text();
      let data: Report | { error?: string } | null = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

      if (!response.ok) {
        const serverMessage = data && 'error' in data && typeof data.error === 'string' ? data.error : '';
        const contentType = response.headers.get('content-type') || '';
        const upstreamHtml = contentType.includes('text/html') || raw.trim().startsWith('<');
        if (serverMessage) throw new Error(serverMessage);
        if (upstreamHtml) throw new Error(`El servidor interrumpió el análisis (HTTP ${response.status}). El video pudo exceder el tiempo o recursos disponibles. Fight AI registró este fallo para corrección.`);
        throw new Error(`No se pudo ejecutar el análisis (HTTP ${response.status}).`);
      }

      if (!data || !('summary' in data) || typeof data.summary !== 'string') {
        throw new Error('El servidor respondió sin un reporte válido.');
      }
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally { setBusy(false); }
  }

  function jump(time: string) {
    const node = videoRef.current;
    if (!node) return;
    const [m, s] = time.split(':').map(Number);
    node.currentTime = m * 60 + s;
    node.play().catch(() => undefined);
  }

  return (
    <main>
      <header className="topbar">
        <div className="mobileSafeBar" />
        <div className="brand"><span className="mark">FA</span><div><b>FIGHT AI</b><small>SPARRING ANALYST</small></div></div>
        <div className="headerRight"><div className="status"><span className="dot"/> MOTOR LISTO · IA SEGÚN REPORTE</div><div className="langToggle"><button className={language === 'es' ? 'active' : ''} onClick={() => setLanguage('es')}>ES</button><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button></div></div>
      </header>

      <nav className="desktopNav">
        {[
          ['home','⌂','Inicio'],['sessions','◷','Sesiones'],['analyze','＋','Analizar'],['progress','↗','Progreso'],['profile','◎','Perfil']
        ].map(([id,icon,label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id as typeof activeTab)}><span>{icon}</span>{label}</button>)}
      </nav>
      <section className="hero">
        <div>
          <span className="eyebrow">BOXING · KICKBOXING · STRIKING</span>
          <h1>Convierte tu sparring en<br/><em>decisiones entrenables.</em></h1>
          <p>Sube un round, identifica al peleador y recibe correcciones, estrategia, drills y evidencia reproducible por timestamp.</p>
        </div>
        <div className="heroCard"><b>PRINCIPIO DEL PRODUCTO</b><span>Menos métricas inventadas.<br/>Más evidencia visible y acciones concretas.</span></div>
      </section>

      {activeTab !== 'analyze' ? <section className="mobileMirrorPanel panel">
        <span className="eyebrow">{activeTab.toUpperCase()}</span>
        <h2>{activeTab === 'home' ? (language === 'es' ? '¿Listo para revisar tu sparring?' : 'Ready to review your sparring?') : activeTab === 'sessions' ? (language === 'es' ? 'Sesiones' : 'Sessions') : activeTab === 'progress' ? (language === 'es' ? 'Progreso' : 'Progress') : (language === 'es' ? 'Perfil' : 'Profile')}</h2>
        <p>{activeTab === 'home' ? (language === 'es' ? 'Revisa hábitos repetidos y define el siguiente objetivo de entrenamiento.' : 'Review recurring habits and define the next training target.') : activeTab === 'sessions' ? (language === 'es' ? 'El historial local seguirá la misma estructura de Android.' : 'Local history follows the same Android structure.') : activeTab === 'progress' ? (language === 'es' ? 'Sin métricas falsas: solo tendencias cuando exista evidencia suficiente.' : 'No fake metrics: only trends when evidence is sufficient.') : (language === 'es' ? 'Preferencias locales de guardia, idioma y disciplina.' : 'Local stance, language and sport preferences.')}</p>
        {activeTab === 'home' && <button className="primary" onClick={() => setActiveTab('analyze')}>{language === 'es' ? 'ANALIZAR SPARRING' : 'ANALYZE SPARRING'}</button>}
        <div className="patternGrid"><div className="patternItem"><i className="hot"/><span>Post-combo defense</span><b>FOCUS</b></div><div className="patternItem"><i/><span>Lateral exits</span><b>WATCH</b></div><div className="patternItem"><i/><span>Jab variety</span><b>TRACK</b></div></div>
      </section> : <section className="workspace">
        <div className="panel uploadPanel">
          <div className="sectionTitle"><span>01</span><div><b>VIDEO</b><small>Selecciona el sparring</small></div></div>
          <input ref={inputRef} hidden type="file" accept="video/*" onChange={e => { setVideo(e.target.files?.[0] || null); setReport(null); }} />
          {!video ? (
            <button className="drop" onClick={() => inputRef.current?.click()}><strong>SUBIR VIDEO</strong><span>MP4, MOV o archivo compatible del navegador</span></button>
          ) : (
            <div className="videoWrap"><video ref={videoRef} src={videoUrl} controls/><div className="fileRow"><span>{video.name}</span><button onClick={() => inputRef.current?.click()}>Cambiar</button></div></div>
          )}

          <div className="sectionTitle fighterTitle"><span>02</span><div><b>PELEADOR OBJETIVO</b><small>La identidad se mantiene durante el análisis</small></div></div>
          <div className="fighters">
            {['Guantes rojos','Guantes azules','Otro'].map(x => <button key={x} className={fighter === x ? 'active' : ''} onClick={() => setFighter(x)}>{x}</button>)}
          </div>
          <div className="mobileSectionLabel">03 · {language === 'es' ? 'CONFIGURACIÓN' : 'SETUP'}</div>
          <div className="analysisOptions">
            <label>Disciplina<select value={sport} onChange={e => setSport(e.target.value as 'boxing' | 'kickboxing')}><option value="boxing">Boxeo</option><option value="kickboxing">Kickboxing</option></select></label>
            <label>Guardia<select value={stance} onChange={e => setStance(e.target.value as 'orthodox' | 'southpaw' | 'switch')}><option value="orthodox">Ortodoxa</option><option value="southpaw">Zurda</option><option value="switch">Switch</option></select></label>
          </div>
          <div className="optionBlock"><span>{language === 'es' ? 'Qué quieres priorizar' : 'Review focus'}</span><div className="fighters compact">{[['full','Completo'],['offense','Ataque'],['defense','Defensa'],['footwork','Footwork'],['strategy','Estrategia']].map(([id,label]) => <button key={id} className={reviewFocus === id ? 'active' : ''} onClick={() => setReviewFocus(id)}>{label}</button>)}</div></div>
          <div className="optionBlock"><span>{language === 'es' ? 'Intensidad' : 'Intensity'}</span><div className="fighters compact">{[['technical','Técnico'],['light','Suave'],['moderate','Moderado'],['hard','Fuerte']].map(([id,label]) => <button key={id} className={intensity === id ? 'active' : ''} onClick={() => setIntensity(id)}>{label}</button>)}</div></div>
          <button className="primary" disabled={busy || !video} onClick={analyze}>{busy ? 'ANALIZANDO…' : 'ANALIZAR SPARRING'}</button>
          <button className="secondary" onClick={() => { setReport(demo); setError(''); }}>VER DEMO DEL REPORTE</button>
          {busy && <div className="processingCard"><div className="spinner"/><b>{language === 'es' ? 'REVISANDO TU SPARRING' : 'REVIEWING YOUR SPARRING'}</b><div className="processingSteps">{['Preparando video','Identificando peleador','Revisando intercambios','Detectando patrones','Generando reporte'].map((x,i)=><span key={x} className={i <= processingStep ? 'done' : ''}><i/>{x}</span>)}</div><small>{language === 'es' ? 'El reporte solo eleva hallazgos con evidencia suficiente.' : 'The report only promotes findings with enough evidence.'}</small></div>}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="panel reportPanel">
          {!report ? <div className="empty"><span>03</span><h2>Tu reporte aparecerá aquí</h2><p>Los timestamps serán clickeables para volver al momento exacto del video.</p></div> : (
            <>
              <div className="reportHead"><div><span className="eyebrow">REPORTE DE COACHING</span><h2>{fighter}</h2></div><div className={report.usedInReport ? 'aiBadge on' : 'aiBadge'}><b>{report.provider}</b><small>{report.usedInReport ? (language === 'es' ? 'USADO EN REPORTE' : 'USED IN REPORT') : (language === 'es' ? 'NO USADO' : 'NOT USED')}</small></div></div>
              <p className="summary">{report.summary}</p>
              <div className="grid3">
                <Card title="FORTALEZAS" items={report.strengths}/><Card title="PRIORIDADES" items={report.priorities}/><Card title="RIVAL" items={report.opponent}/>
              </div>
              <div className="strategy"><div><h3>PLAN TÁCTICO</h3>{report.plan.map((x,i)=><p key={x}><b>0{i+1}</b>{x}</p>)}</div><div><h3>DRILLS</h3>{report.drills.map(x=><p key={x}>{x}</p>)}</div></div>
              <div className="visualCoach"><div><span className="eyebrow">{language === 'es' ? 'COACH VISUAL' : 'VISUAL COACH'}</span><h3>{language === 'es' ? 'Corrección en movimiento' : 'Movement correction'}</h3><p>{language === 'es' ? 'Secuencia simplificada ligada a la corrección prioritaria.' : 'Simplified sequence tied to the priority correction.'}</p></div><div className="visualSequence"><span>GUARD</span><b>→</b><span>ANGLE</span><b>→</b><span>EXIT</span></div><div className="trajectory"><i/><i/><i/><strong>↗</strong></div></div>
              <div className="reportActions"><button onClick={() => navigator.share?.({title:'Fight AI',text:report.summary})}>{language === 'es' ? 'COMPARTIR' : 'SHARE'}</button><button onClick={() => window.print()}>PDF</button></div>
              <h3 className="evidenceTitle">{language === 'es' ? 'EVIDENCIA DEL MOTOR' : 'ENGINE EVIDENCE'}</h3>
              <div className="evidence">{report.evidence.map(e => <button key={e.time+e.title} onClick={() => jump(e.time)}><time>{e.time}</time><div><b>{e.title}</b><span>{e.observation}</span><small>Corrección: {e.correction}</small></div></button>)}</div>
            </>
          )}
        </div>
      </section>}
      <nav className="bottomNav">{[
        ['home','⌂','Inicio'],['sessions','◷','Sesiones'],['analyze','＋','Analizar'],['progress','↗','Progreso'],['profile','◎','Perfil']
      ].map(([id,icon,label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id as typeof activeTab)}><span>{icon}</span><small>{label}</small></button>)}</nav>
      <footer>Fight AI · Herramienta de apoyo técnico. No reemplaza a un entrenador.</footer>
    </main>
  );
}

function Card({ title, items }: { title: string; items: string[] }) {
  return <div className="card"><h3>{title}</h3>{items.map(x => <p key={x}>{x}</p>)}</div>;
}
